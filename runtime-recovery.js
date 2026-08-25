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
  const RECOVERY_DEFAULTS = {
    enabled: true,
    floatingEnabled: true,
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
    accentColor: 'violet'
  };

  const previous = globalThis.__YTSS_RECOVERY_BRIDGE__;
  if (previous?.alive && previous.version === VERSION && previous.protocol === PROTOCOL) {
    previous.touch?.();
    return;
  }
  try { previous?.dispose?.(); } catch {}

  let alive = true;
  let visualRepairAlive = true;
  let lastTouch = Date.now();
  let recoverySettings = structuredClone(RECOVERY_DEFAULTS);
  let heldAction = null;
  let repairTimer = null;
  let panelObserver = null;

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

  function normalizeProfiles(value) {
    const profiles = value && typeof value === 'object' ? value : {};
    return {
      channels: profiles.channels && typeof profiles.channels === 'object' ? profiles.channels : {},
      playlists: profiles.playlists && typeof profiles.playlists === 'object' ? profiles.playlists : {}
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function modeSettingKey() {
    return location.pathname.startsWith('/shorts/') ? 'shortsSpeed' : 'generalSpeed';
  }

  function recoveryBounds() {
    const ceiling = recoverySettings.extremeMode ? 16 : 4;
    const min = clamp(Number(recoverySettings.minSpeed) || .25, .1, ceiling);
    const max = clamp(Number(recoverySettings.maxSpeed) || 8, min, ceiling);
    return { min, max };
  }

  function profileKeys(context, kind) {
    if (kind === 'playlist') return context?.playlistKey ? [context.playlistKey] : [];
    return [...new Set([context?.channelKey, ...(Array.isArray(context?.channelAliases) ? context.channelAliases : [])].filter(Boolean))];
  }

  function activeProfile() {
    if (!recoverySettings.profilesEnabled) return null;
    const context = readContext();
    const profiles = normalizeProfiles(recoverySettings.profiles);
    if (context?.playlistKey && profiles.playlists[context.playlistKey]) {
      return { bucket: 'playlists', key: context.playlistKey, entry: profiles.playlists[context.playlistKey] };
    }
    for (const key of profileKeys(context, 'channel')) {
      if (profiles.channels[key]) return { bucket: 'channels', key, entry: profiles.channels[key] };
    }
    return null;
  }

  function configuredRate() {
    const key = modeSettingKey();
    const profile = activeProfile();
    const value = profile?.entry?.[key] ?? recoverySettings[key];
    const { min, max } = recoveryBounds();
    return clamp(Number(value) || 1, min, max);
  }

  function resolveVideo() {
    const videos = [...document.querySelectorAll('video')].filter(video => video?.isConnected);
    if (!videos.length) return null;
    let best = videos[0];
    let bestScore = -Infinity;
    for (const video of videos) {
      const rect = video.getBoundingClientRect();
      const style = getComputedStyle(video);
      let score = Math.max(0, rect.width) * Math.max(0, rect.height);
      if (!video.paused && !video.ended) score += 1000000;
      if (style.display === 'none' || style.visibility === 'hidden') score -= 10000000;
      if (score > bestScore) { best = video; bestScore = score; }
    }
    return best;
  }

  function renderRecoveryPanel(rate) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const value = Number.isFinite(rate) ? rate : resolveVideo()?.playbackRate;
    if (!Number.isFinite(value)) return;
    const label = `${Number(value).toFixed(2).replace(/\.00$/, '').replace(/0$/, '')}×`;
    for (const selector of ['#ytss-speed', '#ytss-hover-speed']) {
      const el = panel.querySelector(selector);
      if (el) el.textContent = label;
    }
    panel.querySelectorAll('.ytss-preset').forEach(button => {
      button.classList.toggle('active', Math.abs(Number(button.dataset.speed) - value) < .01);
    });
  }

  async function persistRecoveryRate(rate) {
    if (!recoverySettings.rememberLast) return;
    const key = modeSettingKey();
    const profile = activeProfile();
    if (profile) {
      const profiles = normalizeProfiles(recoverySettings.profiles);
      profiles[profile.bucket] = { ...profiles[profile.bucket] };
      profiles[profile.bucket][profile.key] = { ...profile.entry, [key]: rate, updatedAt: Date.now() };
      recoverySettings.profiles = profiles;
      await chrome.storage.local.set({ profiles });
      return;
    }
    recoverySettings[key] = rate;
    await chrome.storage.local.set({ [key]: rate });
  }

  function applyRecoveryRate(value, { persist = true } = {}) {
    const video = resolveVideo();
    if (!video) return false;
    const { min, max } = recoveryBounds();
    const rate = Math.round(clamp(Number(value) || 1, min, max) * 100) / 100;
    try {
      if ('preservesPitch' in video) video.preservesPitch = recoverySettings.preservePitch !== false;
      video.playbackRate = rate;
      video.defaultPlaybackRate = rate;
      renderRecoveryPanel(rate);
      if (persist) persistRecoveryRate(rate).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  function interceptEvent(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function panelButtonFromEvent(event) {
    const target = event.target instanceof Element ? event.target.closest(`#${PANEL_ID} button`) : null;
    return target && document.getElementById(PANEL_ID)?.contains(target) ? target : null;
  }

  function onPanelClick(event) {
    if (!alive) return;
    const button = panelButtonFromEvent(event);
    if (!button) return;
    const id = button.id;
    const preset = button.classList.contains('ytss-preset') ? Number(button.dataset.speed) : NaN;
    const video = resolveVideo();
    const current = Number(video?.playbackRate) || configuredRate();
    const step = Math.max(.01, Number(recoverySettings.step) || .25);
    let handled = true;

    if (id === 'ytss-minus' || id === 'ytss-quick-down') applyRecoveryRate(current - step);
    else if (id === 'ytss-plus' || id === 'ytss-quick-up') applyRecoveryRate(current + step);
    else if (Number.isFinite(preset)) applyRecoveryRate(preset);
    else if (id === 'ytss-speed' || id === 'ytss-hover-speed') {
      const target = Math.abs(current - 1) < .01 ? configuredRate() : 1;
      applyRecoveryRate(target, { persist: false });
    } else if (id === 'ytss-close') {
      recoverySettings.floatingEnabled = false;
      const panel = document.getElementById(PANEL_ID);
      if (panel) panel.style.display = 'none';
      chrome.storage.local.set({ floatingEnabled: false }).catch(() => {});
    } else if (id === 'ytss-collapse') {
      const panel = document.getElementById(PANEL_ID);
      panel?.classList.toggle('ytss-compact');
      schedulePanelRepair(20);
    } else handled = false;

    if (handled) interceptEvent(event);
  }

  function finishHeldAction(event) {
    if (!heldAction) return;
    if (event?.pointerId !== undefined && heldAction.pointerId !== null && event.pointerId !== heldAction.pointerId) return;
    const { button, restoreRate } = heldAction;
    heldAction = null;
    button?.classList.remove('ytss-held');
    applyRecoveryRate(restoreRate, { persist: false });
    if (event) interceptEvent(event);
  }

  function onPanelPointerDown(event) {
    if (!alive || event.button !== 0) return;
    const button = panelButtonFromEvent(event);
    if (!button || (button.id !== 'ytss-quick-boost' && button.id !== 'ytss-quick-pause')) return;
    interceptEvent(event);
    const restoreRate = configuredRate();
    heldAction = { button, pointerId: event.pointerId ?? null, restoreRate };
    button.classList.add('ytss-held');
    applyRecoveryRate(button.id === 'ytss-quick-pause' ? 1 : Number(recoverySettings.boostSpeed) || 3, { persist: false });
  }

  function onPanelPointerUp(event) {
    if (heldAction) finishHeldAction(event);
  }

  function applyAccent(value) {
    const accent = typeof value === 'string' && value ? value : 'violet';
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.dataset.accent = accent;
  }

  function repairPanelViewport() {
    clearTimeout(repairTimer);
    repairTimer = null;
    if (!visualRepairAlive) return;
    const panel = document.getElementById(PANEL_ID);
    if (!panel || getComputedStyle(panel).display === 'none') return;
    panel.style.maxWidth = 'calc(100vw - 16px)';
    const rect = panel.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const margin = 8;
    let left = rect.left;
    let top = rect.top;
    if (rect.right > window.innerWidth - margin) left -= rect.right - (window.innerWidth - margin);
    if (rect.bottom > window.innerHeight - margin) top -= rect.bottom - (window.innerHeight - margin);
    left = Math.max(margin, left);
    top = Math.max(margin, top);
    if (Math.abs(left - rect.left) > .5) {
      panel.style.left = `${Math.round(left)}px`;
      panel.style.right = 'auto';
    }
    if (Math.abs(top - rect.top) > .5) panel.style.top = `${Math.round(top)}px`;
  }

  function schedulePanelRepair(delay = 0) {
    if (!visualRepairAlive) return;
    clearTimeout(repairTimer);
    repairTimer = setTimeout(repairPanelViewport, delay);
  }

  function onPanelPointerOver(event) {
    if (event.target instanceof Element && event.target.closest(`#${PANEL_ID}`)) schedulePanelRepair(190);
  }

  function onPanelFocusIn(event) {
    if (event.target instanceof Element && event.target.closest(`#${PANEL_ID}`)) schedulePanelRepair(40);
  }

  function onPanelTransitionEnd(event) {
    if (event.target?.id === PANEL_ID && event.propertyName === 'width') schedulePanelRepair(0);
  }

  function installPanelRepair() {
    document.addEventListener('click', onPanelClick, true);
    document.addEventListener('pointerdown', onPanelPointerDown, true);
    document.addEventListener('pointerup', onPanelPointerUp, true);
    document.addEventListener('pointercancel', onPanelPointerUp, true);
    document.addEventListener('pointerover', onPanelPointerOver, true);
    document.addEventListener('focusin', onPanelFocusIn, true);
    document.addEventListener('transitionend', onPanelTransitionEnd, true);
    window.addEventListener('resize', repairPanelViewport);
    panelObserver = new MutationObserver(records => {
      if (records.some(record => record.type === 'childList' || (record.type === 'attributes' && record.target?.id === PANEL_ID))) {
        if (alive) applyAccent(recoverySettings.accentColor);
        schedulePanelRepair(40);
      }
    });
    panelObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    schedulePanelRepair(0);
  }

  function onStorageChanged(changes, area) {
    if (!alive || area !== 'local') return;
    for (const [key, change] of Object.entries(changes)) {
      if (Object.prototype.hasOwnProperty.call(RECOVERY_DEFAULTS, key)) recoverySettings[key] = change.newValue;
    }
    if (changes.profiles) recoverySettings.profiles = normalizeProfiles(changes.profiles.newValue);
    if (changes.accentColor) applyAccent(changes.accentColor.newValue);
    if (changes.position || changes.hoverExpand) schedulePanelRepair(40);
    const status = changes[STATUS_KEY]?.newValue;
    if (!status || status.version !== VERSION || status.protocol !== PROTOCOL || status.href !== location.href) return;
    // content.js publishes this only after its full runtime listener has been installed.
    // Hand runtime/control ownership to content.js, but keep the small viewport repair layer
    // alive so hover expansion remains fully visible after the recovery handshake is gone.
    setTimeout(handOffToFullRuntime, 250);
  }

  function handOffToFullRuntime() {
    if (!alive) return;
    alive = false;
    if (heldAction) finishHeldAction();
    try { chrome.runtime.onMessage.removeListener(onMessage); } catch {}
    try { chrome.storage.onChanged.removeListener(onStorageChanged); } catch {}
    document.removeEventListener('click', onPanelClick, true);
    document.removeEventListener('pointerdown', onPanelPointerDown, true);
    document.removeEventListener('pointerup', onPanelPointerUp, true);
    document.removeEventListener('pointercancel', onPanelPointerUp, true);
    schedulePanelRepair(0);
  }

  function dispose() {
    if (!alive && !visualRepairAlive) return;
    alive = false;
    visualRepairAlive = false;
    clearTimeout(repairTimer);
    if (heldAction) finishHeldAction();
    try { chrome.runtime.onMessage.removeListener(onMessage); } catch {}
    try { chrome.storage.onChanged.removeListener(onStorageChanged); } catch {}
    document.removeEventListener('click', onPanelClick, true);
    document.removeEventListener('pointerdown', onPanelPointerDown, true);
    document.removeEventListener('pointerup', onPanelPointerUp, true);
    document.removeEventListener('pointercancel', onPanelPointerUp, true);
    document.removeEventListener('pointerover', onPanelPointerOver, true);
    document.removeEventListener('focusin', onPanelFocusIn, true);
    document.removeEventListener('transitionend', onPanelTransitionEnd, true);
    window.removeEventListener('resize', repairPanelViewport);
    panelObserver?.disconnect();
    panelObserver = null;
  }

  chrome.runtime.onMessage.addListener(onMessage);
  chrome.storage.onChanged.addListener(onStorageChanged);
  chrome.storage.local.get(RECOVERY_DEFAULTS).then(stored => {
    recoverySettings = { ...structuredClone(RECOVERY_DEFAULTS), ...stored, profiles: normalizeProfiles(stored.profiles) };
    applyAccent(recoverySettings.accentColor);
    renderRecoveryPanel(resolveVideo()?.playbackRate);
    schedulePanelRepair(0);
  }).catch(() => {});
  installPanelRepair();
  globalThis.__YTSS_RECOVERY_BRIDGE__ = {
    version: VERSION,
    protocol: PROTOCOL,
    get alive() { return alive; },
    get lastTouch() { return lastTouch; },
    touch() { lastTouch = Date.now(); schedulePanelRepair(0); },
    dispose
  };
})();
