(() => {
  'use strict';
  if (globalThis.__YOUTUBE_SPEED_STUDIO_CONTENT_V100__) return;
  Object.defineProperty(globalThis, '__YOUTUBE_SPEED_STUDIO_CONTENT_V100__', { value: true, configurable: false });

  const DEFAULTS = {
    enabled: true,
    floatingEnabled: true,
    hoverExpand: true,
    hideFloatingOnSearch: true,
    rememberLast: true,
    generalSpeed: 1.5,
    shortsSpeed: 1.0,
    step: 0.25,
    minSpeed: 0.25,
    maxSpeed: 8,
    extremeMode: true,
    showPresets: true,
    presets: [1, 1.25, 1.5, 2, 3],
    panelOpacity: 90,
    compactOnStart: false,
    position: { x: null, y: 100 },
    lockSpeed: false,
    resetSpeed: 1,
    preservePitch: true,
    decreaseKey: 'BracketLeft',
    increaseKey: 'BracketRight',
    boostKey: 'Backquote',
    pauseKey: 'Backslash',
    boostSpeed: 3,
    themeMode: 'auto',
    profilesEnabled: true,
    profiles: { channels: {}, playlists: {} },
    diagnosticsEnabled: false,
    downloadSaveAs: true,
    downloadDefaultQuality: 'best',
    bilibiliEnabled: true,
    uiLanguage: 'auto',
    accentColor: 'violet',
    uiBackground: 'auto',
    updateCheckEnabled: true
  };

  const EXTENSION_VERSION = chrome.runtime.getManifest().version;
  const RUNTIME_PROTOCOL = 7;
  const provider = globalThis.YouTubeSpeedStudioProvider || globalThis.SpeedStudioProvider || {
    id: 'generic', label: 'HTML5', supportsProfiles: false, supportsDownloadStudio: false,
    isShorts: () => false, isSearchPage: () => false, isVideoPage: () => true, mode: () => 'general', pageType: () => 'video',
    videoSelectors: ['video'], scoreBonus: () => 0, playerRoot: video => video?.parentElement || null, navigationEvents: [],
    videoId: () => null, context: () => ({ platform: 'generic', platformLabel: 'HTML5', href: location.href, pageType: 'video', mode: 'general', videoId: null, channelKey: null, channelAliases: [], channelLabel: null, channelId: null, channelSource: null, playlistKey: null, playlistLabel: null, pageTitle: document.title || '' })
  };
  const PAGE_CONTEXT_ATTR = 'data-ytss-page-context';
  const PAGE_CONTEXT_READY_EVENT = 'ytss-page-context-ready';
  const PAGE_CONTEXT_REQUEST_EVENT = 'ytss-request-page-context';
  const DOWNLOAD_INFO_ATTR = 'data-ytss-download-studio-info';
  const DOWNLOAD_INFO_READY_EVENT = 'ytss-download-studio-info-ready';
  const DOWNLOAD_INFO_REQUEST_EVENT = 'ytss-request-download-studio-info';
  const RUNTIME_KEYS = {
    theme: 'ytssLastTheme',
    context: 'ytssActiveContext',
    diagnostics: 'ytssDiagnostics',
    status: 'ytssRuntimeStatus'
  };

  const state = {
    mode: null,
    video: null,
    videoAbort: null,
    videoGeneration: 0,
    desiredRate: 1,
    desiredScope: 'global',
    desiredScopeKey: null,
    hoverExpanded: false,
    lastAppliedRate: null,
    lastApplyAt: 0,
    lastApplyReason: 'init',
    lastError: null,
    boostActive: false,
    pauseActive: false,
    oneXToggleActive: false,
    resolvedVideoScore: 0,
    candidateCount: 0,
    currentTheme: 'dark',
    themePublished: false,
    contextPublished: false,
    contextRetryCount: 0,
    currentContext: null,
    urlSnapshot: location.href
  };

  let settings = structuredClone(DEFAULTS);
  let panel = null;
  let speedLabel = null;
  let hoverSpeedLabel = null;
  let hoverModeBadge = null;
  let hoverShortcutLabel = null;
  let modeBadge = null;
  let presetWrap = null;
  let debugLine = null;
  let isCompact = false;
  let dragState = null;
  let playerObserver = null;
  let playerObserverRoot = null;
  let titleObserver = null;
  let themeObserver = null;
  let recoveryTimer = null;
  let storeTimer = null;
  let diagnosticTimer = null;
  let contextRetryTimer = null;
  let hoverOpenTimer = null;
  let hoverCloseTimer = null;
  let panelPointerInside = false;
  let panelPointerDown = false;
  let panelPointerId = null;
  let hoverInteractionUntil = 0;
  let pendingStore = {};

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const roundSpeed = n => Math.round(n * 100) / 100;
  const safeNumber = (value, fallback = 1) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const isYoutube = () => provider.id === 'youtube';
  const isBilibili = () => provider.id === 'bilibili';
  const isShorts = () => Boolean(provider.isShorts?.());
  const isSearchPage = () => Boolean(provider.isSearchPage?.());
  const pageType = () => provider.pageType?.() || 'other';
  const mode = () => provider.mode?.() || 'general';
  const platformEnabled = () => !(isBilibili() && settings.bilibiliEnabled === false);
  const speedKey = m => (m === 'shorts' ? 'shortsSpeed' : 'generalSpeed');
  const formatSpeed = n => `${Number(n).toFixed(2).replace(/\.00$/, '').replace(/0$/, '')}×`;
  const effectiveMax = () => Math.min(16, settings.extremeMode ? settings.maxSpeed : Math.min(settings.maxSpeed, 4));

  function normalizeProfiles(value) {
    const profiles = value && typeof value === 'object' ? value : {};
    return {
      channels: profiles.channels && typeof profiles.channels === 'object' ? profiles.channels : {},
      playlists: profiles.playlists && typeof profiles.playlists === 'object' ? profiles.playlists : {}
    };
  }

  function normalizeSettings() {
    settings.step = clamp(safeNumber(settings.step, DEFAULTS.step), 0.01, 0.25);
    settings.extremeMode = Boolean(settings.extremeMode);
    const rateCeiling = settings.extremeMode ? 16 : 4;
    settings.minSpeed = clamp(safeNumber(settings.minSpeed, DEFAULTS.minSpeed), 0.1, rateCeiling);
    const rawMaxSpeed = safeNumber(settings.maxSpeed, DEFAULTS.maxSpeed);
    settings.maxSpeed = clamp(settings.extremeMode && rawMaxSpeed >= 15.75 ? 16 : rawMaxSpeed, settings.minSpeed, rateCeiling);
    settings.generalSpeed = clamp(safeNumber(settings.generalSpeed, DEFAULTS.generalSpeed), settings.minSpeed, settings.maxSpeed);
    settings.shortsSpeed = clamp(safeNumber(settings.shortsSpeed, DEFAULTS.shortsSpeed), settings.minSpeed, settings.maxSpeed);
    settings.boostSpeed = clamp(safeNumber(settings.boostSpeed, DEFAULTS.boostSpeed), settings.minSpeed, settings.maxSpeed);
    settings.resetSpeed = clamp(safeNumber(settings.resetSpeed, DEFAULTS.resetSpeed), settings.minSpeed, settings.maxSpeed);
    const rawOpacity = safeNumber(settings.panelOpacity, DEFAULTS.panelOpacity);
    settings.panelOpacity = clamp(rawOpacity <= 1 ? rawOpacity * 100 : rawOpacity, 0, 100);
    if (!Array.isArray(settings.presets)) settings.presets = [...DEFAULTS.presets];
    settings.presets = [...new Set(settings.presets.map(Number).filter(Number.isFinite))].slice(0, 8);
    if (!settings.position || typeof settings.position !== 'object') settings.position = { ...DEFAULTS.position };
    settings.bilibiliEnabled = settings.bilibiliEnabled !== false;
    settings.profiles = normalizeProfiles(settings.profiles);
    if (!['auto', 'dark', 'light', 'graphite', 'midnight', 'warm'].includes(settings.themeMode)) settings.themeMode = 'auto';
    for (const key of ['decreaseKey', 'increaseKey', 'boostKey', 'pauseKey']) {
      if (typeof settings[key] !== 'string' || !settings[key]) settings[key] = DEFAULTS[key];
    }
  }

  async function loadSettings() {
    const stored = await chrome.storage.local.get(DEFAULTS);
    settings = { ...structuredClone(DEFAULTS), ...stored };
    const oldOpacity = settings.panelOpacity;
    const oldMaxSpeed = settings.maxSpeed;
    normalizeSettings();
    const migration = {};
    if (Number(oldOpacity) !== settings.panelOpacity) migration.panelOpacity = settings.panelOpacity;
    if (Number(oldMaxSpeed) !== settings.maxSpeed) migration.maxSpeed = settings.maxSpeed;
    if (Object.keys(migration).length) await chrome.storage.local.set(migration);
  }

  function queueStore(patch, immediate = false) {
    pendingStore = { ...pendingStore, ...patch };
    clearTimeout(storeTimer);
    if (immediate) return flushStore();
    storeTimer = setTimeout(flushStore, 180);
  }

  async function flushStore() {
    clearTimeout(storeTimer);
    storeTimer = null;
    const patch = pendingStore;
    pendingStore = {};
    if (!Object.keys(patch).length) return;
    try {
      await chrome.storage.local.set(patch);
    } catch (error) {
      state.lastError = `storage: ${error?.message || String(error)}`;
      scheduleDiagnostics();
    }
  }

  function profileEntry(kind, key) {
    if (!key) return null;
    const bucket = kind === 'playlist' ? settings.profiles.playlists : settings.profiles.channels;
    const entry = bucket?.[key];
    return entry && typeof entry === 'object' ? entry : null;
  }

  function channelProfileKeys(context = state.currentContext) {
    if (!context) return [];
    return [...new Set([context.channelKey, ...(Array.isArray(context.channelAliases) ? context.channelAliases : [])].filter(Boolean))];
  }

  function resolveActiveProfile() {
    const context = state.currentContext;
    if (!provider.supportsProfiles || !settings.profilesEnabled || !context) return { entry: null, scope: 'global', scopeKey: null };
    if (context.playlistKey) {
      const entry = profileEntry('playlist', context.playlistKey);
      if (entry) return { entry, scope: 'playlist', scopeKey: context.playlistKey };
    }
    for (const key of channelProfileKeys(context)) {
      const entry = profileEntry('channel', key);
      if (entry) return { entry, scope: 'channel', scopeKey: key };
    }
    return { entry: null, scope: 'global', scopeKey: null };
  }

  function resolveConfiguredRate(targetMode = state.mode || mode()) {
    const key = speedKey(targetMode);
    const profile = resolveActiveProfile();
    if (profile.entry && Number.isFinite(Number(profile.entry[key]))) {
      return { rate: Number(profile.entry[key]), scope: profile.scope, scopeKey: profile.scopeKey };
    }
    return { rate: safeNumber(settings[key], 1), scope: 'global', scopeKey: null };
  }

  function activeProfileSetting(key, fallback) {
    const { entry } = resolveActiveProfile();
    return entry && Object.prototype.hasOwnProperty.call(entry, key) ? entry[key] : fallback;
  }

  function clampRate(value) {
    return roundSpeed(clamp(safeNumber(value, 1), settings.minSpeed, effectiveMax()));
  }

  function effectiveLockSpeed() {
    return Boolean(activeProfileSetting('lockSpeed', settings.lockSpeed));
  }

  function effectivePreservePitch() {
    return Boolean(activeProfileSetting('preservePitch', settings.preservePitch));
  }

  function effectiveBoostSpeed() {
    return clampRate(activeProfileSetting('boostSpeed', settings.boostSpeed));
  }

  function refreshDesiredRate(reason = 'refresh') {
    const resolved = resolveConfiguredRate();
    state.desiredRate = clampRate(resolved.rate);
    state.desiredScope = resolved.scope;
    state.desiredScopeKey = resolved.scopeKey;
    state.lastApplyReason = reason;
    return state.desiredRate;
  }

  function effectiveRate() {
    if (state.pauseActive) return 1;
    if (state.boostActive) return effectiveBoostSpeed();
    if (state.oneXToggleActive) return 1;
    return clampRate(state.desiredRate);
  }

  function applyPitch() {
    const target = state.video;
    if (!target || !('preservesPitch' in target)) return;
    try {
      target.preservesPitch = effectivePreservePitch();
    } catch (error) {
      state.lastError = `pitch: ${error?.message || String(error)}`;
    }
  }

  function applyRate(reason = 'apply') {
    const targetVideo = state.video;
    if (!settings.enabled || !platformEnabled() || !targetVideo || !targetVideo.isConnected) {
      updatePanel();
      return false;
    }

    const target = effectiveRate();
    applyPitch();
    if (Math.abs(targetVideo.playbackRate - target) <= 0.001 && Math.abs(targetVideo.defaultPlaybackRate - target) <= 0.001) {
      state.lastAppliedRate = target;
      state.lastApplyReason = reason;
      updatePanel();
      return true;
    }

    try {
      state.lastAppliedRate = target;
      state.lastApplyAt = performance.now();
      state.lastApplyReason = reason;
      targetVideo.playbackRate = target;
      targetVideo.defaultPlaybackRate = target;
      state.lastError = null;
      updatePanel();
      scheduleDiagnostics();
      return true;
    } catch (error) {
      state.lastError = `rate: ${error?.name || 'Error'} ${error?.message || String(error)}`;
      updatePanel();
      scheduleDiagnostics();
      return false;
    }
  }

  function persistDesiredRate(rate) {
    const key = speedKey(state.mode || mode());
    const context = state.currentContext;

    if (settings.profilesEnabled && state.desiredScope === 'playlist' && context?.playlistKey) {
      const profiles = normalizeProfiles(settings.profiles);
      profiles.playlists = { ...profiles.playlists };
      profiles.playlists[context.playlistKey] = {
        ...(profiles.playlists[context.playlistKey] || {}),
        [key]: rate,
        label: context.playlistLabel || context.playlistKey,
        updatedAt: Date.now()
      };
      settings.profiles = profiles;
      queueStore({ profiles });
      return;
    }

    if (settings.profilesEnabled && state.desiredScope === 'channel' && (context?.channelKey || state.desiredScopeKey)) {
      const profiles = normalizeProfiles(settings.profiles);
      profiles.channels = { ...profiles.channels };
      const canonicalKey = context?.channelKey || state.desiredScopeKey;
      const aliases = channelProfileKeys(context);
      const existingKey = aliases.find(alias => profiles.channels[alias]) || state.desiredScopeKey;
      profiles.channels[canonicalKey] = {
        ...(existingKey && profiles.channels[existingKey] ? profiles.channels[existingKey] : {}),
        [key]: rate,
        label: context?.channelLabel || canonicalKey,
        updatedAt: Date.now()
      };
      for (const alias of aliases) {
        if (alias !== canonicalKey) delete profiles.channels[alias];
      }
      settings.profiles = profiles;
      queueStore({ profiles });
      return;
    }

    settings[key] = rate;
    queueStore({ [key]: rate });
  }

  function setDesiredRate(target, { persist = true, source = 'ui' } = {}) {
    const rate = clampRate(target);
    state.desiredRate = rate;
    state.lastApplyReason = source;
    if (persist && settings.rememberLast) persistDesiredRate(rate);
    if (settings.enabled) applyRate(source);
    else updatePanel();
  }

  function adjust(delta) {
    const target = clampRate(state.desiredRate + safeNumber(delta, 0));
    setDesiredRate(target, { source: 'adjust' });
  }

  function applyMode(force = false, reason = 'mode') {
    const nextMode = mode();
    if (!force && nextMode === state.mode) return;
    state.mode = nextMode;
    refreshDesiredRate(reason);
    renderPresets();
    updateShortcutLabels();
    if (settings.enabled) applyRate(reason);
    else updatePanel();
  }

  function viewportIntersectionRatio(rect) {
    if (!rect || rect.width <= 0 || rect.height <= 0) return 0;
    const left = Math.max(0, rect.left);
    const top = Math.max(0, rect.top);
    const right = Math.min(window.innerWidth, rect.right);
    const bottom = Math.min(window.innerHeight, rect.bottom);
    const width = Math.max(0, right - left);
    const height = Math.max(0, bottom - top);
    return (width * height) / Math.max(1, rect.width * rect.height);
  }

  function scoreVideo(candidate) {
    if (!(candidate instanceof HTMLVideoElement) || !candidate.isConnected) return -Infinity;
    let score = 0;
    score += safeNumber(provider.scoreBonus?.(candidate), 0);
    if (!candidate.paused && !candidate.ended) score += 55;
    if (candidate.readyState >= HTMLMediaElement.HAVE_METADATA) score += 35;
    if (candidate.videoWidth > 0 && candidate.videoHeight > 0) score += 20;
    if (candidate.currentSrc) score += 10;

    const style = getComputedStyle(candidate);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) score -= 200;

    const rect = candidate.getBoundingClientRect();
    const ratio = viewportIntersectionRatio(rect);
    score += Math.round(ratio * 45);
    score += Math.min(35, Math.round((rect.width * rect.height) / 50000));
    if (rect.width < 160 || rect.height < 90) score -= 60;
    return score;
  }

  function getVideoCandidates() {
    const set = new Set();
    const selectors = Array.isArray(provider.videoSelectors) && provider.videoSelectors.length ? provider.videoSelectors : ['video'];
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) set.add(node);
    }
    return [...set];
  }

  function resolveActiveVideo() {
    const candidates = getVideoCandidates();
    state.candidateCount = candidates.length;
    let best = null;
    let bestScore = -Infinity;
    for (const candidate of candidates) {
      const score = scoreVideo(candidate);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    state.resolvedVideoScore = Number.isFinite(bestScore) ? bestScore : 0;
    return best;
  }

  function bindVideo(nextVideo, reason = 'resolve') {
    if (!nextVideo) return false;
    if (nextVideo === state.video) {
      applyPitch();
      if (settings.enabled && platformEnabled() && (effectiveLockSpeed() || state.boostActive || state.pauseActive || state.oneXToggleActive)) applyRate(`${reason}:verify`);
      return false;
    }

    state.videoAbort?.abort();
    state.videoAbort = new AbortController();
    state.video = nextVideo;
    state.videoGeneration += 1;
    state.oneXToggleActive = false;
    const { signal } = state.videoAbort;
    nextVideo.addEventListener('ratechange', onRateChange, { signal });
    nextVideo.addEventListener('loadedmetadata', onVideoReady, { signal });
    nextVideo.addEventListener('loadeddata', onVideoReady, { signal });
    nextVideo.addEventListener('playing', onVideoPlay, { signal });
    nextVideo.addEventListener('emptied', () => scheduleRecovery('video-emptied', 100), { signal });
    applyPitch();
    refreshDesiredRate(`${reason}:bind`);
    if (settings.enabled) applyRate(`${reason}:bind`);
    updatePanel();
    scheduleDiagnostics();
    return true;
  }

  function resolveAndBind(reason = 'resolve') {
    const nextVideo = resolveActiveVideo();
    if (nextVideo) bindVideo(nextVideo, reason);
    else if (state.video && !state.video.isConnected) {
      state.videoAbort?.abort();
      state.videoAbort = null;
      state.video = null;
      updatePanel();
      scheduleDiagnostics();
    }
  }

  function onVideoReady() {
    if (!settings.enabled) return;
    applyPitch();
    refreshDesiredRate('video-ready');
    applyRate('video-ready');
  }

  function onVideoPlay() {
    if (!settings.enabled) return;
    if (effectiveLockSpeed() || state.boostActive || state.pauseActive || state.oneXToggleActive || Math.abs(state.video.playbackRate - effectiveRate()) > 0.001) {
      applyRate('video-playing');
    }
  }

  function onRateChange() {
    const targetVideo = state.video;
    if (!targetVideo || !settings.enabled) return;
    const actual = roundSpeed(targetVideo.playbackRate);
    const internal = state.lastAppliedRate !== null &&
      Math.abs(actual - state.lastAppliedRate) < 0.001 &&
      performance.now() - state.lastApplyAt < 750;

    if (internal) {
      updatePanel();
      return;
    }

    if (effectiveLockSpeed() || state.boostActive || state.pauseActive || state.oneXToggleActive) {
      if (Math.abs(actual - effectiveRate()) > 0.001) {
        setTimeout(() => applyRate('lock-recover'), 0);
      }
      return;
    }

    const next = clampRate(actual);
    state.desiredRate = next;
    if (settings.rememberLast) persistDesiredRate(next);
    state.lastApplyReason = 'youtube-native';
    updatePanel();
    scheduleDiagnostics();
  }

  function normalizeShortcutCode(event) {
    return event.code || '';
  }

  function shortcutLabel(code) {
    const labels = {
      BracketLeft: '[', BracketRight: ']', Backquote: '`', Backslash: '\\', Minus: '-', Equal: '=',
      Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'"
    };
    if (labels[code]) return labels[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    return code.replace(/^Numpad/, 'Num ');
  }

  function shouldIgnoreShortcut(event) {
    const el = event.target;
    if (!el) return false;
    const tag = el.tagName?.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable || el.getAttribute?.('role') === 'textbox';
  }

  function startBoost() {
    if (state.boostActive || !settings.enabled || !platformEnabled()) return;
    state.boostActive = true;
    applyRate('boost-start');
    updatePanel();
  }

  function endBoost(reason = 'boost-end') {
    if (!state.boostActive) return;
    state.boostActive = false;
    if (settings.enabled) applyRate(reason);
    updatePanel();
  }

  function startTemporaryPause() {
    if (state.pauseActive || !settings.enabled || !platformEnabled()) return;
    state.pauseActive = true;
    applyRate('pause-start');
    updatePanel();
  }

  function endTemporaryPause(reason = 'pause-end') {
    if (!state.pauseActive) return;
    state.pauseActive = false;
    if (settings.enabled) applyRate(reason);
    updatePanel();
  }

  function toggleOneX() {
    if (!settings.enabled || !platformEnabled()) return;
    state.oneXToggleActive = !state.oneXToggleActive;
    applyRate(state.oneXToggleActive ? '1x-toggle-on' : '1x-toggle-off');
    updatePanel();
    scheduleDiagnostics();
  }

  function clearTransientPlayback(reason = 'transient-clear') {
    const changed = state.boostActive || state.pauseActive || state.oneXToggleActive;
    state.boostActive = false;
    state.pauseActive = false;
    state.oneXToggleActive = false;
    if (changed && settings.enabled) applyRate(reason);
    updatePanel();
  }

  function onKeyDown(event) {
    if (!settings.enabled || !platformEnabled() || shouldIgnoreShortcut(event) || event.ctrlKey || event.metaKey || event.altKey) return;
    const code = normalizeShortcutCode(event);
    if (code === settings.pauseKey) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) startTemporaryPause();
      return;
    }
    if (code === settings.boostKey) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) startBoost();
      return;
    }
    if (event.repeat) return;
    if (code === settings.decreaseKey) {
      event.preventDefault();
      event.stopPropagation();
      adjust(-settings.step);
    } else if (code === settings.increaseKey) {
      event.preventDefault();
      event.stopPropagation();
      adjust(settings.step);
    }
  }

  function onKeyUp(event) {
    const code = normalizeShortcutCode(event);
    if (code === settings.boostKey) endBoost();
    if (code === settings.pauseKey) endTemporaryPause();
  }

  function parseColor(color) {
    const value = String(color || '').trim();
    const rgbMatch = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/i);
    if (rgbMatch) {
      const alpha = rgbMatch[4] === undefined ? 1 : Number(rgbMatch[4]);
      if (!Number.isFinite(alpha) || alpha < 0.1) return null;
      return [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
    }
    const hexMatch = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!hexMatch) return null;
    let hex = hexMatch[1];
    if (hex.length === 3) hex = [...hex].map(ch => ch + ch).join('');
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }

  function themeFromRgb(rgb) {
    if (!rgb) return null;
    const [r, g, b] = rgb;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance < 128 ? 'dark' : 'light';
  }

  function detectPageTheme() {
    if (settings.themeMode !== 'auto') return settings.themeMode;
    if (isYoutube() && (document.documentElement.hasAttribute('dark') || document.querySelector('ytd-app[dark], #content[dark]'))) return 'dark';
    if (isBilibili() && (document.documentElement.classList.contains('dark') || document.body?.classList.contains('dark') || document.querySelector('[data-theme=dark], .dark-mode'))) return 'dark';

    const app = isYoutube() ? document.querySelector('ytd-app') : document.querySelector('.bpx-player-container, #app');
    const candidates = [app, document.body, document.documentElement].filter(Boolean);
    for (const el of candidates) {
      const style = getComputedStyle(el);
      for (const cssVar of ['--yt-spec-base-background', '--yt-spec-general-background-a', '--bg1', '--bg2']) {
        const fromVar = themeFromRgb(parseColor(style.getPropertyValue(cssVar)));
        if (fromVar) return fromVar;
      }
      const fromBackground = themeFromRgb(parseColor(style.backgroundColor));
      if (fromBackground) return fromBackground;
    }
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(reason = 'theme') {
    const next = detectPageTheme();
    if (next !== state.currentTheme || !state.themePublished) {
      state.currentTheme = next;
      state.themePublished = true;
      queueStore({ [RUNTIME_KEYS.theme]: next });
    }
    if (panel) panel.dataset.theme = next;
    state.lastApplyReason = reason;
    updatePanel();
  }

  function requestMainWorldContext() {
    if (!isYoutube()) return;
    try { document.dispatchEvent(new Event(PAGE_CONTEXT_REQUEST_EVENT)); } catch {}
  }

  function readMainWorldContext() {
    if (!isYoutube()) return null;
    const raw = document.documentElement?.getAttribute(PAGE_CONTEXT_ATTR);
    if (!raw) return null;
    try {
      const value = JSON.parse(raw);
      if (!value || typeof value !== 'object') return null;
      const liveVideoId = new URLSearchParams(location.search).get('v') || (isShorts() ? location.pathname.split('/')[2] || null : null);
      if (value.videoId && liveVideoId && value.videoId !== liveVideoId) return null;
      return value;
    } catch {
      return null;
    }
  }

  function firstChannelAnchor() {
    const scopes = [
      document.querySelector('ytd-reel-video-renderer[is-active], ytd-reel-video-renderer[active]'),
      document.querySelector('ytd-watch-metadata'),
      document.querySelector('#above-the-fold'),
      document.querySelector('#primary'),
      document
    ].filter(Boolean);
    const selectors = [
      '#owner a[href^="/@"], #owner a[href*="/channel/"], #video-owner a[href^="/@"], #video-owner a[href*="/channel/"]',
      'ytd-video-owner-renderer a[href^="/@"], ytd-video-owner-renderer a[href*="/channel/"]',
      'yt-reel-channel-bar-view-model a[href^="/@"], yt-reel-channel-bar-view-model a[href*="/channel/"], ytd-reel-player-overlay-renderer a[href^="/@"], ytd-reel-player-overlay-renderer a[href*="/channel/"]',
      'ytd-channel-name a[href^="/@"], ytd-channel-name a[href*="/channel/"]',
      'yt-content-metadata-view-model a[href^="/@"], yt-content-metadata-view-model a[href*="/channel/"], a.ytp-ce-channel-title[href*="/channel/"]'
    ];
    for (const scope of scopes) {
      for (const selector of selectors) {
        const anchor = scope.querySelector?.(selector);
        if (anchor) return anchor;
      }
    }
    return null;
  }

  function normalizeChannelPath(anchor) {
    if (!anchor) return null;
    try {
      const raw = anchor.href || anchor.getAttribute?.('href');
      if (!raw) return null;
      const url = new URL(raw, location.origin);
      const path = url.pathname.replace(/\/$/, '');
      return path.startsWith('/@') || path.startsWith('/channel/') ? path : null;
    } catch {
      const path = anchor.getAttribute?.('href')?.split(/[?#]/)[0]?.replace(/\/$/, '') || null;
      return path && (path.startsWith('/@') || path.startsWith('/channel/')) ? path : null;
    }
  }

  function extractContext({ allowMetaFallback = false } = {}) {
    if (!isYoutube()) return provider.context?.() || { platform: provider.id, platformLabel: provider.label, href: location.href, pageType: pageType(), mode: mode(), videoId: provider.videoId?.() || null, channelKey: null, channelAliases: [], channelLabel: null, channelId: null, channelSource: null, playlistKey: null, playlistLabel: null, pageTitle: document.title || '' };
    const params = new URLSearchParams(location.search);
    const videoId = params.get('v') || (isShorts() ? location.pathname.split('/')[2] || null : null);
    const playlistKey = params.get('list') || null;
    const mainContext = readMainWorldContext();
    const channelAnchor = firstChannelAnchor();
    const channelPath = normalizeChannelPath(channelAnchor);
    const metaChannelId = document.head.querySelector('meta[itemprop="channelId"][content]')?.content?.trim() || null;
    const anchorChannelId = channelPath?.startsWith('/channel/') ? channelPath.split('/')[2] || null : null;
    const bridgedChannelId = typeof mainContext?.channelId === 'string' ? mainContext.channelId.trim() : null;
    const usableChannelId = bridgedChannelId || anchorChannelId || (channelAnchor || allowMetaFallback ? metaChannelId : null);
    const metaAuthor = document.head.querySelector('meta[itemprop="author"][content], meta[name="author"][content]')?.content?.trim() || null;
    const ownerName = document.querySelector('ytd-watch-metadata #owner #channel-name, #video-owner #channel-name, yt-reel-channel-bar-view-model #channel-name')?.textContent?.trim() || null;
    const bridgedChannelName = typeof mainContext?.channelName === 'string' ? mainContext.channelName.trim() : null;
    const channelKey = usableChannelId ? `channel:${usableChannelId}` : channelPath;
    const channelAliases = [...new Set([
      channelKey,
      channelPath,
      usableChannelId ? `/channel/${usableChannelId}` : null
    ].filter(Boolean))];
    const channelLabel = bridgedChannelName || channelAnchor?.textContent?.trim() || ownerName || metaAuthor || channelKey;
    const channelSource = bridgedChannelId ? `main-world:${mainContext?.source || 'player-data'}`
      : channelAnchor && usableChannelId ? 'owner+channel-id'
        : channelAnchor ? 'owner-link'
          : usableChannelId ? 'meta-channel-id' : null;

    const playlistTitle = document.querySelector(
      'ytd-playlist-panel-renderer #header-description a, ytd-playlist-panel-renderer #title, '
      + 'ytd-playlist-header-renderer h1, yt-page-header-view-model h1'
    )?.textContent?.trim();

    return {
      href: location.href,
      pageType: pageType(),
      mode: mode(),
      videoId,
      channelKey,
      channelAliases,
      channelLabel,
      channelId: usableChannelId || metaChannelId,
      channelSource,
      playlistKey,
      playlistLabel: playlistTitle || playlistKey,
      pageTitle: document.title || ''
    };
  }

  function contextSignature(context) {
    if (!context) return '';
    return [context.platform || provider.id, context.pageType, context.mode, context.videoId, context.channelKey, context.playlistKey].join('|');
  }

  function updateContext(reason = 'context', { forceMetaFallback = false } = {}) {
    if (reason !== 'context-retry') state.contextRetryCount = 0;
    requestMainWorldContext();
    const next = extractContext({ allowMetaFallback: forceMetaFallback || state.contextRetryCount >= 3 });
    const changed = !state.contextPublished || contextSignature(next) !== contextSignature(state.currentContext)
      || next.channelLabel !== state.currentContext?.channelLabel || next.playlistLabel !== state.currentContext?.playlistLabel
      || JSON.stringify(next.channelAliases || []) !== JSON.stringify(state.currentContext?.channelAliases || []);
    state.currentContext = next;
    if (changed) {
      state.contextPublished = true;
      queueStore({ [RUNTIME_KEYS.context]: next });
      refreshDesiredRate(reason);
      applyPitch();
      if (settings.enabled) applyRate(reason);
      scheduleDiagnostics();
    }

    clearTimeout(contextRetryTimer);
    const hasStableChannelId = Boolean(next.channelId && (next.channelSource === 'owner+channel-id' || next.channelSource?.startsWith('main-world:')));
    const shouldRetryOwner = isYoutube() && (location.pathname === '/watch' || isShorts())
      && !hasStableChannelId && state.contextRetryCount < 7;
    if (shouldRetryOwner) {
      state.contextRetryCount += 1;
      contextRetryTimer = setTimeout(() => updateContext('context-retry'), 500);
    }
    return next;
  }

  function createPanel() {
    if (panel) return;
    panel = document.createElement('div');
    panel.id = 'ytss-panel';
    panel.dataset.theme = state.currentTheme;
    panel.innerHTML = `
      <div class="ytss-hover-pill" aria-label="YT youtube-speed-studio 收合控制器">
        <div class="ytss-hover-brand" data-drag-handle title="拖曳 youtube-speed-studio">
          <div class="ytss-hover-logo">S</div>
          <div class="ytss-hover-copy">
            <div class="ytss-hover-title">youtube-speed-studio</div>
            <div class="ytss-hover-subtitle"><span id="ytss-hover-mode">一般影片</span> · <span id="ytss-hover-shortcut">[ / ]</span></div>
          </div>
        </div>
        <button class="ytss-hover-speed" id="ytss-hover-speed" title="點擊切換 1× / 目前倍速">1×</button>
      </div>
      <div class="ytss-shell">
        <div class="ytss-header" data-drag-handle>
          <div class="ytss-title-group">
            <div class="ytss-logo">S</div>
            <div>
              <div class="ytss-title">youtube-speed-studio</div>
              <div class="ytss-subtitle"><span id="ytss-mode">一般影片</span> · <span id="ytss-shortcut">[ / ]</span></div>
            </div>
          </div>
          <div class="ytss-header-actions">
            <button class="ytss-icon-btn" id="ytss-collapse" title="收合">−</button>
            <button class="ytss-icon-btn" id="ytss-close" title="隱藏懸浮窗">×</button>
          </div>
        </div>
        <div class="ytss-body">
          <div class="ytss-main-speed">
            <button class="ytss-round-btn" id="ytss-minus" title="減速">−</button>
            <button class="ytss-speed-display" id="ytss-speed" title="點擊切換 1× / 目前倍速">1×</button>
            <button class="ytss-round-btn" id="ytss-plus" title="加速">+</button>
          </div>
          <div class="ytss-state-badges"><div class="ytss-boost-state" id="ytss-boost-state">BOOST</div><div class="ytss-pause-state" id="ytss-pause-state">1× PAUSE</div></div>
          <div class="ytss-presets" id="ytss-presets"></div>
          <div class="ytss-footer">
            <button type="button" class="ytss-hint" id="ytss-quick-down" title="點一下減速"><kbd id="ytss-key-down">[</kbd> 減速</button>
            <button type="button" class="ytss-hint" id="ytss-quick-up" title="點一下加速"><kbd id="ytss-key-up">]</kbd> 加速</button>
            <button type="button" class="ytss-hint" id="ytss-quick-boost" title="按住暫時加速"><kbd id="ytss-key-boost">\`</kbd> 按住加速</button>
            <button type="button" class="ytss-hint" id="ytss-quick-pause" title="按住暫時回到 1×"><kbd id="ytss-key-pause">&#92;</kbd> 暫停加速</button>
          </div>
          <div class="ytss-debug" id="ytss-debug"></div>
        </div>
      </div>`;
    document.documentElement.appendChild(panel);

    speedLabel = panel.querySelector('#ytss-speed');
    hoverSpeedLabel = panel.querySelector('#ytss-hover-speed');
    hoverModeBadge = panel.querySelector('#ytss-hover-mode');
    hoverShortcutLabel = panel.querySelector('#ytss-hover-shortcut');
    modeBadge = panel.querySelector('#ytss-mode');
    presetWrap = panel.querySelector('#ytss-presets');
    debugLine = panel.querySelector('#ytss-debug');

    panel.querySelector('#ytss-minus').addEventListener('click', () => adjust(-settings.step));
    panel.querySelector('#ytss-plus').addEventListener('click', () => adjust(settings.step));
    panel.querySelector('#ytss-quick-down').addEventListener('click', () => adjust(-settings.step));
    panel.querySelector('#ytss-quick-up').addEventListener('click', () => adjust(settings.step));
    const bindHoldControl = (selector, onStart, onEnd) => {
      const button = panel.querySelector(selector);
      if (!button) return;
      let held = false;
      const finish = event => {
        if (!held) return;
        held = false;
        button.classList.remove('ytss-held');
        try { if (event?.pointerId !== undefined) button.releasePointerCapture?.(event.pointerId); } catch {}
        onEnd();
      };
      button.addEventListener('pointerdown', event => {
        if (event.button !== 0 || held) return;
        event.preventDefault(); held = true; button.classList.add('ytss-held'); button.setPointerCapture?.(event.pointerId); onStart();
      });
      button.addEventListener('pointerup', finish);
      button.addEventListener('pointercancel', finish);
      button.addEventListener('lostpointercapture', () => finish());
      button.addEventListener('keydown', event => {
        if ((event.code === 'Space' || event.code === 'Enter') && !event.repeat && !held) { event.preventDefault(); held = true; button.classList.add('ytss-held'); onStart(); }
      });
      button.addEventListener('keyup', event => { if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); finish(); } });
      button.addEventListener('blur', () => finish());
    };
    bindHoldControl('#ytss-quick-boost', startBoost, () => endBoost('pointer-boost-end'));
    bindHoldControl('#ytss-quick-pause', startTemporaryPause, () => endTemporaryPause('pointer-pause-end'));
    speedLabel.addEventListener('click', toggleOneX);
    hoverSpeedLabel.addEventListener('click', toggleOneX);
    panel.querySelector('#ytss-collapse').addEventListener('click', () => setCompact(!isCompact));
    panel.querySelector('#ytss-close').addEventListener('click', () => {
      settings.floatingEnabled = false;
      queueStore({ floatingEnabled: false }, true);
      syncPanelVisibility();
    });
    panel.addEventListener('pointerenter', event => {
      panelPointerInside = true;
      rememberPointerInteraction(event, 320);
      scheduleHoverOpen();
    });
    panel.addEventListener('pointerleave', event => {
      panelPointerInside = false;
      rememberPointerInteraction(event, 320);
      scheduleHoverClose();
    });
    panel.addEventListener('pointermove', event => {
      panelPointerInside = true;
      rememberPointerInteraction(event, 220);
    });
    panel.addEventListener('pointerdown', event => {
      panelPointerInside = true;
      panelPointerDown = true;
      panelPointerId = event.pointerId;
      rememberPointerInteraction(event, 650);
      clearTimeout(hoverCloseTimer);
      setHoverExpanded(true);
    }, true);
    panel.addEventListener('mouseenter', scheduleHoverOpen);
    panel.addEventListener('mouseleave', scheduleHoverClose);
    panel.addEventListener('focusin', () => {
      hoverInteractionUntil = Math.max(hoverInteractionUntil, performance.now() + 500);
      setHoverExpanded(true);
    });
    panel.addEventListener('focusout', scheduleHoverClose);

    panel.querySelectorAll('[data-drag-handle]').forEach(handle => {
      handle.addEventListener('pointerdown', startDrag);
    });
    window.addEventListener('pointermove', drag);
    window.addEventListener('pointerup', event => {
      releasePanelPointer(event);
      endDrag();
    }, true);
    window.addEventListener('pointercancel', releasePanelPointer, true);

    applyPanelPosition();
    setCompact(settings.compactOnStart, false);
    syncHoverMode();
    renderPresets();
    updateShortcutLabels();
    applyTheme('panel-create');
    updatePanel();
    syncPanelVisibility();
  }

  function setCompact(value, persist = true) {
    isCompact = Boolean(value);
    panel?.classList.toggle('ytss-compact', isCompact);
    const btn = panel?.querySelector('#ytss-collapse');
    if (btn) btn.textContent = isCompact ? '+' : '−';
    if (persist) queueStore({ compactOnStart: isCompact });
  }

  function setHoverExpanded(value) {
    state.hoverExpanded = Boolean(value && settings.hoverExpand);
    panel?.classList.toggle('ytss-hover-expanded', state.hoverExpanded);
    // Do not reposition solely because hover state changed. Re-clamping here can move
    // the expanded hitbox away from the pointer and immediately trigger pointerleave.
  }

  function pointerInsidePanel(clientX, clientY, padding = 1) {
    if (!panel || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;
    const rect = panel.getBoundingClientRect();
    return clientX >= rect.left - padding && clientX <= rect.right + padding
      && clientY >= rect.top - padding && clientY <= rect.bottom + padding;
  }

  function rememberPointerInteraction(event, holdMs = 300) {
    if (!event) return;
    hoverInteractionUntil = Math.max(hoverInteractionUntil, performance.now() + holdMs);
  }

  function releasePanelPointer(event) {
    if (!panelPointerDown) return;
    if (panelPointerId !== null && event?.pointerId !== undefined && event.pointerId !== panelPointerId) return;
    panelPointerDown = false;
    panelPointerId = null;
    hoverInteractionUntil = Math.max(hoverInteractionUntil, performance.now() + 420);
    if (event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      panelPointerInside = pointerInsidePanel(event.clientX, event.clientY, 2);
    }
    if (!panelPointerInside) scheduleHoverClose();
  }

  function scheduleHoverOpen() {
    if (!settings.hoverExpand || !panel) return;
    clearTimeout(hoverCloseTimer);
    clearTimeout(hoverOpenTimer);
    hoverOpenTimer = setTimeout(() => setHoverExpanded(true), 90);
  }

  function attemptHoverClose() {
    if (!panel || !settings.hoverExpand) return;
    if (dragState || panelPointerDown || panelPointerInside || panel.matches(':focus-within')) return;
    const remaining = hoverInteractionUntil - performance.now();
    if (remaining > 0) {
      clearTimeout(hoverCloseTimer);
      hoverCloseTimer = setTimeout(attemptHoverClose, Math.ceil(remaining) + 20);
      return;
    }
    setHoverExpanded(false);
  }

  function scheduleHoverClose() {
    clearTimeout(hoverOpenTimer);
    clearTimeout(hoverCloseTimer);
    hoverCloseTimer = setTimeout(attemptHoverClose, 220);
  }

  function syncHoverMode() {
    if (!panel) return;
    panel.classList.toggle('ytss-hover-mode', Boolean(settings.hoverExpand));
    if (!settings.hoverExpand) setHoverExpanded(false);
    else if (panel.matches(':hover')) scheduleHoverOpen();
    else setHoverExpanded(false);
    applyPanelPosition();
  }

  function renderPresets() {
    if (!presetWrap) return;
    presetWrap.innerHTML = '';
    presetWrap.style.display = settings.showPresets ? '' : 'none';
    if (!settings.showPresets) return;
    for (const preset of settings.presets) {
      const value = Number(preset);
      if (!Number.isFinite(value) || value < settings.minSpeed || value > 16) continue;
      const button = document.createElement('button');
      button.className = 'ytss-preset';
      button.textContent = formatSpeed(value);
      button.dataset.speed = String(value);
      if (value > 4) button.dataset.extreme = 'true';
      button.addEventListener('click', () => setDesiredRate(value, { source: 'preset' }));
      presetWrap.appendChild(button);
    }
  }

  function updateShortcutLabels() {
    if (!panel) return;
    const labels = {
      '#ytss-key-down': shortcutLabel(settings.decreaseKey),
      '#ytss-key-up': shortcutLabel(settings.increaseKey),
      '#ytss-key-boost': shortcutLabel(settings.boostKey),
      '#ytss-key-pause': shortcutLabel(settings.pauseKey)
    };
    for (const [selector, text] of Object.entries(labels)) {
      const el = panel.querySelector(selector);
      if (el) el.textContent = text;
    }
    const shortcutText = `${shortcutLabel(settings.decreaseKey)} / ${shortcutLabel(settings.increaseKey)}`;
    const subtitle = panel.querySelector('#ytss-shortcut');
    if (subtitle) subtitle.textContent = shortcutText;
    if (hoverShortcutLabel) hoverShortcutLabel.textContent = shortcutText;
  }

  function updatePanel() {
    if (!panel || !speedLabel) return;
    const actual = state.video?.playbackRate;
    const speed = Number.isFinite(actual) ? actual : effectiveRate();
    const formattedSpeed = formatSpeed(speed);
    speedLabel.textContent = formattedSpeed;
    if (hoverSpeedLabel) hoverSpeedLabel.textContent = formattedSpeed;
    speedLabel.classList.toggle('ytss-extreme', speed > 4);
    hoverSpeedLabel?.classList.toggle('ytss-extreme', speed > 4);
    panel.classList.toggle('ytss-one-x-active', state.oneXToggleActive || state.pauseActive);
    const shorts = (state.mode || mode()) === 'shorts';
    const modeText = shorts ? 'Shorts' : '一般影片';
    const platformText = provider.label || 'Video';
    const modeClass = shorts ? 'ytss-mode-shorts' : 'ytss-mode-general';
    modeBadge.textContent = isYoutube() ? modeText : `${platformText} · ${modeText}`;
    modeBadge.className = modeClass;
    panel.dataset.platform = provider.id;
    if (hoverModeBadge) {
      hoverModeBadge.textContent = isYoutube() ? modeText : `${platformText} · ${modeText}`;
      hoverModeBadge.className = modeClass;
    }
    panel.style.setProperty('--ytss-opacity', String(settings.panelOpacity / 100));
    panel.dataset.accent = settings.accentColor || 'violet';
    panel.querySelector('#ytss-boost-state')?.classList.toggle('active', state.boostActive && !state.pauseActive);
    panel.querySelector('#ytss-pause-state')?.classList.toggle('active', state.pauseActive);
    panel.querySelectorAll('.ytss-preset').forEach(button => {
      button.classList.toggle('active', Math.abs(Number(button.dataset.speed) - state.desiredRate) < 0.01 && !state.boostActive && !state.pauseActive && !state.oneXToggleActive);
      button.disabled = !settings.extremeMode && Number(button.dataset.speed) > 4;
    });
    if (debugLine) {
      debugLine.style.display = settings.diagnosticsEnabled ? '' : 'none';
      if (settings.diagnosticsEnabled) {
        const profile = state.desiredScope;
        const transient = state.pauseActive ? 'pause' : state.boostActive ? 'boost' : state.oneXToggleActive ? '1x' : 'normal';
        debugLine.textContent = `${state.currentTheme} · ${pageType()} · ${profile} · ${transient} · v${state.videoGeneration} · score ${state.resolvedVideoScore} · ${state.lastApplyReason}${state.lastError ? ` · ${state.lastError}` : ''}`;
      }
    }
  }

  function syncPanelVisibility() {
    if (!panel) return;
    const suppressedBySearch = settings.hideFloatingOnSearch && isSearchPage();
    panel.style.display = settings.enabled && platformEnabled() && settings.floatingEnabled && !suppressedBySearch ? '' : 'none';
  }

  function applyPanelPosition() {
    if (!panel) return;
    const pos = settings.position || {};
    if (Number.isFinite(pos.x)) {
      const targetWidth = settings.hoverExpand && !state.hoverExpanded ? 236 : 290;
      const panelWidth = settings.hoverExpand ? Math.min(targetWidth, Math.max(140, window.innerWidth - 16)) : panel.offsetWidth;
      const maxX = Math.max(8, window.innerWidth - panelWidth - 8);
      panel.style.left = `${clamp(pos.x, 8, maxX)}px`;
      panel.style.right = 'auto';
    } else {
      panel.style.left = 'auto';
      panel.style.right = '24px';
    }
    const panelHeight = settings.hoverExpand && state.hoverExpanded ? Math.max(panel.offsetHeight, 230) : panel.offsetHeight;
    const maxY = Math.max(8, window.innerHeight - panelHeight - 8);
    panel.style.top = `${clamp(safeNumber(pos.y, 100), 8, maxY)}px`;
  }

  function startDrag(event) {
    if (event.button !== 0 || event.target.closest('button')) return;
    const rect = panel.getBoundingClientRect();
    dragState = { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    panel.classList.add('ytss-dragging');
    setHoverExpanded(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function drag(event) {
    if (!dragState || !panel) return;
    const maxX = window.innerWidth - panel.offsetWidth - 8;
    const maxY = window.innerHeight - panel.offsetHeight - 8;
    const x = clamp(event.clientX - dragState.offsetX, 8, Math.max(8, maxX));
    const y = clamp(event.clientY - dragState.offsetY, 8, Math.max(8, maxY));
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
    panel.style.right = 'auto';
  }

  function endDrag() {
    if (!dragState || !panel) return;
    dragState = null;
    panel.classList.remove('ytss-dragging');
    const rect = panel.getBoundingClientRect();
    settings.position = { x: Math.round(rect.left), y: Math.round(rect.top) };
    queueStore({ position: settings.position }, true);
    scheduleHoverClose();
  }

  function attachPlayerObserver() {
    const root = provider.playerRoot?.(state.video) || null;
    if (root === playerObserverRoot) return;
    playerObserver?.disconnect();
    playerObserver = null;
    playerObserverRoot = root;
    if (!root) return;

    playerObserver = new MutationObserver(records => {
      for (const record of records) {
        for (const node of [...record.addedNodes, ...record.removedNodes]) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.tagName === 'VIDEO' || node.querySelector?.('video')) {
            scheduleRecovery('player-video-mutation', 100);
            return;
          }
        }
      }
    });
    playerObserver.observe(root, { childList: true, subtree: true });
  }

  function attachTitleObserver() {
    const title = document.querySelector('title');
    if (!title || titleObserver) return;
    titleObserver = new MutationObserver(() => scheduleRecovery('title-change', 180));
    titleObserver.observe(title, { childList: true, characterData: true, subtree: true });
  }

  function attachThemeObserver() {
    themeObserver?.disconnect();
    const roots = [document.documentElement, document.body, isYoutube() ? document.querySelector('ytd-app') : document.querySelector('.bpx-player-container, #app')].filter(Boolean);
    themeObserver = new MutationObserver(() => {
      clearTimeout(themeObserver._timer);
      themeObserver._timer = setTimeout(() => applyTheme('theme-mutation'), 120);
    });
    for (const root of roots) {
      themeObserver.observe(root, { attributes: true, attributeFilter: ['dark', 'class', 'style'] });
    }
  }

  function scheduleRecovery(reason, delay = 120) {
    clearTimeout(recoveryTimer);
    recoveryTimer = setTimeout(() => recover(reason), delay);
  }

  function recover(reason = 'recover') {
    state.urlSnapshot = location.href;
    applyMode(true, reason);
    resolveAndBind(reason);
    attachPlayerObserver();
    attachTitleObserver();
    attachThemeObserver();
    updateContext(reason);
    applyTheme(reason);
    publishRuntimeStatus(reason);
    syncPanelVisibility();
    updatePanel();
  }

  function runtimeStateSnapshot() {
    return {
      ok: true,
      protocol: RUNTIME_PROTOCOL,
      version: EXTENSION_VERSION,
      context: state.currentContext,
      diagnostics: diagnosticsSnapshot(),
      hoverExpand: settings.hoverExpand,
      hoverExpanded: state.hoverExpanded
    };
  }

  function isVisibleElement(element) {
    if (!element?.isConnected) return false;
    const rect = element.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function requestDownloadStudioInfo(timeoutMs = 5200) {
    return new Promise(resolve => {
      let settled = false;
      const cleanup = () => {
        clearTimeout(timer);
        document.removeEventListener(DOWNLOAD_INFO_READY_EVENT, onReady, true);
      };
      const finish = value => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };
      const read = () => {
        const raw = document.documentElement?.getAttribute(DOWNLOAD_INFO_ATTR);
        if (!raw) return null;
        document.documentElement.removeAttribute(DOWNLOAD_INFO_ATTR);
        try { return JSON.parse(raw); } catch { return null; }
      };
      const onReady = () => finish(read());
      const timer = setTimeout(() => finish(read()), timeoutMs);
      document.addEventListener(DOWNLOAD_INFO_READY_EVENT, onReady, true);
      document.dispatchEvent(new Event(DOWNLOAD_INFO_REQUEST_EVENT));
    });
  }

  async function getDownloadStudioInfo() {
    if (!isYoutube() || !provider.supportsDownloadStudio || !['watch', 'shorts'].includes(pageType())) {
      return { ok: false, code: 'youtube-video-required', message: 'Download Studio 目前只支援 YouTube 影片 / Shorts；bilibili 本版先提供播放控制。', info: null };
    }
    let info = await requestDownloadStudioInfo();
    if (!info) return { ok: false, code: 'bridge-timeout', message: '無法讀取目前影片格式；請重新載入 YouTube 分頁。', info: null };
    const initialCoverage = info?.qualityCoverage || {};
    if ((initialCoverage.expectedMaxHeight || initialCoverage.advertisedMaxHeight || 0) > (initialCoverage.resolvedMaxHeight || 0)) {
      await new Promise(resolve => setTimeout(resolve, 650));
      const retry = await requestDownloadStudioInfo(4600);
      const retryResolved = retry?.qualityCoverage?.resolvedMaxHeight || 0;
      const initialResolved = initialCoverage.resolvedMaxHeight || 0;
      if (retry && (retryResolved > initialResolved || (retry?.choices?.length || 0) > (info?.choices?.length || 0))) info = retry;
    }
    const choices = Array.isArray(info.choices) ? info.choices : [];
    if (!choices.length) {
      return { ok: false, code: 'no-download-choice', message: info.unavailableReason || '目前沒有可直接取得的 MP4 格式。', info: { ...info, choices: [] } };
    }
    return {
      ok: true,
      code: 'download-studio-ready',
      message: `找到 ${choices.length} 個可下載 MP4 選項。`,
      info
    };
  }

  function findNativeDownloadButton() {
    const renderers = [
      ...document.querySelectorAll(
        'ytd-watch-metadata ytd-download-button-renderer, #below ytd-download-button-renderer, '
        + 'ytd-menu-popup-renderer ytd-menu-service-item-download-renderer'
      )
    ];
    for (const renderer of renderers) {
      const button = renderer.querySelector('button, a, tp-yt-paper-button') || renderer;
      if (isVisibleElement(button)) return button;
    }
    const labeled = [...document.querySelectorAll('ytd-watch-metadata #actions button[aria-label], #below button[aria-label], ytd-menu-popup-renderer [aria-label]')]
      .find(button => /download|下載|ダウンロード|descargar|télécharger|herunterladen/i.test(button.getAttribute('aria-label') || '') && isVisibleElement(button));
    return labeled || null;
  }

  function findMoreActionsButton() {
    const direct = document.querySelector('ytd-watch-metadata #actions ytd-menu-renderer yt-icon-button#button, ytd-watch-metadata #actions #button-shape button');
    if (isVisibleElement(direct)) return direct;
    return [...document.querySelectorAll('ytd-watch-metadata #actions button[aria-label], #below button[aria-label]')]
      .find(button => /more actions|更多動作|更多操作|その他の操作|más acciones|plus d.actions|weitere aktionen/i.test(button.getAttribute('aria-label') || '') && isVisibleElement(button)) || null;
  }

  async function triggerNativeDownload() {
    if (!isYoutube() || pageType() !== 'watch') {
      return { ok: false, code: 'watch-page-required', message: '請先開啟一般 YouTube 影片頁。' };
    }
    let button = findNativeDownloadButton();
    if (!button) {
      const more = findMoreActionsButton();
      more?.click();
      scheduleRecovery('download-request', 0);
      await new Promise(resolve => setTimeout(resolve, more ? 320 : 250));
      button = findNativeDownloadButton();
    }
    if (!button) {
      return {
        ok: false,
        code: 'native-download-unavailable',
        message: '目前影片／帳號沒有顯示 YouTube 官方下載按鈕；可能需要 Premium 或此影片不支援下載。'
      };
    }
    button.click();
    return { ok: true, code: 'native-download-clicked', message: '已開啟 YouTube 官方下載流程。' };
  }

  function publishRuntimeStatus(reason = 'runtime') {
    queueStore({
      [RUNTIME_KEYS.status]: {
        version: EXTENSION_VERSION,
        protocol: RUNTIME_PROTOCOL,
        href: location.href,
        platform: provider.id,
        platformLabel: provider.label,
        pageType: pageType(),
        at: Date.now(),
        reason
      }
    });
  }

  function installRuntimeMessaging() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || typeof message !== 'object') return false;
      if (message.type === 'YTSS_GET_RUNTIME') {
        updateContext('popup-live', { forceMetaFallback: true });
        applyTheme('popup-live');
        publishRuntimeStatus('popup-live');
        sendResponse(runtimeStateSnapshot());
        return false;
      }
      if (message.type === 'YTSS_RECOVER') {
        recover('popup-recover');
        sendResponse(runtimeStateSnapshot());
        return false;
      }
      if (message.type === 'YTSS_GET_DOWNLOAD_STUDIO') {
        getDownloadStudioInfo().then(sendResponse).catch(error => sendResponse({
          ok: false,
          code: 'download-studio-error',
          message: error?.message || String(error),
          info: null
        }));
        return true;
      }
      if (message.type === 'YTSS_NATIVE_DOWNLOAD') {
        triggerNativeDownload().then(sendResponse).catch(error => sendResponse({
          ok: false,
          code: 'download-error',
          message: error?.message || String(error)
        }));
        return true;
      }
      return false;
    });
  }

  function diagnosticsSnapshot() {
    return {
      at: Date.now(),
      version: EXTENSION_VERSION,
      protocol: RUNTIME_PROTOCOL,
      href: location.href,
      platform: provider.id,
      platformLabel: provider.label,
      pageType: pageType(),
      mode: state.mode || mode(),
      theme: state.currentTheme,
      enabled: settings.enabled,
      desiredRate: state.desiredRate,
      actualRate: state.video ? roundSpeed(state.video.playbackRate) : null,
      effectiveRate: effectiveRate(),
      boostActive: state.boostActive,
      pauseActive: state.pauseActive,
      oneXToggleActive: state.oneXToggleActive,
      effectiveLockSpeed: effectiveLockSpeed(),
      effectivePreservePitch: effectivePreservePitch(),
      panelSuppressed: !platformEnabled() || (settings.hideFloatingOnSearch && isSearchPage()),
      hoverExpand: settings.hoverExpand,
      hoverExpanded: state.hoverExpanded,
      desiredScope: state.desiredScope,
      desiredScopeKey: state.desiredScopeKey,
      videoGeneration: state.videoGeneration,
      candidateCount: state.candidateCount,
      resolvedVideoScore: state.resolvedVideoScore,
      lastApplyReason: state.lastApplyReason,
      lastError: state.lastError,
      context: state.currentContext
    };
  }

  function scheduleDiagnostics() {
    clearTimeout(diagnosticTimer);
    diagnosticTimer = setTimeout(() => queueStore({ [RUNTIME_KEYS.diagnostics]: diagnosticsSnapshot() }), 500);
  }

  function onStorageChanged(changes, area) {
    if (area !== 'local') return;
    let settingChanged = false;
    for (const [key, change] of Object.entries(changes)) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, key)) {
        settings[key] = change.newValue;
        settingChanged = true;
      }
    }
    if (!settingChanged) return;

    normalizeSettings();
    if (changes.presets || changes.showPresets || changes.minSpeed || changes.maxSpeed || changes.extremeMode) renderPresets();
    if (changes.position) applyPanelPosition();
    if (changes.compactOnStart) setCompact(settings.compactOnStart, false);
    if (changes.hoverExpand) syncHoverMode();
    if (changes.decreaseKey || changes.increaseKey || changes.boostKey || changes.pauseKey) updateShortcutLabels();
    if (changes.themeMode) applyTheme('settings-theme');
    if (changes.preservePitch || changes.profiles || changes.profilesEnabled) applyPitch();
    if (changes.enabled && !settings.enabled) {
      state.boostActive = false;
      state.pauseActive = false;
      state.oneXToggleActive = false;
    }

    if (changes.generalSpeed || changes.shortsSpeed || changes.profiles || changes.profilesEnabled || changes.bilibiliEnabled ||
        changes.minSpeed || changes.maxSpeed || changes.extremeMode || changes.enabled || changes.lockSpeed || changes.boostSpeed || changes.preservePitch) {
      refreshDesiredRate('settings');
      if (settings.enabled) applyRate('settings');
    }

    syncPanelVisibility();
    updatePanel();
    scheduleDiagnostics();
  }

  function installLifecycleListeners() {
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
    const navigate = (reason, delay) => {
      if (location.href !== state.urlSnapshot) {
        state.oneXToggleActive = false;
        state.contextRetryCount = 0;
      }
      scheduleRecovery(reason, delay);
    };
    for (const eventName of provider.navigationEvents || []) {
      document.addEventListener(eventName, () => navigate(eventName, eventName === 'yt-page-data-updated' ? 140 : 100), true);
    }
    if (isYoutube()) document.addEventListener(PAGE_CONTEXT_READY_EVENT, () => scheduleRecovery('page-context-ready', 0), true);
    window.addEventListener('popstate', () => navigate('popstate', 100));
    window.addEventListener('pageshow', () => scheduleRecovery('pageshow', 80));
    window.addEventListener('focus', () => scheduleRecovery('focus', 120));
    window.addEventListener('blur', () => {
      endBoost('blur');
      endTemporaryPause('blur');
    });
    window.addEventListener('resize', applyPanelPosition);
    window.addEventListener('pagehide', () => { if (Object.keys(pendingStore).length) flushStore(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        endBoost('hidden');
        endTemporaryPause('hidden');
        if (Object.keys(pendingStore).length) flushStore();
      } else scheduleRecovery('visible', 80);
    });
    chrome.storage.onChanged.addListener(onStorageChanged);

    setInterval(() => {
      if (location.href !== state.urlSnapshot) {
        state.urlSnapshot = location.href;
        state.oneXToggleActive = false;
        state.contextRetryCount = 0;
        scheduleRecovery('url-fallback', 80);
        return;
      }
      if (document.visibilityState !== 'visible') return;
      if (!state.video || !state.video.isConnected) {
        scheduleRecovery('health-missing-video', 0);
        return;
      }
      if (settings.enabled && platformEnabled() && (effectiveLockSpeed() || state.boostActive || state.pauseActive || state.oneXToggleActive) && Math.abs(state.video.playbackRate - effectiveRate()) > 0.001) {
        applyRate('health-lock');
      }
    }, 4000);
  }

  async function init() {
    await loadSettings();
    requestMainWorldContext();
    state.mode = mode();
    state.currentContext = extractContext();
    state.currentTheme = detectPageTheme();
    refreshDesiredRate('init');
    createPanel();
    installLifecycleListeners();
    installRuntimeMessaging();
    recover('init');
  }

  init().catch(error => {
    console.error('[youtube-speed-studio] init failed', error);
  });
})();
