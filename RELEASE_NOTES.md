# youtube-speed-studio 1.0.1

Runtime recovery and accent consistency bugfix release.

Highlights:
- Adds a fresh `runtime-recovery.js` bridge for already-open YouTube/bilibili tabs after an extension reload/update, so Popup/Options can recover without requiring a page refresh.
- Extends handshake polling and supported-tab discovery to avoid falsely reporting a recoverable runtime as disconnected while `content.js` is still initializing.
- Download Studio can use the temporary recovery bridge while the full content runtime reconnects; signed media URLs remain runtime-only and are consumed/removed from the DOM bridge immediately.
- Adds a shared `accent-theme.css` layer so accent presets consistently recolor brand, selected/focus states, badges, Download Studio accent surfaces, and the floating controller while preserving semantic Shorts/danger colors.
- Release and integrity scripts now read the version from `manifest.json`, so future patch releases no longer require hard-coded workflow edits.

See README.md for installation, permissions, platform support, limitations and security notes.
