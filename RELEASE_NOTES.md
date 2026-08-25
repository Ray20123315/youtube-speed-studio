# youtube-speed-studio 1.0.3

Zero-refresh extension-context recovery bugfix release.

Highlights:
- Adds `runtime-bootstrap.js`, which always disposes a surviving recovery bridge object before reinstalling `runtime-recovery.js` in the current extension context. A stale same-version JavaScript global can no longer suppress the fresh `chrome.runtime` receiver after an extension reload.
- Recovery reinjection is now a separate, verified phase: `runtime-client.js` injects bootstrap + recovery first and requires a successful `YTSS_GET_RUNTIME` handshake before attempting optional Provider/full-content reinjection.
- A legacy `content.js` guard or optional full-runtime injection failure can no longer turn a working recovery bridge into a false `reinject-failed` / disconnected state.
- MAIN-world page-context injection failure is recorded separately from isolated-world runtime recovery so button control/runtime messaging can still recover independently; an existing page bridge may continue servicing Download Studio.
- Runtime discovery now preserves explicit failure codes and recovery diagnostics for the exact carried source tab.
- v1.0.2 source-link, source-tab priority, orphan-controller takeover, viewport clamping, accent behavior, and signed-media-URL privacy remain intact.

See README.md for installation, permissions, platform support, limitations and security notes.
