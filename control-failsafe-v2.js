(() => {
  'use strict';
  const KEY = '__YTSS_CONTROL_FAILSAFE_V2_INSTANCE__';
  try { globalThis[KEY]?.dispose?.(); } catch {}
  let alive = true;

  const DEFAULTS = {
    enabled: true,
    rememberLast: true,
    generalSpeed: 1.5,
    shortsSpeed: 1,
    step: .25,
    minSpeed: .25,
    maxSpeed: 8,
    extremeMode: true,
    boostSpeed: 3,
    preservePitch: true,
    accentColor: 'violet'
  };
  const PALETTES = {
    violet: ['#7658ff','#9a83ff'], blue: ['#3478f6','#64a2ff'], cyan: ['#00a7c7','#54d6e8'],
    green: ['#1f9d68','#55c998'], amber: ['#c88713','#f0b84e'], orange: ['#e66a2c','#ff9a58'],
    rose: ['#e04e73','#ff86a4'], magenta: ['#b84ad8','#e685ff']
  };
  let settings = { ...DEFAULTS };
  let held = null;

  const clamp = (n,min,max) => Math.min(max,Math.max(min,n));
  const round = n => Math.round(n * 100) / 100;
  const format = n => `${Number(n).toFixed(2).replace(/\.00$/,'').replace(/0$/,'')}×`;
  const modeKey = () => location.pathname.startsWith('/shorts/') ? 'shortsSpeed' : 'generalSpeed';
  const bounds = () => {
    const ceiling = settings.extremeMode ? 16 : 4;
    const min = clamp(Number(settings.minSpeed) || .25,.1,ceiling);
    return { min, max: clamp(Number(settings.maxSpeed) || 8,min,ceiling) };
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
  function panel() { return document.getElementById('ytss-panel'); }
  function rgba(hex,a) {
    const x = hex.replace('#','');
    return `rgba(${parseInt(x.slice(0,2),16)},${parseInt(x.slice(2,4),16)},${parseInt(x.slice(4,6),16)},${a})`;
  }
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
  function render(rate) {
    const p = panel(); if (!p) return;
    applyPalette();
    for (const sel of ['#ytss-speed','#ytss-hover-speed']) {
      const el = p.querySelector(sel); if (el) el.textContent = format(rate);
    }
    p.querySelectorAll('.ytss-preset').forEach(btn => btn.classList.toggle('active',Math.abs(Number(btn.dataset.speed)-rate)<.01));
  }
  async function persist(rate) {
    if (!settings.rememberLast) return;
    const key = modeKey();
    settings[key] = rate;
    try { await chrome.storage.local.set({ [key]: rate }); } catch {}
  }
  function setRate(raw,{persistRate=true}={}) {
    const v = video(); if (!v || !settings.enabled) return false;
    const {min,max} = bounds(); const rate = round(clamp(Number(raw)||1,min,max));
    try {
      if ('preservesPitch' in v) v.preservesPitch = settings.preservePitch !== false;
      v.playbackRate = rate; v.defaultPlaybackRate = rate;
      render(rate);
      if (persistRate) persist(rate);
      return true;
    } catch { return false; }
  }
  function buttonFrom(event) {
    const t = event.target instanceof Element ? event.target.closest('#ytss-panel button') : null;
    return t && panel()?.contains(t) ? t : null;
  }
  function stop(event) { event.preventDefault(); event.stopImmediatePropagation(); }
  function configured() { return Number(settings[modeKey()]) || 1; }
  function onClick(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const b = buttonFrom(event); if (!b) return;
    const v = video(); const current = Number(v?.playbackRate) || configured();
    const step = Math.max(.01,Number(settings.step)||.25);
    const preset = b.classList.contains('ytss-preset') ? Number(b.dataset.speed) : NaN;
    let ok = false;
    if (Number.isFinite(preset)) ok = setRate(preset);
    else if (b.id === 'ytss-minus' || b.id === 'ytss-quick-down') ok = setRate(current-step);
    else if (b.id === 'ytss-plus' || b.id === 'ytss-quick-up') ok = setRate(current+step);
    else if (b.id === 'ytss-speed' || b.id === 'ytss-hover-speed') ok = setRate(Math.abs(current-1)<.01 ? configured() : 1,{persistRate:false});
    if (ok) stop(event);
  }
  function onPointerDown(event) {
    if (event.button !== 0) return;
    const b = buttonFrom(event); if (!b || !['ytss-quick-boost','ytss-quick-pause'].includes(b.id)) return;
    const v = video(); if (!v) return;
    const restore = Number(v.playbackRate) || configured();
    const target = b.id === 'ytss-quick-pause' ? 1 : Number(settings.boostSpeed)||3;
    if (!setRate(target,{persistRate:false})) return;
    held = { pointerId:event.pointerId, restore, button:b };
    b.classList.add('ytss-held'); stop(event);
  }
  function onPointerUp(event) {
    if (!held || (event.pointerId !== undefined && held.pointerId !== event.pointerId)) return;
    const x = held; held = null; x.button?.classList.remove('ytss-held');
    setRate(x.restore,{persistRate:false}); stop(event);
  }

  window.addEventListener('click',onClick,true);
  window.addEventListener('pointerdown',onPointerDown,true);
  window.addEventListener('pointerup',onPointerUp,true);
  window.addEventListener('pointercancel',onPointerUp,true);
  function onStorageChanged(changes,area) {
    if (!alive || area !== 'local') return;
    for (const key of Object.keys(DEFAULTS)) if (changes[key]) settings[key] = changes[key].newValue;
    if (changes.accentColor) applyPalette();
  }
  chrome.storage.onChanged.addListener(onStorageChanged);
  chrome.storage.local.get(DEFAULTS).then(v => { if(!alive)return; settings={...DEFAULTS,...v}; applyPalette(); render(video()?.playbackRate || configured()); }).catch(()=>{});
  const observer = new MutationObserver(() => { if(alive) applyPalette(); });
  observer.observe(document.documentElement,{subtree:true,childList:true});
  globalThis[KEY] = { dispose() {
    if (!alive) return; alive=false;
    window.removeEventListener('click',onClick,true);
    window.removeEventListener('pointerdown',onPointerDown,true);
    window.removeEventListener('pointerup',onPointerUp,true);
    window.removeEventListener('pointercancel',onPointerUp,true);
    try { chrome.storage.onChanged.removeListener(onStorageChanged); } catch {}
    observer.disconnect();
  }};
})();
