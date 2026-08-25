(() => {
  'use strict';
  for (const key of ['__YTSS_ADAPTIVE_CAPTURE_V2_INSTANCE__']) {
    try { globalThis[key]?.dispose?.(); } catch {}
    try { delete globalThis[key]; } catch { globalThis[key] = null; }
  }
})();

(() => {
  'use strict';
  const KEY = '__YTSS_CONTROL_OWNER_V3_INSTANCE__';
  const V2_KEY = '__YTSS_CONTROL_FAILSAFE_V2_INSTANCE__';
  try { globalThis[KEY]?.dispose?.(); } catch {}

  try { globalThis[V2_KEY]?.dispose?.(); } catch {}
  try {
    Object.defineProperty(globalThis, V2_KEY, {
      configurable: false,
      enumerable: false,
      get() { return null; },
      set(value) { try { value?.dispose?.(); } catch {} }
    });
  } catch {}

  const DEFAULTS = {
    enabled: true,
    rememberLast: true,
    generalSpeed: 1.5,
    shortsSpeed: 1,
    step: .25,
    minSpeed: .25,
    maxSpeed: 8,
    extremeMode: true,
    preservePitch: true,
    accentColor: 'violet'
  };
  const PALETTES = {
    violet: ['#7658ff','#9a83ff'], blue: ['#3478f6','#64a2ff'], cyan: ['#00a7c7','#54d6e8'],
    green: ['#1f9d68','#55c998'], amber: ['#c88713','#f0b84e'], orange: ['#e66a2c','#ff9a58'],
    rose: ['#e04e73','#ff86a4'], magenta: ['#b84ad8','#e685ff']
  };
  let alive = true;
  let settings = { ...DEFAULTS };
  let held = null;
  const pending = new Set();

  const clamp = (n,min,max) => Math.min(max,Math.max(min,n));
  const round = n => Math.round(n * 100) / 100;
  const modeKey = () => location.pathname.startsWith('/shorts/') ? 'shortsSpeed' : 'generalSpeed';
  const configured = () => Number(settings[modeKey()]) || 1;
  const bounds = () => {
    const ceiling = settings.extremeMode ? 16 : 4;
    const min = clamp(Number(settings.minSpeed) || .25,.1,ceiling);
    return { min, max: clamp(Number(settings.maxSpeed) || 8,min,ceiling) };
  };
  const format = n => `${Number(n).toFixed(2).replace(/\.00$/,'').replace(/0$/,'')}×`;
  const rgba = (hex,a) => {
    const x = hex.replace('#','');
    return `rgba(${parseInt(x.slice(0,2),16)},${parseInt(x.slice(2,4),16)},${parseInt(x.slice(4,6),16)},${a})`;
  };

  function video() {
    const list = [...document.querySelectorAll('video')].filter(v => v?.isConnected);
    let best = null, score = -Infinity;
    for (const v of list) {
      const r = v.getBoundingClientRect();
      const s = getComputedStyle(v);
      let n = Math.max(0,r.width) * Math.max(0,r.height);
      if (!v.paused && !v.ended) n += 1e9;
      if (s.display === 'none' || s.visibility === 'hidden') n -= 1e12;
      if (n > score) { score = n; best = v; }
    }
    return best;
  }
  const panel = () => document.getElementById('ytss-panel');
  function applyPalette() {
    const p = panel(); if (!p) return;
    const key = PALETTES[settings.accentColor] ? settings.accentColor : 'violet';
    const [a,b] = PALETTES[key];
    p.dataset.accent = key;
    p.style.setProperty('--ytss-accent',a);
    p.style.setProperty('--ytss-accent-2',b);
    p.style.setProperty('--ytss-card-active',rgba(a,.72));
    p.style.setProperty('--ytss-accent-border',rgba(a,.42));
    p.style.setProperty('--ytss-accent-shadow',rgba(a,.28));
  }
  function renderFallback(rate) {
    const p = panel(); if (!p) return;
    applyPalette();
    for (const sel of ['#ytss-speed','#ytss-hover-speed']) {
      const el = p.querySelector(sel); if (el) el.textContent = format(rate);
    }
    p.querySelectorAll('.ytss-preset').forEach(btn => btn.classList.toggle('active',Math.abs(Number(btn.dataset.speed)-rate)<.01));
  }
  async function persistFallback(rate) {
    if (!settings.rememberLast) return;
    const key = modeKey(); settings[key] = rate;
    try { await chrome.storage.local.set({ [key]: rate }); } catch {}
  }
  function applyFallback(raw,{persist=true}={}) {
    const v = video(); if (!v || !settings.enabled) return false;
    const {min,max} = bounds(); const rate = round(clamp(Number(raw)||1,min,max));
    try {
      if ('preservesPitch' in v) v.preservesPitch = settings.preservePitch !== false;
      v.playbackRate = rate; v.defaultPlaybackRate = rate;
      renderFallback(rate);
      if (persist) persistFallback(rate);
      return true;
    } catch { return false; }
  }
  function buttonFrom(event) {
    const t = event.target instanceof Element ? event.target.closest('#ytss-panel button') : null;
    return t && panel()?.contains(t) ? t : null;
  }
  function intentFor(button, before) {
    const step = Math.max(.01,Number(settings.step)||.25);
    const preset = button.classList.contains('ytss-preset') ? Number(button.dataset.speed) : NaN;
    if (Number.isFinite(preset)) return { type:'rate', target:preset, persist:true };
    if (button.id === 'ytss-minus' || button.id === 'ytss-quick-down') return { type:'rate', target:before-step, persist:true };
    if (button.id === 'ytss-plus' || button.id === 'ytss-quick-up') return { type:'rate', target:before+step, persist:true };
    if (button.id === 'ytss-speed' || button.id === 'ytss-hover-speed') return { type:'toggle', target:Math.abs(before-1)<.01 ? configured() : 1, persist:false };
    return null;
  }
  function scheduleFallback(button, before, intent) {
    const token = {}; pending.add(token);
    setTimeout(() => {
      pending.delete(token);
      if (!alive || !button.isConnected) return;
      const v = video(); if (!v) return;
      const actual = Number(v.playbackRate) || 1;
      if (Math.abs(actual - before) > .001 || Math.abs(actual - intent.target) < .001) {
        applyPalette();
        return;
      }
      applyFallback(intent.target,{persist:intent.persist});
    }, 120);
  }
  function onClickCapture(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const b = buttonFrom(event); if (!b) return;
    const v = video(); if (!v) return;
    const before = Number(v.playbackRate) || configured();
    const intent = intentFor(b,before); if (!intent) return;
    scheduleFallback(b,before,intent);
  }
  function onPointerDownCapture(event) {
    if (event.button !== 0) return;
    const b = buttonFrom(event); if (!b || !['ytss-quick-boost','ytss-quick-pause'].includes(b.id)) return;
    const v = video(); if (!v) return;
    const before = Number(v.playbackRate) || configured();
    const token = { button:b, pointerId:event.pointerId, before, target:b.id==='ytss-quick-pause'?1:Number(settings.boostSpeed)||3 };
    held = token;
    setTimeout(() => {
      if (!alive || held !== token) return;
      const current = Number(video()?.playbackRate)||1;
      if (Math.abs(current-before) <= .001) applyFallback(token.target,{persist:false});
    },120);
  }
  function onPointerUpCapture(event) {
    if (!held || (event.pointerId !== undefined && held.pointerId !== event.pointerId)) return;
    const token=held; held=null;
    setTimeout(() => {
      if (!alive) return;
      const current=Number(video()?.playbackRate)||1;
      if (Math.abs(current-token.target)<.001) applyFallback(token.before,{persist:false});
    },120);
  }

  window.addEventListener('click',onClickCapture,true);
  window.addEventListener('pointerdown',onPointerDownCapture,true);
  window.addEventListener('pointerup',onPointerUpCapture,true);
  window.addEventListener('pointercancel',onPointerUpCapture,true);
  function onStorageChanged(changes,area) {
    if (!alive || area !== 'local') return;
    for (const key of Object.keys(DEFAULTS)) if (changes[key]) settings[key] = changes[key].newValue;
    if (changes.accentColor) applyPalette();
  }
  chrome.storage.onChanged.addListener(onStorageChanged);
  chrome.storage.local.get(DEFAULTS).then(v => { if(!alive)return; settings={...DEFAULTS,...v}; applyPalette(); }).catch(()=>{});
  const observer = new MutationObserver(() => { if(alive) applyPalette(); });
  observer.observe(document.documentElement,{subtree:true,childList:true});

  globalThis[KEY] = { dispose() {
    if (!alive) return; alive=false;
    window.removeEventListener('click',onClickCapture,true);
    window.removeEventListener('pointerdown',onPointerDownCapture,true);
    window.removeEventListener('pointerup',onPointerUpCapture,true);
    window.removeEventListener('pointercancel',onPointerUpCapture,true);
    try { chrome.storage.onChanged.removeListener(onStorageChanged); } catch {}
    observer.disconnect(); pending.clear(); held=null;
  }};
})();
