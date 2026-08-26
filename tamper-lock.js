(() => {
  'use strict';
  const INSTANCE='__YTSS_TAMPER_CONTENT_LOCK_V1__';
  try{globalThis[INSTANCE]?.dispose?.();}catch{}
  let disposed=false, locked=true, shortcutCodes=new Set(['BracketLeft','BracketRight','Backquote','Backslash']);
  let badge=null, style=null, poll=null;
  function alive(){try{return Boolean(chrome?.runtime?.id);}catch{return false;}}
  function ensureStyle(){if(style)return;style=document.createElement('style');style.textContent='#ytss-panel[data-ytss-tamper-locked="1"]{pointer-events:none!important;filter:grayscale(.92) contrast(.82)!important;opacity:.52!important}';(document.head||document.documentElement).appendChild(style);}
  function render(){if(disposed)return;ensureStyle();const panel=document.getElementById('ytss-panel');if(panel){if(locked)panel.dataset.ytssTamperLocked='1';else delete panel.dataset.ytssTamperLocked;}
    if(locked){if(!badge){badge=document.createElement('div');badge.id='ytssTamperLockBadge';badge.style.cssText='position:fixed;right:14px;bottom:14px;z-index:2147483647;padding:8px 11px;border:1px solid #ff6778;border-radius:999px;background:#2a1116;color:#ff9aa5;font:800 10px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;box-shadow:0 10px 30px rgba(0,0,0,.35)';badge.textContent='YTSS · TAMPER LOCK';document.documentElement.appendChild(badge);}}else{badge?.remove();badge=null;}}
  function dispose(){if(disposed)return;disposed=true;clearInterval(poll);document.removeEventListener('click',blockPointer,true);document.removeEventListener('pointerdown',blockPointer,true);document.removeEventListener('keydown',blockKey,true);document.removeEventListener('keyup',blockKey,true);badge?.remove();style?.remove();const p=document.getElementById('ytss-panel');if(p)delete p.dataset.ytssTamperLocked;}
  function ensureContext(){if(alive())return true;dispose();return false;}
  function blockPointer(event){if(!ensureContext()||!locked)return;const t=event.target instanceof Element?event.target.closest('#ytss-panel'):null;if(!t)return;event.preventDefault();event.stopImmediatePropagation();}
  function blockKey(event){if(!ensureContext()||!locked||!shortcutCodes.has(event.code))return;event.preventDefault();event.stopImmediatePropagation();}
  async function refresh(){if(!ensureContext())return;try{const s=await chrome.runtime.sendMessage({type:'YTSS_GET_TAMPER_STATE'});locked=!s||s.pending!==false||s.locked!==false;render();}catch{dispose();}}
  try{chrome.storage.local.get({decreaseKey:'BracketLeft',increaseKey:'BracketRight',boostKey:'Backquote',pauseKey:'Backslash'}).then(s=>{shortcutCodes=new Set([s.decreaseKey,s.increaseKey,s.boostKey,s.pauseKey].filter(Boolean));}).catch(()=>{});}catch{}
  document.addEventListener('click',blockPointer,true);document.addEventListener('pointerdown',blockPointer,true);document.addEventListener('keydown',blockKey,true);document.addEventListener('keyup',blockKey,true);
  const observer=new MutationObserver(render);observer.observe(document.documentElement,{childList:true,subtree:true});
  try{chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.ytssTamperLockState){const s=changes.ytssTamperLockState.newValue;locked=!s||s.pending!==false||s.locked!==false;render();}});}catch{}
  render();refresh();poll=setInterval(refresh,5000);
  globalThis[INSTANCE]={dispose(){observer.disconnect();dispose();}};
})();
