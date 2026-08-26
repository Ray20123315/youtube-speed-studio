(() => {
  'use strict';

  const PROTOCOL = 7;
  const VERSION = chrome.runtime.getManifest().version;
  const PAGE_CONTEXT_ATTR = 'data-ytss-page-context';
  const PAGE_CONTEXT_REQUEST_EVENT = 'ytss-request-page-context';
  const DOWNLOAD_INFO_ATTR = 'data-ytss-download-studio-info';
  const DOWNLOAD_INFO_READY_EVENT = 'ytss-download-studio-info-ready';
  const DOWNLOAD_INFO_REQUEST_EVENT = 'ytss-request-download-studio-info';
  const STATUS_KEY = 'ytssRuntimeStatus';
  const BRIDGE_KEY = '__YTSS_RECOVERY_BRIDGE__';

  const previous = globalThis[BRIDGE_KEY];
  try { previous?.dispose?.(); } catch {}
  try { delete globalThis[BRIDGE_KEY]; } catch {}

  let messageAlive = true;
  let lastTouch = Date.now();
  let handoffTimer = null;

  function extensionAlive() {
    try { return Boolean(chrome.runtime?.id); } catch { return false; }
  }

  function parseJson(value) {
    try { return value ? JSON.parse(value) : null; } catch { return null; }
  }

  function fallbackContext() {
    const url = new URL(location.href);
    const host = url.hostname.toLowerCase();
    const youtube = host === 'youtube.com' || host.endsWith('.youtube.com');
    const bilibili = host === 'bilibili.com' || host.endsWith('.bilibili.com');
    const pageType = youtube
      ? (url.pathname === '/watch' ? 'watch' : url.pathname.startsWith('/shorts/') ? 'shorts' : url.pathname.startsWith('/results') ? 'search' : 'other')
      : bilibili
        ? (/\/video\//.test(url.pathname) ? 'video' : 'other')
        : 'other';
    return {
      platform: youtube ? 'youtube' : bilibili ? 'bilibili' : 'generic',
      platformLabel: youtube ? 'YouTube' : bilibili ? 'bilibili' : 'HTML5',
      href: location.href,
      pageType,
      mode: youtube && pageType === 'shorts' ? 'shorts' : 'general',
      videoId: youtube ? (url.searchParams.get('v') || (pageType === 'shorts' ? url.pathname.split('/')[2] || null : null)) : null,
      channelKey: null,
      channelAliases: [],
      channelLabel: null,
      channelId: null,
      channelSource: 'recovery-fallback',
      playlistKey: youtube ? url.searchParams.get('list') : null,
      playlistLabel: null,
      pageTitle: document.title || ''
    };
  }

  function requestContext() {
    try { document.dispatchEvent(new Event(PAGE_CONTEXT_REQUEST_EVENT)); } catch {}
  }

  function readContext() {
    const base = fallbackContext();
    requestContext();
    const parsed = parseJson(document.documentElement?.getAttribute(PAGE_CONTEXT_ATTR));
    if (!parsed || typeof parsed !== 'object') return base;
    return {
      ...base,
      ...parsed,
      platform: base.platform,
      platformLabel: base.platformLabel,
      href: location.href,
      pageType: base.pageType,
      mode: base.mode,
      videoId: parsed.videoId || base.videoId,
      channelKey: parsed.channelKey || base.channelKey,
      channelAliases: Array.isArray(parsed.channelAliases) ? parsed.channelAliases : base.channelAliases,
      channelLabel: parsed.channelLabel || parsed.channelName || base.channelLabel,
      channelId: parsed.channelId || base.channelId,
      channelSource: parsed.channelSource || parsed.source || base.channelSource,
      playlistKey: parsed.playlistKey || base.playlistKey,
      playlistLabel: parsed.playlistLabel || base.playlistLabel,
      pageTitle: parsed.pageTitle || base.pageTitle
    };
  }

  function snapshot() {
    const context = readContext();
    return {
      ok: true,
      protocol: PROTOCOL,
      version: VERSION,
      recoveryBridge: true,
      controlsReady: false,
      context,
      diagnostics: {
        at: Date.now(),
        version: VERSION,
        protocol: PROTOCOL,
        recoveryBridge: true,
        controlsReady: false,
        href: location.href,
        context
      }
    };
  }

  function requestDownloadStudioInfo(timeoutMs = 5600) {
    return new Promise(resolve => {
      let settled = false;
      let timer = null;
      const cleanup = () => {
        clearTimeout(timer);
        document.removeEventListener(DOWNLOAD_INFO_READY_EVENT, onReady, true);
      };
      const read = () => {
        const raw = document.documentElement?.getAttribute(DOWNLOAD_INFO_ATTR);
        if (!raw) return null;
        document.documentElement.removeAttribute(DOWNLOAD_INFO_ATTR);
        return parseJson(raw);
      };
      const finish = value => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };
      const onReady = () => setTimeout(() => finish(read()), 0);
      timer = setTimeout(() => finish(read()), timeoutMs);
      document.addEventListener(DOWNLOAD_INFO_READY_EVENT, onReady, true);
      document.dispatchEvent(new Event(DOWNLOAD_INFO_REQUEST_EVENT));
    });
  }

  async function downloadStudioResponse() {
    const context = readContext();
    if (context.platform !== 'youtube' || !['watch', 'shorts'].includes(context.pageType)) {
      return { ok: false, code: 'youtube-video-required', message: 'Download Studio 目前只支援 YouTube 影片 / Shorts。', info: null };
    }
    const info = await requestDownloadStudioInfo();
    if (!info) return { ok: false, code: 'bridge-timeout', message: 'runtime 已恢復，但暫時無法讀取目前影片格式；請稍後重新掃描。', info: null };
    const choices = Array.isArray(info.choices) ? info.choices : [];
    if (!choices.length) {
      return { ok: false, code: 'no-download-choice', message: info.unavailableReason || '目前沒有可直接取得的 MP4 格式。', info: { ...info, choices: [] } };
    }
    return { ok: true, code: 'download-studio-ready', message: `找到 ${choices.length} 個可下載 MP4 選項。`, info };
  }

  function onMessage(message, sender, sendResponse) {
    if (!messageAlive || !extensionAlive() || !message || typeof message !== 'object') return false;
    lastTouch = Date.now();
    if (message.type === 'YTSS_GET_RUNTIME' || message.type === 'YTSS_RECOVER') {
      sendResponse(snapshot());
      return false;
    }
    if (message.type === 'YTSS_GET_DOWNLOAD_STUDIO') {
      downloadStudioResponse().then(sendResponse).catch(error => sendResponse({
        ok: false,
        code: 'recovery-download-error',
        message: error?.message || String(error),
        info: null
      }));
      return true;
    }
    return false;
  }

  function fullRuntimeReady(status) {
    return Boolean(status && status.version === VERSION && status.protocol === PROTOCOL && status.href === location.href);
  }

  function handOffToFullRuntime() {
    if (!messageAlive) return;
    messageAlive = false;
    clearTimeout(handoffTimer);
    handoffTimer = null;
    try { chrome.runtime.onMessage.removeListener(onMessage); } catch {}
    try { chrome.storage.onChanged.removeListener(onStorageChanged); } catch {}
  }

  function scheduleHandoff(status) {
    if (!fullRuntimeReady(status)) return;
    clearTimeout(handoffTimer);
    handoffTimer = setTimeout(handOffToFullRuntime, 250);
  }

  function onStorageChanged(changes, area) {
    if (!messageAlive || area !== 'local') return;
    scheduleHandoff(changes[STATUS_KEY]?.newValue);
  }

  function dispose() {
    if (!messageAlive && !handoffTimer) return;
    messageAlive = false;
    clearTimeout(handoffTimer);
    handoffTimer = null;
    try { chrome.runtime.onMessage.removeListener(onMessage); } catch {}
    try { chrome.storage.onChanged.removeListener(onStorageChanged); } catch {}
  }

  chrome.runtime.onMessage.addListener(onMessage);
  chrome.storage.onChanged.addListener(onStorageChanged);
  chrome.storage.local.get(STATUS_KEY).then(value => scheduleHandoff(value?.[STATUS_KEY])).catch(() => {});

  globalThis[BRIDGE_KEY] = {
    version: VERSION,
    protocol: PROTOCOL,
    get alive() { return messageAlive; },
    get messagingAlive() { return messageAlive; },
    get lastTouch() { return lastTouch; },
    touch() { lastTouch = Date.now(); },
    dispose
  };
})();
