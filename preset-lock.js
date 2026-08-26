(() => {
  'use strict';
  const KEY = '__YTSS_PRESET_FEATURE_LOCK_V1__';
  try { globalThis[KEY]?.dispose?.(); } catch {}

  const MESSAGE = '快速倍速功能暫時鎖定，待修復完成後重新開放。';
  let observer = null;
  let alive = true;

  function applyLock(root = document) {
    if (!alive) return;
    const panel = document.getElementById('ytss-panel');
    if (!panel) return;
    panel.querySelectorAll('.ytss-preset').forEach(button => {
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
      button.dataset.ytssFeatureLocked = '1';
      button.title = MESSAGE;
      button.style.cursor = 'not-allowed';
      button.style.opacity = '.56';
      button.style.filter = 'saturate(.7)';
    });
    const wrap = panel.querySelector('#ytss-presets');
    if (wrap && !wrap.querySelector('.ytss-preset-lock-note')) {
      const note = document.createElement('span');
      note.className = 'ytss-preset-lock-note';
      note.textContent = '快速倍速暫時鎖定';
      note.style.cssText = 'display:block;width:100%;margin-top:5px;text-align:center;font-size:9px;line-height:1.35;color:var(--ytss-muted,#8f93a1);';
      wrap.appendChild(note);
    }
  }

  function intercept(event) {
    if (!alive) return;
    const target = event.target instanceof Element ? event.target.closest('#ytss-panel .ytss-preset') : null;
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    applyLock();
  }

  document.addEventListener('click', intercept, true);
  document.addEventListener('pointerdown', intercept, true);
  observer = new MutationObserver(() => applyLock());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  applyLock();

  globalThis[KEY] = {
    dispose() {
      alive = false;
      observer?.disconnect();
      document.removeEventListener('click', intercept, true);
      document.removeEventListener('pointerdown', intercept, true);
    }
  };
})();
