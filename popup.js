const EXTENSION_VERSION = chrome.runtime.getManifest().version;
const RUNTIME_PROTOCOL = 7;
const DEFAULTS = {
  enabled:true, floatingEnabled:true, hoverExpand:true, hideFloatingOnSearch:true, rememberLast:true,
  generalSpeed:1.5, shortsSpeed:1, step:.25, minSpeed:.25, maxSpeed:8, extremeMode:true,
  showPresets:true, presets:[1,1.25,1.5,2,3], panelOpacity:90, compactOnStart:false,
  position:{x:null,y:100}, lockSpeed:false, resetSpeed:1, preservePitch:true,
  decreaseKey:'BracketLeft', increaseKey:'BracketRight', boostKey:'Backquote', pauseKey:'Backslash', boostSpeed:3,
  themeMode:'auto', profilesEnabled:true, profiles:{channels:{},playlists:{}}, diagnosticsEnabled:false,
  downloadSaveAs:true, downloadDefaultQuality:'best', bilibiliEnabled:true, uiLanguage:'auto', accentColor:'violet', uiBackground:'auto', updateCheckEnabled:true
};
const $ = id => document.getElementById(id);
let settings = structuredClone(DEFAULTS);
let activeTabId = null;
let saveTimer = null;
let statusTimer = null;

const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const roundRate=n=>Math.round((n+Number.EPSILON)*100)/100;
const parseNumber=(value,fallback)=>{ const n=Number(String(value).trim().replace(',','.')); return Number.isFinite(n)?n:fallback; };
const formatRate=n=>Number(n).toFixed(2).replace(/\.00$/,'').replace(/0$/,'');
function normalizeOpacity(value){ const n=parseNumber(value,90); return Math.round(clamp(n<=1?n*100:n,0,100)); }
function effectiveCeiling(){ return settings.extremeMode ? 16 : 4; }
function normalizeMax(value){ const c=effectiveCeiling(); const n=parseNumber(value,settings.maxSpeed); return clamp(settings.extremeMode && n>=15.75?16:n, settings.minSpeed, c); }
function rateBounds(){ const min=clamp(parseNumber(settings.minSpeed,.25),.1,effectiveCeiling()); const max=normalizeMax(settings.maxSpeed); return {min,max}; }
function normalizeRate(value,fallback=1){ const {min,max}=rateBounds(); return roundRate(clamp(parseNumber(value,fallback),min,max)); }
function sanitizeFilename(value){ return String(value||'YouTube video').replace(/[\\/:*?"<>|\x00-\x1F]/g,' ').replace(/\s+/g,' ').trim().slice(0,140)||'YouTube video'; }

function flash(text='已儲存'){
  $('status').textContent=text; $('status').classList.add('saved'); clearTimeout(statusTimer);
  statusTimer=setTimeout(()=>{$('status').textContent='設定會自動儲存';$('status').classList.remove('saved');},1300);
}
function applyTheme(lastTheme){ const site=settings.themeMode==='auto'?(lastTheme||document.body.dataset.lastYoutubeTheme||'dark'):settings.themeMode; const theme=settings.uiBackground&&settings.uiBackground!=='auto'?settings.uiBackground:site; document.body.dataset.theme=theme==='warm'?'warm':theme==='graphite'?'graphite':theme==='midnight'?'midnight':theme==='light'?'light':'dark'; document.body.dataset.accent=settings.accentColor||'violet'; }
function setControl(id,value){ $(id).value=formatRate(value); $(id).setAttribute('aria-valuenow',String(value)); }
function syncUI(){
  $('enabled').checked=!!settings.enabled; $('lockSpeed').checked=!!settings.lockSpeed; $('floatingEnabled').checked=!!settings.floatingEnabled;
  $('hoverExpand').checked=!!settings.hoverExpand; $('profilesEnabled').checked=!!settings.profilesEnabled;
  setControl('generalSpeed',settings.generalSpeed); setControl('shortsSpeed',settings.shortsSpeed); setControl('boostSpeed',settings.boostSpeed);
}
async function savePatch(patch){ settings={...settings,...patch}; await chrome.storage.local.set(patch); flash(); }
function schedulePatch(patchFactory){ clearTimeout(saveTimer); saveTimer=setTimeout(()=>savePatch(patchFactory()),150); }

function stepControl(control, direction){
  const id=control.dataset.control; const input=$(id); const fixed=parseNumber(control.dataset.fixedStep,NaN);
  const delta=Number.isFinite(fixed)?fixed:settings.step;
  const {min,max}=rateBounds(); const current=normalizeRate(input.value,settings[id]);
  let next=roundRate(current + direction*delta);
  if(direction>0 && next>max) next=max; if(direction<0 && next<min) next=min;
  next=roundRate(clamp(next,min,max)); setControl(id,next); savePatch({[id]:next});
}
function commitControl(id){ const value=normalizeRate($(id).value,settings[id]); setControl(id,value); savePatch({[id]:value}); }

async function queryRuntime(){
  try{
    const [active]=await chrome.tabs.query({active:true,lastFocusedWindow:true}); activeTabId=active?.id??null;
    if(active){const ensured=await YTSSRuntimeClient.ensure(active,{allowInject:true});if(ensured.ok&&ensured.response?.version===EXTENSION_VERSION&&ensured.response?.protocol===RUNTIME_PROTOCOL){const r=ensured.response;const platform=r.context?.platformLabel||r.context?.platform||'影片網站';$('runtimeStatus').textContent=`已連線目前 ${platform} 分頁${ensured.reinjected?' · runtime 已自動修復':''}`;$('profilesEnabled').closest('.quick-toggle')?.classList.toggle('platform-limited',r.context?.platform!=='youtube');return r}}
    const found=await YTSSRuntimeClient.discover({requireVideo:false,preferActive:false});if(found.response){const platform=found.response.context?.platformLabel||found.response.context?.platform||'影片網站';$('runtimeStatus').textContent=`目前頁無影片 runtime；已找到其他 ${platform} 分頁${found.reinjected?' · 已修復':''}`;return found.response}
    $('runtimeStatus').textContent='尚未找到支援的影片分頁；開啟 YouTube 或 bilibili 後會自動連線';return null;
  }catch(error){$('runtimeStatus').textContent=`runtime 狀態無法讀取：${error?.message||'unknown error'}`;return null}
}
async function load(){
  const stored=await chrome.storage.local.get({...DEFAULTS,ytssLastTheme:'dark',ytssUpdateInfo:null,ytssIntegrityState:null}); settings={...structuredClone(DEFAULTS),...stored};
  settings.panelOpacity=normalizeOpacity(settings.panelOpacity); settings.maxSpeed=normalizeMax(settings.maxSpeed);
  settings.generalSpeed=normalizeRate(settings.generalSpeed,DEFAULTS.generalSpeed); settings.shortsSpeed=normalizeRate(settings.shortsSpeed,DEFAULTS.shortsSpeed); settings.boostSpeed=normalizeRate(settings.boostSpeed,DEFAULTS.boostSpeed);
  const migration={}; if(Number(stored.panelOpacity)!==settings.panelOpacity) migration.panelOpacity=settings.panelOpacity; if(Number(stored.maxSpeed)!==settings.maxSpeed) migration.maxSpeed=settings.maxSpeed; if(Object.keys(migration).length) await chrome.storage.local.set(migration);
  document.body.dataset.lastYoutubeTheme=stored.ytssLastTheme||'dark'; document.body.dataset.accent=settings.accentColor||'violet'; document.body.dataset.uiBackground=settings.uiBackground||'auto'; applyTheme(stored.ytssLastTheme); YTSSI18n?.setLocale(settings.uiLanguage||'auto'); syncUI(); $('versionBadge').textContent=`v${EXTENSION_VERSION}`; const info=stored.ytssUpdateInfo; if(info?.available){$('updateBanner').hidden=false;$('updateBannerText').textContent=`v${info.latest} · 官方 Release`;} const integrity=stored.ytssIntegrityState; if($('officialBadge')){$('officialBadge').textContent=integrity?.ok?'OFFICIAL':integrity?'CHECK FAILED':'VERIFY';$('officialBadge').classList.toggle('failed',Boolean(integrity&&!integrity.ok));}
}
function wire(){
  ['enabled','lockSpeed','floatingEnabled','hoverExpand','profilesEnabled'].forEach(id=>$(id).addEventListener('input',()=>savePatch({[id]:$(id).checked})));
  document.querySelectorAll('.number-control').forEach(control=>{
    control.querySelectorAll('.step-button').forEach(button=>button.addEventListener('click',()=>stepControl(control,Number(button.dataset.step))));
    const id=control.dataset.control; $(id).addEventListener('change',()=>commitControl(id)); $(id).addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();$(id).blur();}});
  });
  $('openOptions').addEventListener('click',()=>chrome.runtime.openOptionsPage());
  $('updateBanner').addEventListener('click',()=>chrome.tabs.create({url:'https://github.com/Ray20123315/youtube-speed-studio/releases/latest'}));
  $('openDownloadStudio').addEventListener('click',()=>{ chrome.tabs.create({url:chrome.runtime.getURL('options.html#downloads')}); window.close(); });
  chrome.storage.onChanged.addListener((changes,area)=>{ if(area!=='local')return; if(changes.ytssLastTheme){document.body.dataset.lastYoutubeTheme=changes.ytssLastTheme.newValue||'dark';applyTheme(changes.ytssLastTheme.newValue);} });
}
load().then(()=>{wire();queryRuntime();}).catch(console.error);
