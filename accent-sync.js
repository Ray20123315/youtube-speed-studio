(() => {
  'use strict';
  const KEY = '__YTSS_ACCENT_SYNC_1057__';
  try { globalThis[KEY]?.dispose?.(); } catch {}

  const DEFAULTS = { accentColor: 'violet' };
  const PALETTES = {
    violet: ['#7658ff', '#9a83ff'],
    blue: ['#3478f6', '#64a2ff'],
    cyan: ['#00a7c7', '#54d6e8'],
    green: ['#1f9d68', '#55c998'],
    amber: ['#c88713', '#f0b84e'],
    orange: ['#e66a2c', '#ff9a58'],
    rose: ['#e04e73', '#ff86a4'],
    magenta: ['#b84ad8', '#e685ff']
  };

  let alive = true;
  let accent = 'violet';
  const rgba = (hex, alpha) => {
    const value = hex.replace('#', '');
    return `rgba(${parseInt(value.slice(0, 2), 16)},${parseInt(value.slice(2, 4), 16)},${parseInt(value.slice(4, 6), 16)},${alpha})`;
  };

  function apply() {
    if (!alive) return;
    const panel = document.getElementById('ytss-panel');
    if (!panel) return;
    const key = PALETTES[accent] ? accent : 'violet';
    const [primary, secondary] = PALETTES[key];
    panel.dataset.accent = key;
    panel.style.setProperty('--ytss-accent', primary);
    panel.style.setProperty('--ytss-accent-2', secondary);
    panel.style.setProperty('--ytss-card-active', rgba(primary, .72));
    panel.style.setProperty('--ytss-accent-border', rgba(primary, .42));
    panel.style.setProperty('--ytss-accent-shadow', rgba(primary, .28));
  }

  function onStorageChanged(changes, area) {
    if (!alive || area !== 'local' || !changes.accentColor) return;
    accent = changes.accentColor.newValue || 'violet';
    apply();
  }

  chrome.storage.onChanged.addListener(onStorageChanged);
  chrome.storage.local.get(DEFAULTS).then(value => {
    if (!alive) return;
    accent = value.accentColor || 'violet';
    apply();
  }).catch(() => {});

  const observer = new MutationObserver(apply);
  observer.observe(document.documentElement, { subtree: true, childList: true });

  globalThis[KEY] = {
    dispose() {
      if (!alive) return;
      alive = false;
      observer.disconnect();
      try { chrome.storage.onChanged.removeListener(onStorageChanged); } catch {}
    }
  };
})();
