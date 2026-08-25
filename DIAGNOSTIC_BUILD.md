# youtube-speed-studio Diagnostic Test Build 1.0.5.1

This branch/build is for forensic evidence collection only. It is not an official release and must not be promoted to `main` based on diagnostic behavior alone.

## What it records locally

- Content/extension-page `error` and `unhandledrejection` events.
- Floating controller pointer/click capture and bubble reachability.
- Target element state, `pointer-events`, `disabled`, hit-test stack (`elementsFromPoint`).
- Active video `playbackRate` before/after a controller click.
- Floating panel `data-accent` and computed representative styles.
- Exact YouTube/bilibili tab direct debug-message reachability.
- Normal `YTSS_GET_RUNTIME` reachability and `YTSSRuntimeClient.probe()` result.
- Hidden same-origin snapshots of Popup and Options/Download Studio visible status text and computed accent styles.

## Privacy / retention

- Logs remain in `chrome.storage.local` until manually cleared or automatically aged out.
- Per-context ring buffer: 260 entries.
- At most 18 recent sessions, 24-hour TTL.
- Signed `googlevideo.com/videoplayback` URLs are redacted before storage/export.
- Keys/strings resembling cookies, Authorization, signatures, tokens, cipher or credentials are redacted.
- Nothing is automatically uploaded. Export happens only when the user presses **Export Support Bundle JSON**.
- The dashboard programmatically injects `debug-bootstrap.js` + `debug-log.js` into already-open supported tabs when the diagnostic receiver is absent, so extension reload testing does not require refreshing the video tab first.
- **Clear and start new capture** stores a capture cutoff timestamp; exported support bundles discard older entries even if an orphan logger later re-flushes stale in-memory data.

## Test flow

1. Load this diagnostic unpacked extension.
2. Open a YouTube video and the diagnostic popup.
3. Press **Clear and start new capture**.
4. Reproduce all known issues: preset buttons, `−/+`, Download Studio connection/rescan, Amber/Gold accent leftovers.
5. Return to the diagnostic popup and press **Export Support Bundle JSON**.
6. Upload the exported JSON to ChatGPT.
