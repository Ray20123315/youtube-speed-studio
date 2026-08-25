(() => {
  'use strict';
  try { globalThis.YTSSDebug?.flush?.(); } catch {}
  try { delete globalThis.YTSSDebug; } catch {
    try { globalThis.YTSSDebug = undefined; } catch {}
  }
  globalThis.__YTSS_DEBUG_BOOTSTRAP_AT__ = Date.now();
})();
