# Scoreler 1.3 verification

Verified on Windows on 2026-10-26, using isolated synthetic profiles. No personal study profile or credentials are included in this report or its screenshots.

- Production backend, video and web build passed.
- Plugin store, ChatGPT consent and source-updater tests: 24 passed. Archive tests cover unsafe paths, symlinks, duplicate files, incompatible manifests, excessive permissions, corrupt CRCs and invalid directory offsets.
- Real GitHub plugin downloads through a local SOCKS5 proxy passed: install 1.0.0, restart, discover 1.1.0 from the replacement catalog, reject a damaged update while preserving 1.0.0, update to 1.1.0, disable/enable and uninstall only the selected package. An unrelated plugin and a synthetic history marker remained intact.
- Electron sandbox checks passed: no Node, process, desktop bridge, local storage, file access or outbound fetch; the network probe received zero requests. Plotting checks covered sliders, implicit curves, inequalities, piecewise and parametric expressions and derivatives. The updated calculator's English/Chinese preset and regression flows passed.
- Actual frontend/backend/preload verification passed for dictation folders, legacy plus new answer history, read-only historical review, draft preservation, cancellation and confirmed deletion. Local plugin ZIP review, installation, restart, enable/disable and uninstall also passed.
- Full application regression run: 164 test files passed, 1 failed; 997 tests passed, 1 failed and 1 skipped. The failing legacy teaching-entry integration expects prerequisite/evidence tools that the current Scoreler extension does not register. Running the unchanged test against the previous 1.2.2 source reproduces that failure; it is not a new plugin regression. Windows cleanup of its SQLite-backed temporary profile also reports EPERM. This release does not restore those retired teaching tools or hide the failing test.

Limits: the calculator uses Equation.io syntax and is not fully Desmos-compatible. Plugin state lasts only until its window closes. The sandbox is browser isolation, not an OS container or a guarantee against browser vulnerabilities or resource exhaustion. Tests do not certify every third-party plugin. This release's ChatGPT checks use synthetic responses, not a fresh live-account authorization.
