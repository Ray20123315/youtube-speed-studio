(() => {
  'use strict';
  if (globalThis.YTSSRuntimeClient) return;

  const PROTOCOL = 7;
  const SUPPORTED = [
    /^https:\/\/([\w-]+\.)?youtube\.com\//i,
    /^https:\/\/([\w-]+\.)?bilibili\.com\//i
  ];
  const QUERY_PATTERNS = [
    'https://youtube.com/*',
    'https://*.youtube.com/*',
    'https://bilibili.com/*',
    'https://*.bilibili.com/*'
  ];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const tabUrl = tab => String(tab?.url || tab?.pendingUrl || '');
  const isSupportedUrl = url => SUPPORTED.some(re => re.test(String(url || '')));
  const errorText = error => error?.message || (error ? String(error) : null);

  function sourceIdentity(raw) {
    try {
      const url = new URL(String(raw || ''));
      const host = url.hostname.toLowerCase();
      const youtube = host === 'youtube.com' || host.endsWith('.youtube.com');
      const bilibili = host === 'bilibili.com' || host.endsWith('.bilibili.com');
      if (!youtube && !bilibili) return null;
      if (youtube) {
        const videoId = url.pathname === '/watch'
          ? url.searchParams.get('v')
          : url.pathname.startsWith('/shorts/') ? url.pathname.split('/')[2] || null : null;
        return { platform: 'youtube', videoId, href: url.href };
      }
      return { platform: 'bilibili', videoId: null, href: url.href };
    } catch {
      return null;
    }
  }

  function pageSourceHint() {
    try {
      if (!location.protocol.startsWith('chrome-extension')) return { tabId: null, url: null };
      const params = new URLSearchParams(location.search);
      const rawId = Number(params.get('sourceTabId'));
      const rawUrl = params.get('sourceUrl');
      return {
        tabId: Number.isInteger(rawId) && rawId > 0 ? rawId : null,
        url: isSupportedUrl(rawUrl) ? rawUrl : null
      };
    } catch {
      return { tabId: null, url: null };
    }
  }

  function sourceMatchScore(tab, hint, preferActive) {
    let score = 0;
    const url = tabUrl(tab);
    if (hint.tabId && tab?.id === hint.tabId) score += 10000;
    if (hint.url && url === hint.url) score += 5000;
    if (hint.url && url) {
      const expected = sourceIdentity(hint.url);
      const actual = sourceIdentity(url);
      if (expected?.platform && expected.platform === actual?.platform) score += 500;
      if (expected?.videoId && expected.videoId === actual?.videoId) score += 3500;
    }
    if (preferActive && tab?.active) score += 100;
    return score;
  }

  async function probe(tabId, attempts = 1, intervalMs = 120) {
    let error = null;
    for (let i = 0; i < attempts; i++) {
      try {
        const response = await chrome.tabs.sendMessage(tabId, { type: 'YTSS_GET_RUNTIME', protocol: PROTOCOL });
        if (response?.ok) return { ok: true, response };
        error = new Error('runtime handshake returned no usable response');
      } catch (e) {
        error = e;
      }
      if (i + 1 < attempts) await sleep(intervalMs);
    }
    return { ok: false, error };
  }

  async function waitForRuntime(tabId, attempts = 20, intervalMs = 150) {
    return probe(tabId, attempts, intervalMs);
  }

  async function inject(tab) {
    const url = tabUrl(tab);
    if (!tab?.id || !isSupportedUrl(url)) return { ok: false, code: 'unsupported-page' };
    const isYoutube = /(^|\.)youtube\.com$/i.test(new URL(url).hostname);
    let pageBridgeError = null;
    let fullRuntimeError = null;

    // MAIN-world page extraction is useful for Download Studio but must not be allowed
    // to prevent the isolated-world recovery receiver from coming back online.
    if (isYoutube) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', files: ['page-context.js'] });
      } catch (error) {
        pageBridgeError = error;
      }
    }

    try {
      // Bootstrap and recovery are intentionally isolated from providers/content.js.
      // The bootstrap disposes a surviving stale bridge object before the fresh file
      // registers chrome.runtime listeners in the current extension context.
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'ISOLATED',
        files: ['runtime-bootstrap.js', 'runtime-recovery.js']
      });
    } catch (error) {
      return {
        ok: false,
        code: 'recovery-inject-failed',
        error,
        pageBridgeError: errorText(pageBridgeError)
      };
    }

    // Prove the new receiver exists before touching optional full-runtime files.
    const recovery = await waitForRuntime(tab.id, 12, 100);
    if (!recovery.ok) {
      return {
        ok: false,
        code: 'recovery-no-handshake',
        error: recovery.error,
        pageBridgeError: errorText(pageBridgeError)
      };
    }

    // Full content runtime is best effort on already-open tabs. Legacy pages may still
    // contain the old non-configurable V100 guard; recovery remains authoritative if so.
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'ISOLATED',
        files: ['providers.js', 'content.js']
      });
    } catch (error) {
      fullRuntimeError = error;
    }

    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css', 'accent-theme.css'] });
    } catch {}

    // Prefer the full runtime if it successfully takes ownership; otherwise keep the
    // already-proven recovery response instead of downgrading to a false disconnect.
    const finalProbe = await waitForRuntime(tab.id, 8, 125);
    const response = finalProbe.ok ? finalProbe.response : recovery.response;
    return {
      ok: true,
      response,
      reinjected: true,
      recoveryBridge: !!response?.recoveryBridge,
      recoveryVerified: true,
      pageBridgeError: errorText(pageBridgeError),
      fullRuntimeError: errorText(fullRuntimeError)
    };
  }

  async function ensure(tab, { allowInject = true } = {}) {
    if (!tab?.id) return { ok: false, code: 'no-tab' };
    const first = await probe(tab.id, 3, 120);
    if (first.ok) return { ...first, reinjected: false, recoveryBridge: !!first.response?.recoveryBridge };
    if (!allowInject) return { ok: false, code: 'no-receiver', error: first.error };
    return inject(tab);
  }

  async function supportedTabs(preferredTabId = null) {
    const seen = new Map();
    if (preferredTabId) {
      try {
        const preferred = await chrome.tabs.get(preferredTabId);
        if (preferred?.id && isSupportedUrl(tabUrl(preferred))) seen.set(preferred.id, preferred);
      } catch {}
    }
    try {
      for (const tab of await chrome.tabs.query({ url: QUERY_PATTERNS })) {
        if (tab?.id && isSupportedUrl(tabUrl(tab))) seen.set(tab.id, tab);
      }
    } catch {}
    if (!seen.size) {
      try {
        for (const tab of await chrome.tabs.query({})) {
          if (tab?.id && isSupportedUrl(tabUrl(tab))) seen.set(tab.id, tab);
        }
      } catch {}
    }
    return [...seen.values()];
  }

  async function discover({
    platform = null,
    requireVideo = false,
    preferActive = true,
    preferredTabId = null,
    preferredUrl = null
  } = {}) {
    const pageHint = pageSourceHint();
    const hint = {
      tabId: Number.isInteger(preferredTabId) && preferredTabId > 0 ? preferredTabId : pageHint.tabId,
      url: isSupportedUrl(preferredUrl) ? preferredUrl : pageHint.url
    };
    const tabs = await supportedTabs(hint.tabId);
    const ordered = [...tabs].sort((a, b) =>
      sourceMatchScore(b, hint, preferActive) - sourceMatchScore(a, hint, preferActive)
      || (b.lastAccessed || 0) - (a.lastAccessed || 0)
    );
    let connected = null;
    let stale = null;
    let lastFailure = null;
    const version = chrome.runtime.getManifest().version;

    for (const tab of ordered) {
      const result = await ensure(tab, { allowInject: true });
      if (!result.ok) {
        lastFailure = {
          tabId: tab.id,
          code: result.code || 'runtime-unavailable',
          error: errorText(result.error),
          pageBridgeError: result.pageBridgeError || null
        };
        continue;
      }
      const r = result.response;
      if (r.protocol !== PROTOCOL || r.version !== version) {
        stale ||= { tab, response: r };
        continue;
      }
      if (platform && r.context?.platform !== platform) continue;
      const candidate = {
        tab,
        tabId: tab.id,
        response: r,
        reinjected: !!result.reinjected,
        recoveryBridge: !!r.recoveryBridge,
        recoveryVerified: !!result.recoveryVerified,
        fullRuntimeError: result.fullRuntimeError || null,
        pageBridgeError: result.pageBridgeError || null,
        sourceMatched: sourceMatchScore(tab, hint, false) > 0
      };
      connected ||= candidate;
      const isVideo = r.context?.platform === 'youtube'
        ? ['watch', 'shorts'].includes(r.context?.pageType)
        : Boolean(r.context?.pageType && r.context.pageType !== 'other');
      if (!requireVideo || isVideo) return { ok: true, kind: isVideo ? 'video' : 'runtime', ...candidate };
    }

    if (connected) return { ok: !requireVideo, kind: 'runtime-only', ...connected };
    if (stale) return { ok: false, kind: 'stale', ...stale };
    return { ok: false, kind: 'missing', failure: lastFailure, sourceHint: hint };
  }

  globalThis.YTSSRuntimeClient = Object.freeze({
    PROTOCOL,
    isSupportedUrl,
    probe,
    waitForRuntime,
    inject,
    ensure,
    discover
  });
})();
