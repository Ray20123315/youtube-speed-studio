# youtube-speed-studio 1.0.2

Download source handoff and floating-controller interaction/viewport bugfix release.

Highlights:
- Popup now carries the originating YouTube `sourceTabId` and ordinary watch/Shorts page URL into Download Studio; runtime discovery prioritizes that exact source before generic tab scanning.
- Download Studio visibly renders the carried source link so the selected video identity is no longer lost when the Options tab becomes active.
- `runtime-recovery.js` now takes over stale/orphan floating-controller core controls with the current extension context, avoiding dead buttons after extension reload/update.
- The recovery layer remains as a lightweight viewport repair after full runtime handoff, clamping the 236px → 290px Hover expansion inside the visible viewport near right/bottom edges.
- `runtime-recovery.js` is now included in normal content-script startup so viewport repair also applies on fresh page loads, not only emergency reinjection.
- Signed Googlevideo media URLs remain transient runtime-only data and are still consumed/removed from the DOM bridge immediately.

See README.md for installation, permissions, platform support, limitations and security notes.
