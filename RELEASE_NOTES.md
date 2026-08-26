# youtube-speed-studio 1.0.5.12

Cryptographic anti-tamper and controlled-test-access release.

Highlights:
- Adds an RSA-3072 / SHA-256 signed `integrity-lock.json` covering every file shipped in the extension package except the signed manifest itself.
- Pins the public verification key in the extension. The corresponding private signing credential is deliberately kept offline and is not stored in GitHub, the extension ZIP, diagnostics, project memory, or release automation.
- Starts fail-closed: the toolbar popup points to the TAMPER LOCK page until the signed package is verified. Popup/Options UI and page controls remain blocked while verification is pending or locked.
- Operational background listeners are registered only after signed-integrity verification succeeds. Tamper state is re-checked every minute.
- A detected tamper event creates a persistent authorization-counter latch. Restoring the same build is not enough; a later authorized build must carry a higher signed counter.
- Release CI verifies the signed manifest before packaging and refuses to package an offline AI-change authorization credential or an actual PEM private key.
- Keeps the Download Studio test-access gate and the temporarily locked quick-preset buttons from 1.0.5.11.

Security boundary: a fully editable unpacked browser extension cannot be made mathematically impossible to rewrite. This release provides a pinned public trust anchor, signed official-build identity, fail-closed behavior, and an offline authorization barrier for minting future accepted builds.
