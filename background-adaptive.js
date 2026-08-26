'use strict';
(() => {
  if (globalThis.YTSSInstallAdaptiveBackground) return;
  const MAX_PER_TAB=220, TTL=12*60*1000, byTab=new Map();
  let installed=false;
  const allowed=()=>globalThis.YTSSIntegrityGate?.isOperational?.()===true;
  function parse(raw){try{const u=new URL(String(raw||''));if(u.protocol!=='https:'||!(u.hostname==='googlevideo.com'||u.hostname.endsWith('.googlevideo.com'))||!/\/videoplayback(?:$|[/?])/i.test(u.pathname))return null;const itag=Number(u.searchParams.get('itag'))||null;return{url:u.href,itag,at:Date.now(),sabr:u.searchParams.get('sabr')==='1',range:u.searchParams.get('range')||null,sq:u.searchParams.get('sq')||null,expire:Number(u.searchParams.get('expire'))||null,mime:u.searchParams.get('mime')||null,aitags:u.searchParams.get('aitags')||null};}catch{return null}}
  function prune(list){const t=Date.now();const fresh=list.filter(x=>x&&t-x.at<=TTL);if(fresh.length>MAX_PER_TAB)fresh.splice(0,fresh.length-MAX_PER_TAB);return fresh;}
  function remember(tabId,raw){if(!allowed()||!Number.isInteger(tabId)||tabId<0)return null;const item=parse(raw);if(!item)return null;const list=prune(byTab.get(tabId)||[]);const i=list.findIndex(x=>x.url===item.url);if(i>=0)list.splice(i,1);list.push(item);byTab.set(tabId,prune(list));return item;}
  function list(tabId){if(!allowed()||!Number.isInteger(tabId)||tabId<0)return[];const x=prune(byTab.get(tabId)||[]);byTab.set(tabId,x);return x.map(v=>({...v}));}
  function install(){
    if(installed) return;
    installed=true;
    chrome.webRequest.onBeforeRequest.addListener(d=>{if(!allowed())return;const item=remember(d.tabId,d.url);if(item)chrome.tabs.sendMessage(d.tabId,{type:'YTSS_MEDIA_CAPTURE',capture:item}).catch(()=>{});},{urls:['https://*.googlevideo.com/*']});
    chrome.tabs.onRemoved.addListener(id=>byTab.delete(id));
    chrome.runtime.onMessage.addListener((m,s,send)=>{if(!m||typeof m!=='object')return false;const tabId=Number.isInteger(m.tabId)&&m.tabId>=0?m.tabId:s.tab?.id;if(m.type==='YTSS_GET_MEDIA_CAPTURES'||m.type==='YTSS_CLEAR_MEDIA_CAPTURES'){if(!allowed()){send({ok:false,code:'tamper-lock',lockState:globalThis.YTSSIntegrityGate?.getState?.()||null});return false;}if(m.type==='YTSS_GET_MEDIA_CAPTURES'){send({ok:true,captures:list(tabId),at:Date.now()});return false;}if(Number.isInteger(tabId))byTab.delete(tabId);send({ok:true});return false;}return false;});
    chrome.downloads.onDeterminingFilename.addListener((item,suggest)=>{try{if(!allowed()||item.byExtensionId!==chrome.runtime.id)return suggest();const url=String(item.url||item.finalUrl||'');const media=/^https:\/\/[^/]*googlevideo\.com\//i.test(url)||url.startsWith(`blob:chrome-extension://${chrome.runtime.id}/`);if(!media)return suggest();const raw=String(item.filename||'youtube-speed-studio.mp4').replace(/\\/g,'/').split('/').pop()||'youtube-speed-studio.mp4';const filename=raw.replace(/\.[^.]+$/,'')+'.mp4';suggest({filename,conflictAction:'uniquify'});}catch{suggest();}});
  }
  globalThis.YTSSInstallAdaptiveBackground=install;
})();
