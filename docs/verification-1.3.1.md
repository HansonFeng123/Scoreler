# Scoreler 1.3.1 verification

Checked on Windows on 2026-10-26 with isolated synthetic profiles; personal histories and credentials were not copied into tests.

- Production backend/video/frontend build passed.
- 18 focused tests passed: dictation marking preferences and validation/history, UI submission and read-only history, subject folders and Toolbox controls.
- Real frontend/backend/preload desktop flow passed with synthetic model responses: grading instructions reach submitted history, legacy attempts and drafts survive, selected deletion preserves another exercise, subject input/save controls align, plugin installation/restart/disable/enable/uninstall work.
- Installed plugin card opens in the main window with exactly one BrowserWindow. Returning to All tools detaches the view. Host bridge is unavailable in the plugin.
- Graph calculator ran as a WebContentsView. Multiple expressions, sliders, implicit equations, inequalities, piecewise/parametric curves and derivatives passed its math-state checks. Resize and close/detach passed.
- Embedded isolation probe: no Node/process/host bridge/RTC; local storage, filesystem and network fetch denied; zero requests reached the synthetic network endpoint. Sandbox/context isolation remain enabled.
- Visually inspected fresh software-painted desktop screenshots of subject navigation, aligned subject form, grading instructions beside correction, and installed Toolbox card. Hidden native-view capture is unsupported in this environment; graph validation used live renderer state rather than claiming a composite graph screenshot passed.

Model grading quality is still model-dependent. These checks use a synthetic model, not a new live OpenAI request. Tool state remains in memory and is discarded on leaving the tool. This targeted update does not claim the unrelated pre-existing teaching-entry-agent test failure documented for 1.3 is resolved.
