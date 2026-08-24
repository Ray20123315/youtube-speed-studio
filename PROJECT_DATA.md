# PROJECT_DATA — youtube-speed-studio 1.0.0

Owner: Ray20123315  
Official repository: Ray20123315/youtube-speed-studio  
Release: 1.0.0  
Manifest: 1.0.0  
License: Proprietary No-Derivatives License v1.0

## Architecture
- `providers.js`: platform adapter selection (YouTube / bilibili).
- `page-context.js`: YouTube MAIN-world player/context/download bridge.
- `content.js`: isolated playback controller, floating UI, profiles, position persistence, runtime protocol 7.
- `runtime-client.js`: extension-page runtime discovery, recovery/reinjection using `chrome.scripting`.
- `popup.*`: compact daily controls/update indicator.
- `options.*`: full settings, Download Studio, diagnostics, appearance/language/integrity.
- `ui-components.js`: custom Select/Popover, destructive confirmation modal, toast.
- `i18n.js`: searchable locale catalog; bundled zh-Hant/zh-Hans/en translations with English fallback.
- `mp4-remux*.js`: local fragmented-MP4 remux pipeline.
- `background.js`: GitHub Release checks, toolbar update badge, integrity verification.
- `integrity.json`: generated SHA-256 official-build manifest.

## Privacy boundaries
- signed media URLs are runtime-only and are never written to storage/diagnostics/memory/docs/Git.
- update checks call only the public GitHub Releases API for the official repository.
- no remote executable JS is loaded.
- no DRM/Widevine/paywall bypass.

## Public release policy
- source is publicly visible for auditability but licensed as proprietary source-available, no derivatives without written permission.
- client code cannot be made technically unmodifiable; official-build integrity is tamper-evident, not DRM.
- release workflow creates v1.0.0 once and does not overwrite an existing release.
