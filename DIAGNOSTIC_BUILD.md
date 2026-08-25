# youtube-speed-studio Diagnostic Test Build 1.0.5.2

This branch/build is forensic instrumentation only and is based on the verified 1.0.5.1 diagnostic branch plus a v2 observer/dashboard layer. It is not an official release and must not be promoted to `main` based on diagnostic behavior alone.

The returned 1.0.5.1 bundle proved that the exact YouTube watch tab answered direct runtime/probe calls while Options/Download Studio reported no runtime, but its persisted timeline was empty. 1.0.5.2 therefore changes the evidence pipeline, not production playback/download logic.

## Added in 1.0.5.2

- `debug-v2-content.js`: independent current-context observer for panel hit-testing and forced log flush.
- `debug-ui-v2.js`: Dashboard/embedded-Options default vs preferred discovery trace, exact source-hint comparison, safe runtime summaries, broader computed-style inspection, violet-like element scan, forced tab flush before export.
- `YTSS_DEBUG_FLUSH`, `YTSS_DEBUG_CLEAR`, `YTSS_DEBUG_MARK`, and `YTSS_DEBUG_V2_SNAPSHOT` messages are handled by the v2 observer. `CLEAR` establishes the capture cutoff/marker; older in-memory entries are excluded by the export cutoff even if a stale logger later flushes them.
- Panel clicks are captured by coordinates as well as target ancestry, so an overlay that intercepts a click inside the controller is visible through `elementsFromPoint` and `intendedControls`.
- Exported JSON schema version is 2 and contains a top-level `v2` evidence block that is not collapsed by the older generic sanitizer depth.

Privacy remains local-only: no telemetry/automatic upload; Googlevideo/videoplayback and credential-like data continue to be redacted by the base logger, and v2 summaries include only selected safe runtime fields.
