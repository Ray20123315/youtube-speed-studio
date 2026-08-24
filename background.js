const REPO='Ray20123315/youtube-speed-studio';
const RELEASE_API=`https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASE_PAGE=`https://github.com/${REPO}/releases/latest`;
const UPDATE_ALARM='ytss-update-check';
const CHECK_INTERVAL_HOURS=12;
function parts(v){return String(v||'0').replace(/^v/i,'').split('.').map(n=>parseInt(n,10)||0)}
function newer(a,b){const aa=parts(a),bb=parts(b);for(let i=0;i<Math.max(aa.length,bb.length);i++){if((aa[i]||0)!==(bb[i]||0))return(aa[i]||0)>(bb[i]||0)}return false}
async function setBadge(available){await chrome.action.setBadgeText({text:available?'UP':''});if(available)await chrome.action.setBadgeBackgroundColor({color:'#7658ff'});}
async function checkUpdate(force=false){
  const current=chrome.runtime.getManifest().version; const stored=await chrome.storage.local.get({updateCheckEnabled:true,ytssUpdateInfo:null});
  if(!stored.updateCheckEnabled&&!force)return stored.ytssUpdateInfo;
  const prev=stored.ytssUpdateInfo; if(!force&&prev?.checkedAt&&Date.now()-prev.checkedAt<60*60*1000)return prev;
  try{const response=await fetch(RELEASE_API,{headers:{Accept:'application/vnd.github+json'}});if(!response.ok)throw new Error(`GitHub ${response.status}`);const data=await response.json();const latest=String(data.tag_name||data.name||'').replace(/^v/i,'');const info={ok:true,current,latest,available:newer(latest,current),url:data.html_url||RELEASE_PAGE,checkedAt:Date.now()};await chrome.storage.local.set({ytssUpdateInfo:info});await setBadge(info.available);return info}catch(error){const info={ok:false,current,latest:prev?.latest||null,available:prev?.available||false,url:prev?.url||RELEASE_PAGE,checkedAt:Date.now(),error:String(error?.message||error)};await chrome.storage.local.set({ytssUpdateInfo:info});await setBadge(info.available);return info}
}
async function sha256(buffer){const hash=await crypto.subtle.digest('SHA-256',buffer);return[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function verifyIntegrity(){
  try{const manifest=await (await fetch(chrome.runtime.getURL('integrity.json'),{cache:'no-store'})).json();const failures=[];for(const entry of manifest.files||[]){const response=await fetch(chrome.runtime.getURL(entry.path),{cache:'no-store'});const actual=await sha256(await response.arrayBuffer());if(actual!==entry.sha256)failures.push(entry.path)}const state={ok:failures.length===0,fingerprint:manifest.fingerprint,owner:manifest.owner,repository:manifest.repository,failures,checkedAt:Date.now()};await chrome.storage.local.set({ytssIntegrityState:state});return state}catch(error){const state={ok:false,failures:['integrity-check-error'],error:String(error?.message||error),checkedAt:Date.now()};await chrome.storage.local.set({ytssIntegrityState:state});return state}
}
chrome.runtime.onInstalled.addListener(()=>{chrome.alarms.create(UPDATE_ALARM,{periodInMinutes:CHECK_INTERVAL_HOURS*60});checkUpdate(true);verifyIntegrity();});
chrome.runtime.onStartup.addListener(()=>{chrome.alarms.create(UPDATE_ALARM,{periodInMinutes:CHECK_INTERVAL_HOURS*60});checkUpdate(false);verifyIntegrity();});
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name===UPDATE_ALARM)checkUpdate(false)});
chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{if(message?.type==='YTSS_CHECK_UPDATE'){checkUpdate(true).then(sendResponse);return true}if(message?.type==='YTSS_VERIFY_INTEGRITY'){verifyIntegrity().then(sendResponse);return true}return false});
