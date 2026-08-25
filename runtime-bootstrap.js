(() => {
  'use strict';

  // A JavaScript global can survive on an already-open tab after an unpacked
  // extension reload even though the functions inside it close over an invalid
  // extension context. Never trust that stale object as proof that messaging is alive.
  const BRIDGE_KEY = '__YTSS_RECOVERY_BRIDGE__';
  const previous = globalThis[BRIDGE_KEY];
  try { previous?.dispose?.(); } catch {}
  try {
    delete globalThis[BRIDGE_KEY];
  } catch {
    try { globalThis[BRIDGE_KEY] = null; } catch {}
  }

  let version = null;
  try { version = chrome.runtime.getManifest().version; } catch {}
  globalThis.__YTSS_RECOVERY_BOOTSTRAP__ = {
    version,
    at: Date.now(),
    replacedPrevious: Boolean(previous)
  };
})();
