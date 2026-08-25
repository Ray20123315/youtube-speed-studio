(() => {
  'use strict';
  if (globalThis.YTSSDebug) return;

  const VERSION = chrome.runtime.getManifest().version;
  const BUILD = 'forensics-1';
  const PREFIX = 'ytssDebugLog:';
  const MAX_ENTRIES = 260;
  const MAX_SESSIONS = 18;
  const TTL_MS = 24 * 60 * 60 * 1000;
  const MAX_STRING = 1600;
  const MAX_ARRAY = 40;
  const MAX_OBJECT_KEYS = 60;
  const SENSITIVE_KEY = /(authorization|cookie|set-cookie|token|po[_-]?token|signature|sig|lsig|cipher|password|secret|credential)/i;
  const contextKind = location.protocol === 'chrome-extension:'
    ? (location.pathname.endsWith('/debug.html') ? 'debug-dashboard' : location.pathname.endsWith('/options.html') ? 'options' : location.pathname.endsWith('/popup.html') ? 'popup' : 'extension-page')
    : 'content';
  const randomId = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const sessionId = `${contextKind}:${randomId()}`;
  const storageKey = `${PREFIX}${sessionId}`;
  const startedAt = Date.now();
  const entries = [];
  const eventIds = new WeakMap();
  const bubbled = new Set();
  let eventSeq = 0;
  let flushTimer = null;
  let panelObserver = null;

  function safeUrl(raw) {
    const text = String(raw || '');
    if (!text.trim()) return '';
    try {
      const url = new URL(text, location.href);
      const host = url.hostname.toLowerCase();
      if (host === 'googlevideo.com' || host.endsWith('.googlevideo.com') || /\/videoplayback(?:$|[/?])/i.test(url.pathname)) {
        return `<redacted-googlevideo-url host=${host || 'unknown'}>`;
      }
      const out = new URL(url.origin + url.pathname);
      if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
        for (const key of ['v', 'list']) {
          const value = url.searchParams.get(key);
          if (value) out.searchParams.set(key, value.slice(0, 160));
        }
        return out.href;
      }
      if (url.protocol === 'chrome-extension:') return `${url.origin}${url.pathname}${url.hash || ''}`;
      if (url.protocol === 'http:' || url.protocol === 'https:') return `${url.origin}${url.pathname}`;
      return `${url.protocol}${url.pathname}`;
    } catch {
      return text.slice(0, MAX_STRING);
    }
  }

  function sanitize(value, key = '', depth = 0, seen = new WeakSet()) {
    if (SENSITIVE_KEY.test(key)) return '<redacted>';
    if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
    if (value instanceof Error) return sanitize({ name: value.name, message: value.message, stack: value.stack }, key, depth + 1, seen);
    if (typeof value === 'string') {
      const text = value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…<truncated>` : value;
      if (/^(https?:\/\/|chrome-extension:\/\/)/i.test(text)) return safeUrl(text);
      if (/googlevideo|videoplayback|authorization:|cookie:/i.test(text)) return '<redacted-sensitive-string>';
      return text;
    }
    if (typeof value === 'bigint') return String(value);
    if (typeof value === 'function') return `<function ${value.name || 'anonymous'}>`;
    if (depth >= 5) return '<max-depth>';
    if (typeof value === 'object') {
      if (seen.has(value)) return '<circular>';
      seen.add(value);
      if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map((item, index) => sanitize(item, `${key}[${index}]`, depth + 1, seen));
      const out = {};
      for (const [childKey, child] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) out[childKey] = sanitize(child, childKey, depth + 1, seen);
      return out;
    }
    return String(value).slice(0, MAX_STRING);
  }

  function log(level, event, data = null) {
    const entry = {
      at: Date.now(),
      perf: Math.round((performance?.now?.() || 0) * 100) / 100,
      sessionId,
      context: contextKind,
      level,
      event,
      data: sanitize(data)
    };
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    scheduleFlush();
    try { console.debug('[YTSS-DIAG]', event, entry.data); } catch {}
    return entry;
  }

  function scheduleFlush() {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 120);
  }

  async function flush() {
    clearTimeout(flushTimer);
    flushTimer = null;
    try {
      await chrome.storage.local.set({
        [storageKey]: {
          meta: { sessionId, context: contextKind, version: VERSION, build: BUILD, startedAt, href: safeUrl(location.href) },
          updatedAt: Date.now(),
          entries: entries.slice(-MAX_ENTRIES)
        }
      });
    } catch (error) {
      try { console.warn('[YTSS-DIAG] flush failed', error); } catch {}
    }
  }

  async function purgeOldLogs() {
    try {
      const all = await chrome.storage.local.get(null);
      const sessions = Object.entries(all)
        .filter(([key]) => key.startsWith(PREFIX))
        .map(([key, value]) => ({ key, updatedAt: Number(value?.updatedAt || 0) }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
      const remove = sessions.filter((item, index) => Date.now() - item.updatedAt > TTL_MS || index >= MAX_SESSIONS).map(item => item.key);
      if (remove.length) await chrome.storage.local.remove(remove);
    } catch {}
  }

  function describeElement(el) {
    if (!(el instanceof Element)) return null;
    let style = null;
    try { style = getComputedStyle(el); } catch {}
    const rect = el.getBoundingClientRect?.();
    return {
      tag: el.tagName?.toLowerCase?.() || null,
      id: el.id || null,
      className: typeof el.className === 'string' ? el.className.slice(0, 240) : null,
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100),
      speed: el.getAttribute?.('data-speed') || null,
      disabled: 'disabled' in el ? Boolean(el.disabled) : null,
      ariaDisabled: el.getAttribute?.('aria-disabled'),
      pointerEvents: style?.pointerEvents || null,
      visibility: style?.visibility || null,
      display: style?.display || null,
      zIndex: style?.zIndex || null,
      rect: rect ? { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) } : null
    };
  }

  function selectVideo() {
    const videos = [...document.querySelectorAll('video')].filter(video => video?.isConnected);
    if (!videos.length) return null;
    return videos.sort((a, b) => {
      const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
      const as = (!a.paused ? 1000000 : 0) + Math.max(0, ar.width) * Math.max(0, ar.height);
      const bs = (!b.paused ? 1000000 : 0) + Math.max(0, br.width) * Math.max(0, br.height);
      return bs - as;
    })[0];
  }

  function videoSnapshot() {
    const video = selectVideo();
    if (!video) return { found: false };
    let currentSrcHost = null;
    try { currentSrcHost = video.currentSrc ? new URL(video.currentSrc, location.href).hostname : null; } catch {}
    return {
      found: true,
      playbackRate: Number(video.playbackRate),
      defaultPlaybackRate: Number(video.defaultPlaybackRate),
      paused: Boolean(video.paused),
      ended: Boolean(video.ended),
      readyState: Number(video.readyState),
      networkState: Number(video.networkState),
      currentTime: Math.round(Number(video.currentTime || 0) * 100) / 100,
      currentSrcHost: currentSrcHost ? (currentSrcHost.endsWith('googlevideo.com') ? '<googlevideo>' : currentSrcHost) : null
    };
  }

  function computed(selector, root = document) {
    const el = root.querySelector?.(selector);
    if (!el) return { selector, exists: false };
    const view = el.ownerDocument?.defaultView || globalThis;
    const s = view.getComputedStyle ? view.getComputedStyle(el) : getComputedStyle(el);
    return {
      selector,
      exists: true,
      color: s.color,
      backgroundColor: s.backgroundColor,
      backgroundImage: s.backgroundImage,
      borderColor: s.borderColor,
      boxShadow: s.boxShadow,
      pointerEvents: s.pointerEvents,
      opacity: s.opacity,
      vars: {
        accent: s.getPropertyValue('--accent').trim(),
        accent2: s.getPropertyValue('--accent2').trim(),
        ytssAccent: s.getPropertyValue('--ytss-accent').trim(),
        ytssAccent2: s.getPropertyValue('--ytss-accent-2').trim(),
        ytssBorder: s.getPropertyValue('--ytss-accent-border').trim()
      }
    };
  }

  function panelSnapshot() {
    const panel = document.getElementById('ytss-panel');
    if (!panel) return { exists: false };
    return {
      exists: true,
      dataset: { accent: panel.dataset.accent || null, theme: panel.dataset.theme || null },
      className: panel.className,
      panel: computed('#ytss-panel'),
      speed: computed('#ytss-speed'),
      activePreset: computed('#ytss-panel .ytss-preset.active'),
      logo: computed('#ytss-panel .ytss-logo')
    };
  }

  function pageSnapshot() {
    return {
      href: safeUrl(location.href),
      title: String(document.title || '').slice(0, 240),
      visibilityState: document.visibilityState,
      bodyDataset: document.body ? { ...document.body.dataset } : null,
      panel: panelSnapshot(),
      video: videoSnapshot()
    };
  }

  function isPanelEvent(event) {
    const target = event.target instanceof Element ? event.target : null;
    return Boolean(target?.closest?.('#ytss-panel'));
  }

  function hitStack(event) {
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY) || !document.elementsFromPoint) return [];
    try { return document.elementsFromPoint(event.clientX, event.clientY).slice(0, 10).map(describeElement); } catch { return []; }
  }

  function capturePanelEvent(event) {
    if (!isPanelEvent(event)) return;
    let id = eventIds.get(event);
    if (!id) { id = ++eventSeq; eventIds.set(event, id); }
    const before = videoSnapshot();
    log('info', `panel.${event.type}.capture`, {
      id,
      target: describeElement(event.target),
      defaultPrevented: event.defaultPrevented,
      cancelBubble: event.cancelBubble,
      coordinates: { x: event.clientX, y: event.clientY },
      hitStack: hitStack(event),
      videoBefore: before,
      panel: panelSnapshot()
    });
    if (event.type === 'click') {
      setTimeout(() => {
        log('info', 'panel.click.result', {
          id,
          bubbleReached: bubbled.has(id),
          videoBefore: before,
          videoAfter: videoSnapshot(),
          panel: panelSnapshot()
        });
        bubbled.delete(id);
      }, 220);
    }
  }

  function bubblePanelEvent(event) {
    if (!isPanelEvent(event)) return;
    const id = eventIds.get(event) || ++eventSeq;
    bubbled.add(id);
    log('info', `panel.${event.type}.bubble`, { id, target: describeElement(event.target), defaultPrevented: event.defaultPrevented });
  }

  function installPanelObserver() {
    if (panelObserver || !document.documentElement) return;
    panelObserver = new MutationObserver(records => {
      const relevant = records.some(record => {
        const target = record.target instanceof Element ? record.target : null;
        return target?.id === 'ytss-panel' || target?.closest?.('#ytss-panel') || [...record.addedNodes].some(node => node instanceof Element && (node.id === 'ytss-panel' || node.querySelector?.('#ytss-panel')));
      });
      if (relevant) log('info', 'panel.mutation', panelSnapshot());
    });
    panelObserver.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-accent', 'style', 'disabled', 'aria-disabled'] });
  }

  function optionPageSnapshot(doc = document) {
    const statusIds = ['profileRuntimeStatus','downloadProviderStatus','downloadTitle','downloadMeta','downloadNativeMax','downloadAdvertisedMax','downloadResolvedMax','downloadCoverageState','downloadFallbackStatus','downloadJobStatus','downloadStage','saveState','versionLabel'];
    const statuses = {};
    for (const id of statusIds) statuses[id] = doc.getElementById(id)?.textContent?.trim?.() || null;
    const selectors = ['.download-hero','.download-hero .eyebrow','.download-video-copy small','.quality-summary article.accent','.q-chip.info','.download-choice.selected','.safe-badge','.primary-outline-btn','.nav-item.active','.side-brand .logo'];
    return {
      href: safeUrl(doc.defaultView?.location?.href || ''),
      bodyDataset: doc.body ? { ...doc.body.dataset } : null,
      statuses,
      computed: selectors.map(selector => computed(selector, doc))
    };
  }

  function popupPageSnapshot(doc = document) {
    const ids = ['runtimeStatus','status','versionBadge','officialBadge'];
    const statuses = {};
    for (const id of ids) statuses[id] = doc.getElementById(id)?.textContent?.trim?.() || null;
    return {
      href: safeUrl(doc.defaultView?.location?.href || ''),
      bodyDataset: doc.body ? { ...doc.body.dataset } : null,
      statuses,
      computed: ['.logo','.mode-card.general','.studio-badge','.studio-open-btn','.options-cta button'].map(selector => computed(selector, doc))
    };
  }

  async function collectLogs() {
    await flush();
    const all = await chrome.storage.local.get(null);
    const sessions = Object.entries(all)
      .filter(([key]) => key.startsWith(PREFIX))
      .map(([, value]) => value)
      .filter(Boolean)
      .sort((a, b) => Number(a?.meta?.startedAt || 0) - Number(b?.meta?.startedAt || 0));
    const timeline = sessions.flatMap(session => Array.isArray(session.entries) ? session.entries : []).sort((a, b) => Number(a.at || 0) - Number(b.at || 0));
    return sanitize({ sessions, timeline });
  }

  async function clearLogs() {
    const all = await chrome.storage.local.get(null);
    const keys = Object.keys(all).filter(key => key.startsWith(PREFIX));
    if (keys.length) await chrome.storage.local.remove(keys);
    entries.length = 0;
    log('info', 'diagnostic.logs.cleared', { by: contextKind });
    await flush();
  }

  async function sendTabMessage(tabId, message) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      return { ok: true, response: sanitize(response) };
    } catch (error) {
      return { ok: false, error: sanitize(error) };
    }
  }

  async function collectTabEvidence() {
    if (!chrome.tabs?.query) return [];
    const tabs = await chrome.tabs.query({});
    const candidates = tabs.filter(tab => {
      try {
        const u = new URL(String(tab.url || tab.pendingUrl || ''));
        const h = u.hostname.toLowerCase();
        return h === 'youtube.com' || h.endsWith('.youtube.com') || h === 'bilibili.com' || h.endsWith('.bilibili.com');
      } catch { return false; }
    });
    const result = [];
    for (const tab of candidates.slice(0, 20)) {
      const directDebug = await sendTabMessage(tab.id, { type: 'YTSS_DEBUG_SNAPSHOT' });
      const normalRuntime = await sendTabMessage(tab.id, { type: 'YTSS_GET_RUNTIME' });
      let clientProbe = null;
      try {
        if (globalThis.YTSSRuntimeClient?.probe) clientProbe = sanitize(await globalThis.YTSSRuntimeClient.probe(tab.id, 1));
      } catch (error) { clientProbe = { ok: false, error: sanitize(error) }; }
      result.push({ id: tab.id, active: tab.active, title: String(tab.title || '').slice(0, 200), url: safeUrl(tab.url || tab.pendingUrl || ''), directDebug, normalRuntime, clientProbe });
    }
    return result;
  }

  function safeSettings(all) {
    const keys = ['enabled','floatingEnabled','hoverExpand','hideFloatingOnSearch','rememberLast','generalSpeed','shortsSpeed','step','minSpeed','maxSpeed','extremeMode','showPresets','presets','panelOpacity','compactOnStart','position','lockSpeed','resetSpeed','preservePitch','decreaseKey','increaseKey','boostKey','pauseKey','boostSpeed','themeMode','profilesEnabled','profiles','diagnosticsEnabled','downloadSaveAs','downloadDefaultQuality','bilibiliEnabled','uiLanguage','accentColor','uiBackground','updateCheckEnabled','ytssRuntimeStatus','ytssRuntimeDiagnostics','ytssLastTheme','ytssIntegrityState'];
    return sanitize(Object.fromEntries(keys.filter(key => Object.prototype.hasOwnProperty.call(all, key)).map(key => [key, all[key]])));
  }

  async function collectSupportBundle({ optionFrame = null, popupFrame = null } = {}) {
    const all = await chrome.storage.local.get(null);
    const params = new URLSearchParams(location.search);
    const tabEvidence = await collectTabEvidence();
    const logs = await collectLogs();
    const bundle = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      testBuild: { name: chrome.runtime.getManifest().name, version: VERSION, build: BUILD },
      browser: { userAgent: navigator.userAgent, language: navigator.language, languages: navigator.languages, platform: navigator.platform },
      dashboard: { href: safeUrl(location.href), sourceTabId: params.get('sourceTabId'), sourceUrl: safeUrl(params.get('sourceUrl') || ''), page: pageSnapshot() },
      settingsAndRuntimeStorage: safeSettings(all),
      tabs: tabEvidence,
      currentOptionsFrame: optionFrame?.contentDocument ? optionPageSnapshot(optionFrame.contentDocument) : null,
      currentPopupFrame: popupFrame?.contentDocument ? popupPageSnapshot(popupFrame.contentDocument) : null,
      logs
    };
    return sanitize(bundle);
  }

  function installErrorCapture() {
    globalThis.addEventListener?.('error', event => log('error', 'global.error', { message: event.message, filename: safeUrl(event.filename || ''), lineno: event.lineno, colno: event.colno, error: event.error }), true);
    globalThis.addEventListener?.('unhandledrejection', event => log('error', 'global.unhandledrejection', { reason: event.reason }), true);
  }

  function installEventCapture() {
    if (!document?.documentElement) return;
    window.addEventListener('pointerdown', capturePanelEvent, true);
    window.addEventListener('pointerup', capturePanelEvent, true);
    window.addEventListener('click', capturePanelEvent, true);
    window.addEventListener('click', bubblePanelEvent, false);
    document.addEventListener('visibilitychange', () => log('info', 'page.visibility', { state: document.visibilityState, page: pageSnapshot() }), true);
    window.addEventListener('focus', () => log('info', 'page.focus', pageSnapshot()), true);
    window.addEventListener('pageshow', event => log('info', 'page.pageshow', { persisted: event.persisted, page: pageSnapshot() }), true);
    installPanelObserver();
  }

  function installMessageProbe() {
    try {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message?.type !== 'YTSS_DEBUG_SNAPSHOT') return false;
        const snapshot = { ok: true, version: VERSION, build: BUILD, sessionId, context: contextKind, page: pageSnapshot(), sender: { tabId: sender?.tab?.id ?? null, frameId: sender?.frameId ?? null } };
        log('info', 'debug.snapshot.request', { sender: snapshot.sender });
        sendResponse(snapshot);
        return false;
      });
    } catch (error) { log('error', 'debug.snapshot.listener-failed', { error }); }
  }

  purgeOldLogs();
  installErrorCapture();
  installEventCapture();
  installMessageProbe();
  log('info', 'diagnostic.boot', { version: VERSION, build: BUILD, context: contextKind, href: safeUrl(location.href), page: pageSnapshot() });

  globalThis.YTSSDebug = Object.freeze({
    version: VERSION,
    build: BUILD,
    sessionId,
    contextKind,
    log,
    flush,
    sanitize,
    safeUrl,
    pageSnapshot,
    panelSnapshot,
    optionPageSnapshot,
    popupPageSnapshot,
    collectLogs,
    clearLogs,
    collectTabEvidence,
    collectSupportBundle
  });
})();
