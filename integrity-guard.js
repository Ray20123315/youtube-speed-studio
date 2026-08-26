'use strict';
importScripts('background.js','background-adaptive.js');
(() => {
  const LOCK_FILE = 'integrity-lock.json';
  const STATE_KEY = 'ytssTamperLockState';
  const LATCH_KEY = 'ytssTamperLatch';
  const TRUSTED_COUNTER_KEY = 'ytssTrustedAuthorizationCounter';
  const ALARM = 'ytss-integrity-watch';
  const PUBLIC_KEY_SPKI_BASE64 = 'MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAmlhRyWd0myhQtjCJaJZKy0GlVdAy1xcn0KRwta05q6dUvIp1i9Bo5qFrMmUdy7s3g/1LO7OyfNqm5QHpu0tb+Icd32lDBEIFbnzW2RfpPhRERG/MtLintM3D9sABcMHENvx/Ab0RUU24KUNIhmP9qEOd2izFneq0GAvN0K1rSkdfQsR533O8ll7h2eHjSXkHcR46I3smcC854xgPEPz0BeUorVAAuJ0ObEx4yNvlHXftsrC9HcafQ3+2iR3LLbOSZeVjFmNzTvoWGE1yeSwox4VmpMrtS7yaVuJpn3HXMGxLne2nl6RMrjOqSwpOtLFCVJ9du4GQzNBfjrZ6mlUTMVbNzqAVanw4s8Ta9pORB0uw29NRWacgv59SnN8Z0IX+P28LKjMQoQ5FeND79wM7LsEFpwTx67at7Lnqqx2kTrYREsbfPeFfXICl6+GsCdSRm+IFilzaAAI2yT1hepJYF8OPeQ2En0HvYgV5sYLzEeuVQIuYZJ/2pq0obD2b/IE3AgMBAAE=';
  const PUBLIC_KEY_FINGERPRINT_SHA256 = 'c15374dfe729285f9d414053bcc5e04660244716cb1959bceacdd0c4356b7c93';
  const encoder = new TextEncoder();
  let currentState = { pending: true, locked: true, code: 'verification-pending', checkedAt: 0, publicKeyFingerprintSha256: PUBLIC_KEY_FINGERPRINT_SHA256 };
  let checkPromise = null;
  let operationalInstalled = false;

  function installOperationalBackground() {
    if (operationalInstalled || !isOperational()) return;
    operationalInstalled = true;
    try { globalThis.YTSSInstallUpdateBackground?.(); } catch {}
    try { globalThis.YTSSInstallAdaptiveBackground?.(); } catch {}
  }

  function clone(value) { try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value)); } }
  function stable(value) {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
    return JSON.stringify(value);
  }
  function fromB64(value) { const raw=atob(String(value||'')); const out=new Uint8Array(raw.length); for(let i=0;i<raw.length;i++) out[i]=raw.charCodeAt(i); return out; }
  function hex(bytes) { return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join(''); }
  async function gitBlobSha1(buffer) {
    const bytes = new Uint8Array(buffer);
    const head = encoder.encode(`blob ${bytes.byteLength}\0`);
    const all = new Uint8Array(head.byteLength + bytes.byteLength);
    all.set(head,0); all.set(bytes,head.byteLength);
    return hex(new Uint8Array(await crypto.subtle.digest('SHA-1', all)));
  }
  async function importPublicKey() {
    return crypto.subtle.importKey('spki', fromB64(PUBLIC_KEY_SPKI_BASE64), {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'}, false, ['verify']);
  }
  async function setBadge(state) {
    try {
      const blocked = state.locked || state.pending;
      await chrome.action.setPopup({popup: blocked ? 'tamper-locked.html' : 'popup.html'});
      if (state.locked) { await chrome.action.setBadgeText({text:'LOCK'}); await chrome.action.setBadgeBackgroundColor({color:'#c73345'}); }
      else if (state.pending) { await chrome.action.setBadgeText({text:'…'}); await chrome.action.setBadgeBackgroundColor({color:'#666a76'}); }
      else await chrome.action.setBadgeText({text:''});
      if (blocked) {
        const lockUrl = chrome.runtime.getURL('tamper-locked.html');
        const optionsUrl = chrome.runtime.getURL('options.html');
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) if (tab?.id && String(tab.url||tab.pendingUrl||'').startsWith(optionsUrl)) chrome.tabs.update(tab.id,{url:lockUrl}).catch(()=>{});
      }
    } catch {}
  }
  async function persistState(state) {
    currentState = state;
    const integrityState = { ok: !state.locked && !state.pending, signed: true, fingerprint: state.buildId || null, publicKeyFingerprintSha256: PUBLIC_KEY_FINGERPRINT_SHA256, authorizationCounter: state.authorizationCounter || null, failures: state.reasons || [], checkedAt: state.checkedAt };
    await chrome.storage.local.set({ [STATE_KEY]: state, ytssIntegrityState: integrityState });
    await setBadge(state);
    return state;
  }
  async function failClosed(reasons, trustedCounter=0, observedCounter=0, extra={}) {
    const stored = await chrome.storage.local.get({[LATCH_KEY]:null,[TRUSTED_COUNTER_KEY]:0});
    const previous = stored[LATCH_KEY];
    const baseTrusted = Math.max(Number(stored[TRUSTED_COUNTER_KEY])||0, Number(trustedCounter)||0);
    const requiredCounter = Math.max(Number(previous?.requiredCounter)||0, baseTrusted + 1, (Number(observedCounter)||0) + 1);
    const latch = { latched:true, requiredCounter, detectedAt: previous?.detectedAt || Date.now(), lastDetectedAt: Date.now(), reasons: [...new Set((reasons||[]).map(String))].slice(0,24) };
    await chrome.storage.local.set({[LATCH_KEY]:latch});
    return persistState({ pending:false, locked:true, code:'tamper-detected', reasons:latch.reasons, requiredAuthorizationCounter:requiredCounter, checkedAt:Date.now(), publicKeyFingerprintSha256:PUBLIC_KEY_FINGERPRINT_SHA256, ...extra });
  }
  async function verifyPackage() {
    let doc=null, payload=null, observedCounter=0;
    try {
      const response = await fetch(chrome.runtime.getURL(LOCK_FILE), {cache:'no-store'});
      if (!response.ok) return failClosed(['signed-lock-manifest-missing']);
      doc = await response.json(); payload = doc?.payload || null; observedCounter=Number(payload?.authorizationCounter)||0;
      if (!payload || doc?.schemaVersion !== 1) return failClosed(['signed-lock-schema-invalid'],0,observedCounter);
      if (String(doc?.signature?.keyFingerprintSha256||'') !== PUBLIC_KEY_FINGERPRINT_SHA256) return failClosed(['public-key-fingerprint-mismatch'],0,observedCounter);
      const key = await importPublicKey();
      const sig = fromB64(doc?.signature?.valueBase64 || '');
      const message = encoder.encode(stable(payload));
      const signatureOk = await crypto.subtle.verify({name:'RSASSA-PKCS1-v1_5'}, key, sig, message);
      if (!signatureOk) return failClosed(['integrity-signature-invalid'],0,observedCounter);
      const version = chrome.runtime.getManifest().version;
      if (payload.product !== 'youtube-speed-studio' || payload.version !== version) return failClosed(['signed-build-version-mismatch'],0,observedCounter,{buildId:payload.buildId||null,authorizationCounter:observedCounter});
      const failures=[];
      for (const entry of payload.files || []) {
        try {
          const r=await fetch(chrome.runtime.getURL(entry.path),{cache:'no-store'});
          if(!r.ok){failures.push(`${entry.path}:missing`);continue;}
          const b=await r.arrayBuffer();
          if(Number(entry.size)!==b.byteLength){failures.push(`${entry.path}:size`);continue;}
          const actual=await gitBlobSha1(b);
          if(actual!==entry.gitBlobSha1) failures.push(`${entry.path}:hash`);
        } catch { failures.push(`${entry.path}:read`); }
      }
      if(failures.length) return failClosed(failures,0,observedCounter,{buildId:payload.buildId||null,authorizationCounter:observedCounter});
      const stored = await chrome.storage.local.get({[LATCH_KEY]:null,[TRUSTED_COUNTER_KEY]:0});
      const latch = stored[LATCH_KEY];
      if(latch?.latched && observedCounter < Number(latch.requiredCounter||0)) {
        return persistState({pending:false,locked:true,code:'tamper-latch-awaiting-authorized-build',reasons:['previous-tamper-latch'],requiredAuthorizationCounter:Number(latch.requiredCounter||0),authorizationCounter:observedCounter,buildId:payload.buildId||null,checkedAt:Date.now(),publicKeyFingerprintSha256:PUBLIC_KEY_FINGERPRINT_SHA256});
      }
      if(latch?.latched) await chrome.storage.local.remove(LATCH_KEY);
      await chrome.storage.local.set({[TRUSTED_COUNTER_KEY]:observedCounter});
      const verifiedState = await persistState({pending:false,locked:false,code:'verified',reasons:[],authorizationCounter:observedCounter,buildId:payload.buildId||null,checkedAt:Date.now(),publicKeyFingerprintSha256:PUBLIC_KEY_FINGERPRINT_SHA256});
      installOperationalBackground();
      return verifiedState;
    } catch(error) {
      return failClosed([`integrity-check-error:${String(error?.message||error)}`],0,observedCounter,{buildId:payload?.buildId||null,authorizationCounter:observedCounter});
    }
  }
  function verify(force=false) {
    if(checkPromise && !force) return checkPromise;
    checkPromise = verifyPackage().finally(()=>{checkPromise=null;});
    return checkPromise;
  }
  function getState() { return clone(currentState); }
  function isOperational() { return currentState.pending === false && currentState.locked === false; }
  globalThis.YTSSIntegrityGate = Object.freeze({verify,getState,isOperational,publicKeyFingerprintSha256:PUBLIC_KEY_FINGERPRINT_SHA256});

  chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
    if(message?.type==='YTSS_GET_TAMPER_STATE'){sendResponse(getState());return false;}
    if(message?.type==='YTSS_VERIFY_INTEGRITY'){verify(true).then(sendResponse);return true;}
    return false;
  });
  chrome.runtime.onInstalled.addListener(()=>{try{chrome.alarms.create(ALARM,{periodInMinutes:1});}catch{} verify(true);});
  chrome.runtime.onStartup.addListener(()=>{try{chrome.alarms.create(ALARM,{periodInMinutes:1});}catch{} verify(true);});
  chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name===ALARM)verify(true);});
  try{chrome.alarms.create(ALARM,{periodInMinutes:1});}catch{}
  chrome.tabs.onUpdated.addListener((tabId,changeInfo,tab)=>{
    if (isOperational()) return;
    const url=String(changeInfo.url||tab?.url||tab?.pendingUrl||'');
    if(url.startsWith(chrome.runtime.getURL('options.html'))) chrome.tabs.update(tabId,{url:chrome.runtime.getURL('tamper-locked.html')}).catch(()=>{});
  });
  verify(true);
})();
