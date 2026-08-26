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
  const PANEL_ID = 'ytss-panel';
  const BRIDGE_KEY = '__YTSS_RECOVERY_BRIDGE__';
  const DEFAULTS = {
    enabled: true,
    rememberLast: true,
    generalSpeed: 1.5,
    shortsSpeed: 1,
    step: .25,
    minSpeed: .25,
    maxSpeed: 8,
    extremeMode: true,
    boostSpeed: 3,
    preservePitch: true,
    profilesEnabled: true,
    profiles: { channels: {}, playlists: {} },
    decreaseKey: 'BracketLeft',
    increaseKey: 'BracketRight',
    boostKey: 'Backquote',
    pauseKey: 'Backslash',
    accentColor: 'violet'
  };

  const previous = globalThis[BRIDGE_KEY];
  try { previous?.dispose?.(); } catch {}
  try { delete globalThis[BRIDGE_KEY]; } catch {}

  let messageAlive = true;
  let controlAlive = true;
  let lastTouch = Date.now();
  let handoffTimer = null;
  let settings = structuredClone(DEFAULTS);
  let commandGeneration = 0;
  let held = null;
  let oneXActive = false;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

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
      : bilibili ? (/\/video\//.test(url.pathname) ? 'video' : 'other') : 'other';
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
      controlsReady: controlAlive,
      controlMode: 'recovery-authoritative',
      context,
      diagnostics: {
        at: Date.now(), version: VERSION, protocol: PROTOCOL, recoveryBridge: true,
        controlsReady: controlAlive, controlMode: 'recovery-authoritative', href: location.href, context
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
    if (!choices.length) return { ok: false, code: 'no-download-choice', message: info.unavailableReason || '目前沒有可直接取得的 MP4 格式。', info: { ...info, choices: [] } };
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
      downloadStudioResponse().then(sendResponse).catch(error => sendResponse({ ok: false, code: 'recovery-download-error', message: error?.message || String(error), info: null }));
      return true;
    }
    return false;
  }

  function normalizeProfiles(value) {
    const p = value && typeof value === 'object' ? value : {};
    return {
      channels: p.channels && typeof p.channels === 'object' ? p.channels : {},
      playlists: p.playlists && typeof p.playlists === 'object' ? p.playlists : {}
    };
  }

  function bounds() {
    const ceiling = settings.extremeMode ? 16 : 4;
    const min = clamp(Number(settings.minSpeed) || .25, .1, ceiling);
    const max = clamp(Number(settings.maxSpeed) || 8, min, ceiling);
    return { min, max };
  }

  function clampRate(value) {
    const { min, max } = bounds();
    return Math.round(clamp(Number(value) || 1, min, max) * 100) / 100;
  }

  function modeKey() {
    return location.pathname.startsWith('/shorts/') ? 'shortsSpeed' : 'generalSpeed';
  }

  function profileKeys(context) {
    return [...new Set([context?.channelKey, ...(Array.isArray(context?.channelAliases) ? context.channelAliases : [])].filter(Boolean))];
  }

  function activeProfile() {
    if (!settings.profilesEnabled) return null;
    const context = readContext();
    const profiles = normalizeProfiles(settings.profiles);
    if (context.playlistKey && profiles.playlists[context.playlistKey]) {
      return { bucket: 'playlists', key: context.playlistKey, entry: profiles.playlists[context.playlistKey], context };
    }
    for (const key of profileKeys(context)) {
      if (profiles.channels[key]) return { bucket: 'channels', key, entry: profiles.channels[key], context };
    }
    return null;
  }

  function configuredRate() {
    const key = modeKey();
    const profile = activeProfile();
    return clampRate(profile?.entry?.[key] ?? settings[key]);
  }

  async function persistRate(rate) {
    if (!settings.rememberLast) return;
    const key = modeKey();
    const profile = activeProfile();
    if (profile) {
      const profiles = normalizeProfiles(settings.profiles);
      profiles[profile.bucket] = { ...profiles[profile.bucket] };
      profiles[profile.bucket][profile.key] = { ...profile.entry, [key]: rate, updatedAt: Date.now() };
      settings.profiles = profiles;
      await chrome.storage.local.set({ profiles });
      return;
    }
    settings[key] = rate;
    await chrome.storage.local.set({ [key]: rate });
  }

  function resolveVideo() {
    const videos = [...document.querySelectorAll('video')].filter(v => v?.isConnected);
    if (!videos.length) return null;
    let best = videos[0], score = -Infinity;
    for (const video of videos) {
      const rect = video.getBoundingClientRect();
      const style = getComputedStyle(video);
      let s = Math.max(0, rect.width) * Math.max(0, rect.height);
      if (!video.paused && !video.ended) s += 1000000;
      if (style.display === 'none' || style.visibility === 'hidden') s -= 10000000;
      if (s > score) { best = video; score = s; }
    }
    return best;
  }

  function renderRate(rate) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const label = `${Number(rate).toFixed(2).replace(/\.00$/, '').replace(/0$/, '')}×`;
    for (const selector of ['#ytss-speed', '#ytss-hover-speed']) {
      const el = panel.querySelector(selector);
      if (el) el.textContent = label;
    }
    panel.querySelectorAll('.ytss-preset').forEach(button => {
      button.classList.toggle('active', Math.abs(Number(button.dataset.speed) - rate) < .01);
    });
  }

  function setMediaRate(rate) {
    const video = resolveVideo();
    if (!video) return false;
    try {
      if ('preservesPitch' in video) video.preservesPitch = settings.preservePitch !== false;
      video.playbackRate = rate;
      video.defaultPlaybackRate = rate;
      renderRate(rate);
      return true;
    } catch { return false; }
  }

  function reassert(rate, generation) {
    for (const delay of [70, 220, 520]) {
      setTimeout(() => {
        if (!controlAlive || generation !== commandGeneration) return;
        const video = resolveVideo();
        if (video && Math.abs(Number(video.playbackRate) - rate) > .01) setMediaRate(rate);
      }, delay);
    }
  }

  async function applyPersistentRate(rawRate) {
    const generation = ++commandGeneration;
    oneXActive = false;
    const rate = clampRate(rawRate);
    try {
      await persistRate(rate);
      await sleep(24);
    } catch {}
    if (!controlAlive || generation !== commandGeneration) return false;
    const ok = setMediaRate(rate);
    if (ok) reassert(rate, generation);
    return ok;
  }

  function applyTemporaryRate(rawRate) {
    const generation = ++commandGeneration;
    const rate = clampRate(rawRate);
    const ok = setMediaRate(rate);
    if (ok) reassert(rate, generation);
    return ok;
  }

  function intercept(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function panelButton(event) {
    const target = event.target instanceof Element ? event.target.closest(`#${PANEL_ID} button`) : null;
    return target && document.getElementById(PANEL_ID)?.contains(target) ? target : null;
  }

  function onPanelClick(event) {
    if (!controlAlive || !extensionAlive()) return;
    const button = panelButton(event);
    if (!button) return;
    const id = button.id;
    const preset = button.classList.contains('ytss-preset') ? Number(button.dataset.speed) : NaN;
    const step = Math.max(.01, Number(settings.step) || .25);
    let command = null;
    if (Number.isFinite(preset)) command = () => applyPersistentRate(preset);
    else if (id === 'ytss-minus' || id === 'ytss-quick-down') command = () => applyPersistentRate(configuredRate() - step);
    else if (id === 'ytss-plus' || id === 'ytss-quick-up') command = () => applyPersistentRate(configuredRate() + step);
    else if (id === 'ytss-speed' || id === 'ytss-hover-speed') {
      command = () => {
        const current = Number(resolveVideo()?.playbackRate) || configuredRate();
        if (Math.abs(current - 1) < .01 || oneXActive) {
          oneXActive = false;
          return applyTemporaryRate(configuredRate());
        }
        oneXActive = true;
        return applyTemporaryRate(1);
      };
    }
    if (!command) return;
    intercept(event);
    Promise.resolve().then(command).catch(() => {});
  }

  function targetIsEditable(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('input,textarea,select,[contenteditable="true"]'));
  }

  function onKeyDown(event) {
    if (!controlAlive || event.repeat || event.altKey || event.ctrlKey || event.metaKey || targetIsEditable(event.target)) return;
    const step = Math.max(.01, Number(settings.step) || .25);
    if (event.code === settings.decreaseKey) {
      intercept(event);
      applyPersistentRate(configuredRate() - step).catch(() => {});
    } else if (event.code === settings.increaseKey) {
      intercept(event);
      applyPersistentRate(configuredRate() + step).catch(() => {});
    } else if (event.code === settings.boostKey || event.code === settings.pauseKey) {
      intercept(event);
      if (!held) held = { code: event.code, restore: configuredRate() };
      applyTemporaryRate(event.code === settings.pauseKey ? 1 : Number(settings.boostSpeed) || 3);
    }
  }

  function onKeyUp(event) {
    if (!controlAlive || !held || event.code !== held.code) return;
    intercept(event);
    const restore = held.restore;
    held = null;
    applyTemporaryRate(restore);
  }

  function onPointerDown(event) {
    if (!controlAlive || event.button !== 0) return;
    const button = panelButton(event);
    if (!button || (button.id !== 'ytss-quick-boost' && button.id !== 'ytss-quick-pause')) return;
    intercept(event);
    const restore = configuredRate();
    held = { pointerId: event.pointerId, restore };
    button.classList.add('ytss-held');
    applyTemporaryRate(button.id === 'ytss-quick-pause' ? 1 : Number(settings.boostSpeed) || 3);
  }

  function onPointerUp(event) {
    if (!controlAlive || !held || held.pointerId === undefined || held.pointerId !== event.pointerId) return;
    intercept(event);
    const restore = held.restore;
    held = null;
    document.querySelectorAll(`#${PANEL_ID} .ytss-held`).forEach(el => el.classList.remove('ytss-held'));
    applyTemporaryRate(restore);
  }

  function applyAccent(value) {
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.dataset.accent = typeof value === 'string' && value ? value : 'violet';
  }

  function fullRuntimeReady(status) {
    return Boolean(status && status.version === VERSION && status.protocol === PROTOCOL && status.href === location.href);
  }

  function handOffMessaging() {
    if (!messageAlive) return;
    messageAlive = false;
    clearTimeout(handoffTimer);
    handoffTimer = null;
    try { chrome.runtime.onMessage.removeListener(onMessage); } catch {}
  }

  function onStorageChanged(changes, area) {
    if (area !== 'local') return;
    for (const [key, change] of Object.entries(changes)) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, key)) settings[key] = change.newValue;
    }
    if (changes.profiles) settings.profiles = normalizeProfiles(changes.profiles.newValue);
    if (changes.accentColor) applyAccent(changes.accentColor.newValue);
    const status = changes[STATUS_KEY]?.newValue;
    if (messageAlive && fullRuntimeReady(status)) {
      clearTimeout(handoffTimer);
      handoffTimer = setTimeout(handOffMessaging, 250);
    }
  }

  function installControls() {
    window.addEventListener('click', onPanelClick, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('pointercancel', onPointerUp, true);
  }

  function removeControls() {
    window.removeEventListener('click', onPanelClick, true);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('pointerup', onPointerUp, true);
    window.removeEventListener('pointercancel', onPointerUp, true);
  }

  function dispose() {
    messageAlive = false;
    controlAlive = false;
    ++commandGeneration;
    clearTimeout(handoffTimer);
    handoffTimer = null;
    held = null;
    try { chrome.runtime.onMessage.removeListener(onMessage); } catch {}
    try { chrome.storage.onChanged.removeListener(onStorageChanged); } catch {}
    removeControls();
  }

  chrome.runtime.onMessage.addListener(onMessage);
  chrome.storage.onChanged.addListener(onStorageChanged);
  installControls();
  chrome.storage.local.get(DEFAULTS).then(stored => {
    settings = { ...structuredClone(DEFAULTS), ...stored, profiles: normalizeProfiles(stored.profiles) };
    applyAccent(settings.accentColor);
  }).catch(() => {});

  globalThis[BRIDGE_KEY] = {
    version: VERSION,
    protocol: PROTOCOL,
    get alive() { return messageAlive || controlAlive; },
    get messagingAlive() { return messageAlive; },
    get controlsAlive() { return controlAlive; },
    get lastTouch() { return lastTouch; },
    touch() { lastTouch = Date.now(); },
    dispose
  };
})();
