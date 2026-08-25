(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const debug = globalThis.YTSSDebug;
  if (!debug) throw new Error('YTSSDebug not loaded');

  const setStatus = value => { $('status').textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2); };
  const isYoutubeVideo = raw => {
    try { const u = new URL(String(raw || '')); const h = u.hostname.toLowerCase(); return (h === 'youtube.com' || h.endsWith('.youtube.com')) && (u.pathname === '/watch' || u.pathname.startsWith('/shorts/')); } catch { return false; }
  };
  const tabUrl = tab => String(tab?.url || tab?.pendingUrl || '');

  async function bestSourceTab() {
    const params = new URLSearchParams(location.search);
    const explicit = Number(params.get('sourceTabId'));
    if (Number.isInteger(explicit) && explicit > 0) {
      try { const tab = await chrome.tabs.get(explicit); if (isYoutubeVideo(tabUrl(tab))) return tab; } catch {}
    }
    const tabs = await chrome.tabs.query({});
    const active = tabs.find(tab => tab.active && isYoutubeVideo(tabUrl(tab)));
    if (active) return active;
    return tabs.find(tab => isYoutubeVideo(tabUrl(tab))) || null;
  }

  async function loadFrames() {
    const source = await bestSourceTab();
    const optionUrl = new URL(chrome.runtime.getURL('options.html'));
    if (source?.id) optionUrl.searchParams.set('sourceTabId', String(source.id));
    if (isYoutubeVideo(tabUrl(source))) optionUrl.searchParams.set('sourceUrl', tabUrl(source));
    optionUrl.hash = 'downloads';
    $('optionsFrame').src = optionUrl.href;
    $('popupFrame').src = chrome.runtime.getURL('popup.html');
    return source;
  }

  async function sample() {
    setStatus('正在取樣…');
    const source = await loadFrames();
    await new Promise(resolve => setTimeout(resolve, 1500));
    const tabs = await debug.collectTabEvidence();
    const options = $('optionsFrame').contentDocument ? debug.optionPageSnapshot($('optionsFrame').contentDocument) : null;
    const popup = $('popupFrame').contentDocument ? debug.popupPageSnapshot($('popupFrame').contentDocument) : null;
    const summary = { build: `${chrome.runtime.getManifest().version} / ${debug.build}`, source: source ? { id: source.id, url: debug.safeUrl(tabUrl(source)), title: source.title } : null, tabs, options, popup };
    debug.log('info', 'dashboard.deep-sample', summary);
    setStatus(summary);
    return summary;
  }

  async function exportBundle() {
    setStatus('正在建立問題包…');
    await sample();
    const bundle = await debug.collectSupportBundle({ optionFrame: $('optionsFrame'), popupFrame: $('popupFrame') });
    const blob = new Blob([JSON.stringify(bundle, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ytss-forensics-${chrome.runtime.getManifest().version}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    debug.log('info', 'dashboard.bundle-exported', { bytes: blob.size, filename: a.download });
    setStatus(`問題包已輸出：${a.download}\n大小：${blob.size} bytes\n請把這個 JSON 直接上傳給 ChatGPT。`);
  }

  async function openNormalPopup() { await chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') }); }
  async function openOptions() { await chrome.tabs.create({ url: chrome.runtime.getURL('options.html#appearance') }); }
  async function openDownload() {
    const source = await bestSourceTab();
    const target = new URL(chrome.runtime.getURL('options.html'));
    if (source?.id) target.searchParams.set('sourceTabId', String(source.id));
    if (isYoutubeVideo(tabUrl(source))) target.searchParams.set('sourceUrl', tabUrl(source));
    target.hash = 'downloads';
    await chrome.tabs.create({ url: target.href });
  }

  $('buildTag').textContent = `DIAGNOSTIC ${chrome.runtime.getManifest().version}`;
  $('fresh').addEventListener('click', async () => { await debug.clearLogs(); debug.log('info', 'dashboard.capture-start', { at: new Date().toISOString() }); setStatus('新紀錄已開始。現在去重現問題，完成後回來匯出。'); });
  $('sample').addEventListener('click', () => sample().catch(error => { debug.log('error', 'dashboard.sample-failed', { error }); setStatus({ error: error.message, stack: error.stack }); }));
  $('export').addEventListener('click', () => exportBundle().catch(error => { debug.log('error', 'dashboard.export-failed', { error }); setStatus({ error: error.message, stack: error.stack }); }));
  $('openPopup').addEventListener('click', () => openNormalPopup().catch(error => setStatus({ error: error.message })));
  $('openOptions').addEventListener('click', () => openOptions().catch(error => setStatus({ error: error.message })));
  $('openDownload').addEventListener('click', () => openDownload().catch(error => setStatus({ error: error.message })));

  debug.log('info', 'dashboard.ready', { version: chrome.runtime.getManifest().version });
  sample().catch(error => setStatus({ error: error.message }));
})();
