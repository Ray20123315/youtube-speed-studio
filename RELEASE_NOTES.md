# youtube-speed-studio 1.0.4

Accent-completion and runtime-context/control reliability release.

Highlights:
- Completes the shared Accent token layer across Popup, Options and Download Studio. Amber/Gold and every other Accent preset now drive download hero glow, status text, summary cards, downloadable rows, info chips, selected choices, notices, badges, borders and focus states instead of leaving legacy Violet colors behind.
- Keeps Shorts, Danger, Error and non-accent progress semantics independent from the selected Accent color.
- Fixes recovery context composition: MAIN-world `page-context.js` data is treated as supplemental identity data and merged with canonical URL-derived `platform`, `pageType`, `mode`, `href` and `videoId` fields. A correctly carried YouTube source tab is no longer rejected just because the supplemental object lacks runtime contract fields.
- Makes recovery control interception current-context-first and success-only. `−`, `+`, presets, center-speed and hold controls are captured before stale document listeners, but an unsuccessful recovery action no longer swallows the valid full-content handler.
- Existing `sourceTabId` / `sourceUrl` handoff, signed-media-URL privacy, adaptive local MP4 muxing and viewport clamping remain intact.
- Locale scope is unchanged and explicit: Traditional Chinese, Simplified Chinese and English are complete UI languages; other listed locales intentionally use English fallback until real translation packs are added.

See README.md for installation, permissions, platform support, limitations and security notes.
