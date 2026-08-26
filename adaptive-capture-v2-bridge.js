(() => {
  'use strict';
  const KEY='__YTSS_ADAPTIVE_CAPTURE_V2_INSTANCE__';
  try { globalThis[KEY]?.dispose?.(); } catch {}
  const ATTR='data-ytss-adaptive-v2-capture', EVENT='ytss-adaptive-v2-capture', RESET='ytss-adaptive-v2-reset';
  let alive=true;
  const currentVideoId=()=>{try{const u=new URL(location.href);return u.pathname.startsWith('/shorts/')?u.pathname.split('/')[2]||null:u.searchParams.get('v')}catch{return null}};
  function publish(c){if(!alive||!c||typeof c.url!=='string')return;const p={...c,pageHref:location.href,videoId:currentVideoId(),bridgedAt:Date.now()};try{document.documentElement.setAttribute(ATTR,JSON.stringify(p));document.dispatchEvent(new Event(EVENT));}finally{document.documentElement.removeAttribute(ATTR);}}
  function onMessage(m){if(m?.type==='YTSS_MEDIA_CAPTURE') publish(m.capture);return false;}
  function onNavigate(){document.dispatchEvent(new Event(RESET));chrome.runtime.sendMessage({type:'YTSS_CLEAR_MEDIA_CAPTURES'}).catch(()=>{});}
  chrome.runtime.onMessage.addListener(onMessage);
  document.addEventListener('yt-navigate-start',onNavigate,true);
  chrome.runtime.sendMessage({type:'YTSS_GET_MEDIA_CAPTURES'}).then(r=>(r?.captures||[]).forEach(publish)).catch(()=>{});
  globalThis[KEY]={dispose(){if(!alive)return;alive=false;try{chrome.runtime.onMessage.removeListener(onMessage)}catch{};document.removeEventListener('yt-navigate-start',onNavigate,true);}};
})();
