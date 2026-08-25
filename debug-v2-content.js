(() => {
  'use strict';
  const prior = globalThis.__YTSS_DEBUG_V2__;
  try { prior?.deactivate?.(); } catch {}
  try { delete globalThis.__YTSS_DEBUG_V2__; } catch {}

  const debug = globalThis.YTSSDebug;
  if (!debug?.log || !debug?.flush) return;
  const VERSION = chrome.runtime.getManifest().version;
  const SESSION = debug.sessionId || null;
  const bubbled = new Set();
  const eventIds = new WeakMap();
  let eventSeq = 0;
  let active = true;

  const clampText = value => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  const round = n => Number.isFinite(Number(n)) ? Math.round(Number(n) * 100) / 100 : null;

  function describeElement(el) {
    if (!(el instanceof Element)) return null;
    let style = null;
    try { style = getComputedStyle(el); } catch {}
    const r = el.getBoundingClientRect?.();
    return {
      tag: el.tagName?.toLowerCase?.() || null,
      id: el.id || null,
      className: typeof el.className === 'string' ? el.className.slice(0, 220) : null,
      text: clampText(el.textContent),
      speed: el.getAttribute?.('data-speed') || null,
      ariaLabel: el.getAttribute?.('aria-label') || null,
      ariaDisabled: el.getAttribute?.('aria-disabled') || null,
      disabled: 'disabled' in el ? Boolean(el.disabled) : null,
      pointerEvents: style?.pointerEvents || null,
      display: style?.display || null,
      visibility: style?.visibility || null,
      opacity: style?.opacity || null,
      zIndex: style?.zIndex || null,
      rect: r ? { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } : null
    };
  }

  function selectVideo() {
    const videos = [...document.querySelectorAll('video')].filter(v => v?.isConnected);
    if (!videos.length) return null;
    return videos.sort((a, b) => {
      const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
      const as = (!a.paused ? 1000000 : 0) + Math.max(0, ar.width) * Math.max(0, ar.height);
      const bs = (!b.paused ? 1000000 : 0) + Math.max(0, br.width) * Math.max(0, br.height);
      return bs - as;
    })[0];
  }

  function videoSnapshot() {
    const v = selectVideo();
    if (!v) return { found: false };
    return {
      found: true,
      playbackRate: round(v.playbackRate),
      defaultPlaybackRate: round(v.defaultPlaybackRate),
      paused: Boolean(v.paused),
      ended: Boolean(v.ended),
      currentTime: round(v.currentTime),
      readyState: Number(v.readyState),
      networkState: Number(v.networkState)
    };
  }

  function controlsSnapshot() {
    const panel = document.getElementById('ytss-panel');
    if (!panel) return [];
    return [...panel.querySelectorAll('.ytss-preset, button, [data-speed], input, [role="button"]')].slice(0, 40).map(describeElement);
  }

  function panelSnapshot() {
    const panel = document.getElementById('ytss-panel');
    if (!panel) return { exists: false };
    let style = null;
    try { style = getComputedStyle(panel); } catch {}
    const r = panel.getBoundingClientRect();
    return {
      exists: true,
      className: typeof panel.className === 'string' ? panel.className : null,
      dataset: { accent: panel.dataset.accent || null, theme: panel.dataset.theme || null },
      rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
      computed: {
        color: style?.color || null,
        backgroundColor: style?.backgroundColor || null,
        backgroundImage: style?.backgroundImage || null,
        borderColor: style?.borderColor || null,
        boxShadow: style?.boxShadow || null,
        pointerEvents: style?.pointerEvents || null,
        opacity: style?.opacity || null,
        accent: style?.getPropertyValue?.('--accent')?.trim?.() || '',
        accent2: style?.getPropertyValue?.('--accent2')?.trim?.() || '',
        ytssAccent: style?.getPropertyValue?.('--ytss-accent')?.trim?.() || '',
        ytssAccent2: style?.getPropertyValue?.('--ytss-accent-2')?.trim?.() || ''
      },
      controls: controlsSnapshot()
    };
  }

  function pointInsidePanel(event) {
    const panel = document.getElementById('ytss-panel');
    if (!panel || !Number.isFinite(event?.clientX) || !Number.isFinite(event?.clientY)) return false;
    const r = panel.getBoundingClientRect();
    return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
  }

  function relevant(event) {
    const target = event.target instanceof Element ? event.target : null;
    return Boolean(target?.closest?.('#ytss-panel')) || pointInsidePanel(event);
  }

  function hitStack(event) {
    if (!document.elementsFromPoint || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return [];
    try { return document.elementsFromPoint(event.clientX, event.clientY).slice(0, 12).map(describeElement); } catch { return []; }
  }

  function intendedControls(event) {
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return [];
    const x = event.clientX, y = event.clientY;
    return controlsSnapshot().filter(item => {
      const r = item?.rect;
      return r && x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
    });
  }

  function capture(event) {
    if (!active || !relevant(event)) return;
    let id = eventIds.get(event);
    if (!id) { id = ++eventSeq; eventIds.set(event, id); }
    const before = videoSnapshot();
    debug.log('info', `v2.panel.${event.type}.capture`, {
      id,
      target: describeElement(event.target),
      coordinates: { x: round(event.clientX), y: round(event.clientY) },
      defaultPrevented: Boolean(event.defaultPrevented),
      cancelBubble: Boolean(event.cancelBubble),
      hitStack: hitStack(event),
      intendedControls: intendedControls(event),
      videoBefore: before,
      panel: panelSnapshot()
    });
    if (event.type === 'click') {
      const result = stage => debug.log('info', `v2.panel.click.result.${stage}`, {
        id,
        bubbleReached: bubbled.has(id),
        videoBefore: before,
        videoAfter: videoSnapshot(),
        panel: panelSnapshot()
      });
      setTimeout(() => result('fast'), 40);
      setTimeout(() => { result('final'); bubbled.delete(id); }, 320);
    }
  }

  function bubble(event) {
    if (!active || !relevant(event)) return;
    const id = eventIds.get(event) || ++eventSeq;
    bubbled.add(id);
    debug.log('info', `v2.panel.${event.type}.bubble`, {
      id,
      target: describeElement(event.target),
      defaultPrevented: Boolean(event.defaultPrevented),
      cancelBubble: Boolean(event.cancelBubble)
    });
  }

  async function flushAck(extra = {}) {
    const result = await debug.flush();
    let count = null, updatedAt = null, lastAt = null;
    try {
      const key = SESSION ? `ytssDebugLog:${SESSION}` : null;
      if (key) {
        const stored = (await chrome.storage.local.get(key))[key];
        count = Array.isArray(stored?.entries) ? stored.entries.length : 0;
        updatedAt = Number(stored?.updatedAt || 0) || null;
        lastAt = Number(stored?.entries?.at?.(-1)?.at || 0) || null;
      }
    } catch {}
    return { ok: true, version: VERSION, sessionId: SESSION, count, updatedAt, lastAt, flushReturn: result ?? null, ...extra };
  }

  function onMessage(message, sender, sendResponse) {
    if (!active) return false;
    if (message?.type === 'YTSS_DEBUG_V2_SNAPSHOT') {
      sendResponse({ ok: true, version: VERSION, sessionId: SESSION, href: debug.safeUrl?.(location.href) || location.href, panel: panelSnapshot(), video: videoSnapshot() });
      return false;
    }
    if (message?.type === 'YTSS_DEBUG_FLUSH') {
      flushAck({ reason: 'forced-export-flush' }).then(sendResponse).catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
      return true;
    }
    if (message?.type === 'YTSS_DEBUG_CLEAR') {
      debug.log('info', 'v2.capture-cutoff', { captureStartedAt: Number(message.captureStartedAt || 0) || null, senderTabId: sender?.tab?.id ?? null });
      flushAck({ logicalClear: true }).then(sendResponse).catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
      return true;
    }
    if (message?.type === 'YTSS_DEBUG_MARK') {
      debug.log('info', 'v2.capture-mark', { label: String(message.label || 'capture'), captureStartedAt: Number(message.captureStartedAt || 0) || null, senderTabId: sender?.tab?.id ?? null });
      flushAck({ marked: true }).then(sendResponse).catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
      return true;
    }
    return false;
  }

  window.addEventListener('pointerdown', capture, true);
  window.addEventListener('pointerup', capture, true);
  window.addEventListener('click', capture, true);
  window.addEventListener('click', bubble, false);
  try { chrome.runtime.onMessage.addListener(onMessage); } catch {}

  function deactivate() {
    if (!active) return;
    active = false;
    window.removeEventListener('pointerdown', capture, true);
    window.removeEventListener('pointerup', capture, true);
    window.removeEventListener('click', capture, true);
    window.removeEventListener('click', bubble, false);
    try { chrome.runtime.onMessage.removeListener(onMessage); } catch {}
  }

  debug.log('info', 'v2.content.ready', { version: VERSION, sessionId: SESSION, panel: panelSnapshot(), video: videoSnapshot() });
  globalThis.__YTSS_DEBUG_V2__ = Object.freeze({ version: VERSION, deactivate, panelSnapshot, videoSnapshot });
})();
