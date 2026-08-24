(() => {
  'use strict';
  if (globalThis.YTSSRuntimeClient) return;
  const PROTOCOL = 7;
  const SUPPORTED = [
    /^https:\/\/([\w-]+\.)?youtube\.com\//i,
    /^https:\/\/([\w-]+\.)?bilibili\.com\//i
  ];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const isSupportedUrl = url => SUPPORTED.some(re => re.test(String(url || '')));
  async function probe(tabId, attempts = 1) {
    let error = null;
    for (let i = 0; i < attempts; i++) {
      try {
        const response = await chrome.tabs.sendMessage(tabId, { type: 'YTSS_GET_RUNTIME', protocol: PROTOCOL });
        if (response?.ok) return { ok: true, response };
      } catch (e) { error = e; }
      if (i + 1 < attempts) await sleep(90);
    }
    return { ok: false, error };
  }
  async function inject(tab) {
    if (!tab?.id || !isSupportedUrl(tab.url)) return { ok: false, code: 'unsupported-page' };
    const isYoutube = /(^|\.)youtube\.com$/i.test(new URL(tab.url).hostname);
    try {
      if (isYoutube) {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', files: ['page-context.js'] });
      }
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'ISOLATED', files: ['providers.js', 'content.js'] });
      try { await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] }); } catch {}
      await sleep(140);
      const result = await probe(tab.id, 3);
      return result.ok ? { ok: true, response: result.response, reinjected: true } : { ok: false, code: 'reinject-no-handshake', error: result.error };
    } catch (error) {
      return { ok: false, code: 'reinject-failed', error };
    }
  }
  async function ensure(tab, { allowInject = true } = {}) {
    if (!tab?.id) return { ok: false, code: 'no-tab' };
    const first = await probe(tab.id, 2);
    if (first.ok) return { ...first, reinjected: false };
    if (!allowInject) return { ok: false, code: 'no-receiver', error: first.error };
    return inject(tab);
  }
  async function discover({ platform = null, requireVideo = false, preferActive = true } = {}) {
    const tabs = await chrome.tabs.query({});
    const ordered = [...tabs].sort((a,b) => Number(preferActive && b.active) - Number(preferActive && a.active) || (b.lastAccessed||0)-(a.lastAccessed||0));
    let connected = null;
    let stale = null;
    const version = chrome.runtime.getManifest().version;
    for (const tab of ordered) {
      if (!tab.id || !isSupportedUrl(tab.url)) continue;
      const result = await ensure(tab, { allowInject: true });
      if (!result.ok) continue;
      const r = result.response;
      if (r.protocol !== PROTOCOL || r.version !== version) { stale ||= { tab, response:r }; continue; }
      if (platform && r.context?.platform !== platform) continue;
      const candidate = { tab, tabId:tab.id, response:r, reinjected:!!result.reinjected };
      connected ||= candidate;
      const isVideo = r.context?.platform === 'youtube' ? ['watch','shorts'].includes(r.context?.pageType) : Boolean(r.context?.pageType && r.context.pageType !== 'other');
      if (!requireVideo || isVideo) return { ok:true, kind:isVideo?'video':'runtime', ...candidate };
    }
    if (connected) return { ok:!requireVideo, kind:'runtime-only', ...connected };
    if (stale) return { ok:false, kind:'stale', ...stale };
    return { ok:false, kind:'missing' };
  }
  globalThis.YTSSRuntimeClient = Object.freeze({ PROTOCOL, isSupportedUrl, probe, inject, ensure, discover });
})();
