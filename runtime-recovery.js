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

  const previous = globalThis.__YTSS_RECOVERY_BRIDGE__;
  if (previous?.alive && previous.version === VERSION && previous.protocol === PROTOCOL) {
    previous.touch?.();
    return;
  }
  try { previous?.dispose?.(); } catch {}

  let alive = true;
  let lastTouch = Date.now();

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

  function readContext() {
    const parsed = parseJson(document.documentElement?.getAttribute(PAGE_CONTEXT_ATTR));
    if (parsed && typeof parsed === 'object') return parsed;
    return fallbackContext();
  }

  function requestContext() {
    try { document.dispatchEvent(new Event(PAGE_CONTEXT_REQUEST_EVENT)); } catch {}
  }

  function snapshot() {
    requestContext();
    return {
      ok: true,
      protocol: PROTOCOL,
      version: VERSION,
      recoveryBridge: true,
      context: readContext(),
      diagnostics: {
        at: Date.now(),
        version: VERSION,
        protocol: PROTOCOL,
        recoveryBridge: true,
        href: location.href,
        context: readContext()
      }
    };
  }

  function requestDownloadStudioInfo(timeoutMs = 5600) {
    return new Promise(resolve => {
      let settled = false;
      const cleanup = () => {
        clearTimeout(timer);
        document.removeEventListener(DOWNLOAD_INFO_READY_EVENT, onReady, true);
      };
      const read = () => {
        const raw = document.documentElement?.getAttribute(DOWNLOAD_INFO_ATTR);
        if (!raw) return null;
        // Signed googlevideo URLs are deliberately consumed and removed immediately.
        document.documentElement.removeAttribute(DOWNLOAD_INFO_ATTR);
        return parseJson(raw);
      };
      const finish = value => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };
      const onReady = () => finish(read());
      const timer = setTimeout(() => finish(read()), timeoutMs);
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
    if (!alive || !extensionAlive() || !message || typeof message !== 'object') return false;
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

  function applyAccent(value) {
    const accent = typeof value === 'string' && value ? value : 'violet';
    const panel = document.getElementById('ytss-panel');
    if (panel) panel.dataset.accent = accent;
  }

  function onStorageChanged(changes, area) {
    if (!alive || area !== 'local') return;
    if (changes.accentColor) applyAccent(changes.accentColor.newValue);
    const status = changes[STATUS_KEY]?.newValue;
    if (!status || status.version !== VERSION || status.protocol !== PROTOCOL || status.href !== location.href) return;
    // content.js publishes this only after its full runtime listener has been installed.
    setTimeout(dispose, 250);
  }

  function dispose() {
    if (!alive) return;
    alive = false;
    try { chrome.runtime.onMessage.removeListener(onMessage); } catch {}
    try { chrome.storage.onChanged.removeListener(onStorageChanged); } catch {}
  }

  chrome.runtime.onMessage.addListener(onMessage);
  chrome.storage.onChanged.addListener(onStorageChanged);
  chrome.storage.local.get({ accentColor: 'violet' }).then(({ accentColor }) => applyAccent(accentColor)).catch(() => {});
  globalThis.__YTSS_RECOVERY_BRIDGE__ = {
    version: VERSION,
    protocol: PROTOCOL,
    get alive() { return alive; },
    get lastTouch() { return lastTouch; },
    touch() { lastTouch = Date.now(); },
    dispose
  };
})();
