(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const D = globalThis.YTSSDebug;
  if (!D) throw new Error('YTSSDebug not loaded');
  const V = chrome.runtime.getManifest().version;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const tabUrl = t => String(t?.url || t?.pendingUrl || '');
  const safeUrl = raw => D.safeUrl ? D.safeUrl(raw) : String(raw || '');
  const status = v => { $('status').textContent = typeof v === 'string' ? v : JSON.stringify(v, null, 2); };
  const err = e => e ? { name: e.name || null, message: String(e.message || e).slice(0, 700) } : null;

  function youtubeVideo(raw) {
    try { const u = new URL(String(raw || '')), h = u.hostname.toLowerCase(); return (h === 'youtube.com' || h.endsWith('.youtube.com')) && (u.pathname === '/watch' || u.pathname.startsWith('/shorts/')); }
    catch { return false; }
  }
  function sourceHint(raw) {
    try { const u = new URL(String(raw || '')), id = Number(u.searchParams.get('sourceTabId')), s = u.searchParams.get('sourceUrl') || ''; return { sourceTabId: Number.isInteger(id) && id > 0 ? id : null, sourceUrl: s ? safeUrl(s) : '' }; }
    catch { return { sourceTabId: null, sourceUrl: '' }; }
  }
  function runtimeSummary(x) {
    const o = x && typeof x === 'object' ? x : {}, r = o.response && typeof o.response === 'object' ? o.response : o;
    const c = r.context || {}, d = r.diagnostics || {};
    return {
      ok: Object.hasOwn(o, 'ok') ? o.ok : (r.ok ?? null), code: o.code || null, error: err(o.error), reinjected: o.reinjected ?? null,
      recoveryBridge: o.recoveryBridge ?? r.recoveryBridge ?? null, protocol: r.protocol ?? null, version: r.version ?? null,
      context: { platform:c.platform??null, platformLabel:c.platformLabel??null, pageType:c.pageType??null, mode:c.mode??null, href:c.href?safeUrl(c.href):'', videoId:c.videoId??null, channelId:c.channelId??null, channelKey:c.channelKey??null, channelLabel:c.channelLabel??null, channelSource:c.channelSource??null },
      diagnostics: { actualRate:d.actualRate??null, desiredRate:d.desiredRate??null, effectiveRate:d.effectiveRate??null, candidateCount:d.candidateCount??null, resolvedVideoScore:d.resolvedVideoScore??null, videoGeneration:d.videoGeneration??null, lastApplyReason:d.lastApplyReason??null, lastError:d.lastError??null, panelSuppressed:d.panelSuppressed??null, enabled:d.enabled??null }
    };
  }
  function discoverySummary(x) {
    if (!x || typeof x !== 'object') return x;
    return { ok:x.ok??null, kind:x.kind||null, tabId:x.tabId??x.tab?.id??null, tab:x.tab?{id:x.tab.id??null,active:x.tab.active??null,url:safeUrl(tabUrl(x.tab)),title:String(x.tab.title||'').slice(0,180)}:null, sourceMatched:x.sourceMatched??null, reinjected:x.reinjected??null, recoveryBridge:x.recoveryBridge??null, sourceHint:x.sourceHint||null, failure:x.failure||null, response:x.response?runtimeSummary(x.response):null };
  }
  async function allTabs() {
    const tabs = await chrome.tabs.query({});
    return tabs.filter(t => { try { const h=new URL(tabUrl(t)).hostname.toLowerCase(); return h==='youtube.com'||h.endsWith('.youtube.com')||h==='bilibili.com'||h.endsWith('.bilibili.com'); } catch { return false; } });
  }
  async function sourceTab() { const tabs=await chrome.tabs.query({}); return tabs.find(t=>t.active&&youtubeVideo(tabUrl(t))) || tabs.find(t=>youtubeVideo(tabUrl(t))) || null; }
  async function send(id, msg) { try { return {ok:true,response:await chrome.tabs.sendMessage(id,msg)}; } catch(e) { return {ok:false,error:err(e)}; } }
  async function ensureV2(tab) {
    let s=await send(tab.id,{type:'YTSS_DEBUG_V2_SNAPSHOT'}); if(s.ok&&s.response?.version===V) return {ok:true,injected:false};
    const base=await send(tab.id,{type:'YTSS_DEBUG_SNAPSHOT'});
    try {
      const files=base.ok?['debug-v2-content.js']:['debug-bootstrap.js','debug-log.js','debug-v2-content.js'];
      await chrome.scripting.executeScript({target:{tabId:tab.id},files});
      s=await send(tab.id,{type:'YTSS_DEBUG_V2_SNAPSHOT'}); return {ok:Boolean(s.ok&&s.response?.ok),injected:true,files,error:s.ok?null:s.error};
    } catch(e) { return {ok:false,injected:false,error:err(e)}; }
  }
  function waitFrame(f, ms=3500) { return new Promise(resolve => { let done=false; const end=v=>{if(done)return;done=true;clearTimeout(timer);f.removeEventListener('load',on);resolve(v)}; const on=()=>end(true); const timer=setTimeout(()=>end(false),ms); f.addEventListener('load',on,{once:true}); try{if(f.contentDocument?.readyState==='complete'&&f.contentWindow?.location?.href!=='about:blank')end(true)}catch{} }); }
  async function loadFrames(source) {
    const u=new URL(chrome.runtime.getURL('options.html')); if(source?.id)u.searchParams.set('sourceTabId',String(source.id)); if(youtubeVideo(tabUrl(source)))u.searchParams.set('sourceUrl',tabUrl(source)); u.hash='downloads';
    $('optionsFrame').src=u.href; $('popupFrame').src=chrome.runtime.getURL('popup.html'); await Promise.all([waitFrame($('optionsFrame')),waitFrame($('popupFrame'))]);
    return { requestedOptionsHref:safeUrl(u.href), requestedSourceHint:{sourceTabId:source?.id??null,sourceUrl:youtubeVideo(tabUrl(source))?safeUrl(tabUrl(source)):''}, actualOptionsHref:safeUrl($('optionsFrame').contentWindow?.location?.href||''), actualSourceHint:sourceHint($('optionsFrame').contentWindow?.location?.href||'') };
  }
  async function call(fn) { try { return {ok:true,result:discoverySummary(await fn())}; } catch(e) { return {ok:false,error:err(e)}; } }
  async function trace(source) {
    const out={source:source?{id:source.id,active:source.active,url:safeUrl(tabUrl(source)),title:String(source.title||'').slice(0,180)}:null,dashboard:{},options:{}}; if(!source?.id)return out;
    const C=YTSSRuntimeClient;
    const direct=await send(source.id,{type:'YTSS_GET_RUNTIME',protocol:C.PROTOCOL}); out.dashboard.direct=direct.ok?{ok:true,response:runtimeSummary(direct.response)}:direct;
    out.dashboard.probe=await call(()=>C.probe(source.id,1)); out.dashboard.ensure=await call(()=>C.ensure(source,{allowInject:true}));
    out.dashboard.discoverDefault=await call(()=>C.discover({platform:'youtube',requireVideo:true,preferActive:true}));
    out.dashboard.discoverPreferred=await call(()=>C.discover({platform:'youtube',requireVideo:true,preferActive:true,preferredTabId:source.id,preferredUrl:tabUrl(source)}));
    try { const F=$('optionsFrame').contentWindow?.YTSSRuntimeClient; out.options.href=safeUrl($('optionsFrame').contentWindow?.location?.href||''); out.options.sourceHint=sourceHint($('optionsFrame').contentWindow?.location?.href||''); if(F){out.options.probe=await call(()=>F.probe(source.id,1));out.options.ensure=await call(()=>F.ensure(source,{allowInject:true}));out.options.discoverDefault=await call(()=>F.discover({platform:'youtube',requireVideo:true,preferActive:true}));out.options.discoverPreferred=await call(()=>F.discover({platform:'youtube',requireVideo:true,preferActive:true,preferredTabId:source.id,preferredUrl:tabUrl(source)}));}else out.options.client={ok:false,code:'missing-runtime-client'}; } catch(e){out.options.error=err(e)}
    return out;
  }
  function style(el, selector) { if(!el)return{selector,exists:false};const s=el.ownerDocument.defaultView.getComputedStyle(el);return{selector,exists:true,tag:el.tagName.toLowerCase(),id:el.id||null,className:typeof el.className==='string'?el.className.slice(0,180):null,text:String(el.textContent||'').trim().replace(/\s+/g,' ').slice(0,90),color:s.color,backgroundColor:s.backgroundColor,backgroundImage:s.backgroundImage,borderColor:s.borderColor,outlineColor:s.outlineColor,boxShadow:s.boxShadow,pointerEvents:s.pointerEvents,opacity:s.opacity,vars:{accent:s.getPropertyValue('--accent').trim(),accent2:s.getPropertyValue('--accent2').trim(),ytssAccent:s.getPropertyValue('--ytss-accent').trim(),ytssAccent2:s.getPropertyValue('--ytss-accent-2').trim()}}; }
  function hue(r,g,b){r/=255;g/=255;b/=255;const M=Math.max(r,g,b),m=Math.min(r,g,b),d=M-m;if(!d)return{h:0,s:0};let h=M===r?((g-b)/d)%6:M===g?(b-r)/d+2:(r-g)/d+4;h=(h*60+360)%360;const l=(M+m)/2,s=d/(1-Math.abs(2*l-1));return{h,s:Number.isFinite(s)?s:0};}
  function violet(text){for(const m of String(text||'').matchAll(/rgba?\(\s*(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)/gi)){const q=hue(+m[1],+m[2],+m[3]);if(q.h>=250&&q.h<=320&&q.s>=.28)return true}return false;}
  function page(doc, kind) {
    const sels=kind==='options'?['.download-hero','.download-hero .eyebrow','.download-card','.download-video-copy small','.quality-summary article.accent','.quality-row.is-downloadable','.q-chip.info','.q-chip.ok','.q-chip.warn','.download-choice','.download-choice.selected','.download-selection-panel','.download-notice','.download-progress-panel','.memory-guard','.safe-badge','.primary-outline-btn','.primary-btn','.nav-item.active','.side-brand .logo']:['.logo','.mode-card.general','.studio-badge','.studio-open-btn','.options-cta button'];
    const ids=kind==='options'?['profileRuntimeStatus','downloadProviderStatus','downloadTitle','downloadMeta','downloadNativeMax','downloadAdvertisedMax','downloadResolvedMax','downloadCoverageState','downloadFallbackStatus','downloadHint','versionLabel']:['runtimeStatus','status','versionBadge','officialBadge'];const statuses={};ids.forEach(id=>statuses[id]=doc.getElementById(id)?.textContent?.trim?.()||null);
    const violetLike=[];for(const el of [...doc.querySelectorAll('body *')].slice(0,1600)){const s=doc.defaultView.getComputedStyle(el);if([s.color,s.backgroundColor,s.borderColor,s.outlineColor,s.boxShadow,s.backgroundImage].some(violet)){violetLike.push(style(el,'<violet-like>'));if(violetLike.length>=80)break}}
    return{href:safeUrl(doc.defaultView?.location?.href||''),sourceHint:sourceHint(doc.defaultView?.location?.href||''),bodyDataset:doc.body?{...doc.body.dataset}:null,statuses,computed:sels.map(x=>style(doc.querySelector(x),x)),violetLike};
  }
  async function tabsV2() { const out=[];for(const t of await allTabs()){const ensured=await ensureV2(t),v2=await send(t.id,{type:'YTSS_DEBUG_V2_SNAPSHOT'}),runtime=await send(t.id,{type:'YTSS_GET_RUNTIME',protocol:YTSSRuntimeClient.PROTOCOL});let probe;try{probe=runtimeSummary(await YTSSRuntimeClient.probe(t.id,1))}catch(e){probe={ok:false,error:err(e)}}out.push({id:t.id,active:t.active,title:String(t.title||'').slice(0,180),url:safeUrl(tabUrl(t)),ensured,v2Snapshot:v2.ok?v2.response:v2,normalRuntime:runtime.ok?runtimeSummary(runtime.response):runtime,clientProbe:probe})}return out; }
  async function forceFlush() { const out=[];for(const t of await allTabs()){const ensured=await ensureV2(t),flush=ensured.ok?await send(t.id,{type:'YTSS_DEBUG_FLUSH'}):{ok:false,error:ensured.error||ensured.code};out.push({tabId:t.id,url:safeUrl(tabUrl(t)),ensured,flush})}await D.flush();return out; }
  async function sample() { status('正在執行 1.0.5.2 深度取樣…');const source=await sourceTab(),frameLoad=await loadFrames(source);for(const t of await allTabs())await ensureV2(t);await sleep(1100);const discoveryTrace=await trace(source),tabs=await tabsV2(),od=$('optionsFrame').contentDocument,pd=$('popupFrame').contentDocument;const r={source:discoveryTrace.source,frameLoad,discoveryTrace,tabs,options:od?page(od,'options'):null,popup:pd?page(pd,'popup'):null};D.log('info','v2.dashboard.sample',{source:r.source,frameLoad});await D.flush();status(r);return r; }
  async function exportBundle() { status('正在強制 flush 並建立 1.0.5.2 問題包…');const s=await sample(),forcedFlush=await forceFlush();await sleep(150);const b=await D.collectSupportBundle({optionFrame:$('optionsFrame'),popupFrame:$('popupFrame')}),x=await chrome.storage.local.get({ytssDebugCaptureStartedAt:0}),cut=Number(x.ytssDebugCaptureStartedAt)||0;b.schemaVersion=2;b.testBuild={...b.testBuild,version:V,build:'forensics-2'};b.captureStartedAt=cut||null;b.v2={forcedFlush,source:s.source,frameLoad:s.frameLoad,discoveryTrace:s.discoveryTrace,tabs:s.tabs,options:s.options,popup:s.popup};if(cut>0&&b.logs){if(Array.isArray(b.logs.timeline))b.logs.timeline=b.logs.timeline.filter(e=>Number(e?.at||0)>=cut);if(Array.isArray(b.logs.sessions))b.logs.sessions=b.logs.sessions.map(z=>({...z,entries:Array.isArray(z?.entries)?z.entries.filter(e=>Number(e?.at||0)>=cut):[]})).filter(z=>z.entries.length)}const json=JSON.stringify(b,null,2)+'\n',blob=new Blob([json],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`ytss-forensics-${V}-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);status(`問題包已輸出：${a.download}\n大小：${blob.size} bytes\nTimeline：${b.logs?.timeline?.length||0} entries\nV2 tabs：${b.v2?.tabs?.length||0}\n請把 JSON 原檔直接上傳。`); }
  async function openPopup(){await chrome.tabs.create({url:chrome.runtime.getURL('popup.html')})} async function openOptions(){await chrome.tabs.create({url:chrome.runtime.getURL('options.html#appearance')})} async function openDownload(){const s=await sourceTab(),u=new URL(chrome.runtime.getURL('options.html'));if(s?.id)u.searchParams.set('sourceTabId',String(s.id));if(youtubeVideo(tabUrl(s)))u.searchParams.set('sourceUrl',tabUrl(s));u.hash='downloads';await chrome.tabs.create({url:u.href})}
  $('buildTag').textContent=`DIAGNOSTIC ${V}`;
  $('fresh').addEventListener('click',async()=>{status('正在建立乾淨 capture cutoff…');const cut=Date.now();await D.clearLogs();await chrome.storage.local.set({ytssDebugCaptureStartedAt:cut});let n=0;for(const t of await allTabs()){const e=await ensureV2(t);if(e.ok){await send(t.id,{type:'YTSS_DEBUG_CLEAR',captureStartedAt:cut});await send(t.id,{type:'YTSS_DEBUG_MARK',label:'fresh-capture',captureStartedAt:cut});n++}}D.log('info','v2.dashboard.capture-start',{cutoff:cut,initializedCount:n});await D.flush();status(`新紀錄已開始：${n} 個支援分頁。現在重現 Preset / − + / Download Studio / Amber 紫色殘留。`)});
  $('sample').addEventListener('click',()=>sample().catch(e=>status({error:e.message,stack:e.stack}))); $('export').addEventListener('click',()=>exportBundle().catch(e=>status({error:e.message,stack:e.stack}))); $('openPopup').addEventListener('click',()=>openPopup().catch(e=>status({error:e.message}))); $('openOptions').addEventListener('click',()=>openOptions().catch(e=>status({error:e.message}))); $('openDownload').addEventListener('click',()=>openDownload().catch(e=>status({error:e.message})));
  D.log('info','v2.dashboard.ready',{version:V});sample().catch(e=>status({error:e.message,stack:e.stack}));
})();
