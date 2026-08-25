(() => {
  'use strict';
  for (const key of ['__YTSS_ADAPTIVE_CAPTURE_V2_INSTANCE__','__YTSS_CONTROL_FAILSAFE_V2_INSTANCE__']) {
    try { globalThis[key]?.dispose?.(); } catch {}
    try { delete globalThis[key]; } catch { globalThis[key] = null; }
  }
})();
