# 1.4 verification

These checks cover the 1.4 source release. They are not a guarantee for every Windows configuration or model provider. No installer or personal profile is included in the source publication.

## Independent plugin catalogue

- Published the separate `HansonFeng123/scoreler-plugin-catalog` repository at commit `c044af5`, containing only public catalogue metadata, documentation and a license.
- Refreshed the list through the desktop UI and verified its last-refresh indicator.
- Downloaded and verified the graphing calculator package through the live catalogue in an isolated test profile.
- Verified cached metadata survives restart, failed refresh preserves installed plugins, and refresh never automatically installs a package.
- Verified malformed, oversized and unsafe catalogue responses are rejected.

## Regression checks

- Final checks passed: 47 focused Node tests covering catalogue/store/review, shortcuts/appearance, CLI bridge/install, plugin themes/lifecycle, update rollback/profile preservation and desktop preload boundaries.
- 27 tests across eleven Vitest files passed, covering clipboard image conversion, image input, layout, keyboard selection, terminal rendering, plugin UI, appearance loading, shared-history synchronization and startup guides.
- Backend TypeScript, video bundle and frontend production build passed.
- An isolated real-agent test passed Chinese conversation, image transport, study-file import, calendar tool execution, history resume and history visibility in both desktop and CLI APIs.
- A native pseudoterminal test passed Alt+V bitmap normalization and image sending, Chinese input, arrow-key model/reasoning selection, new conversation, resize and clean terminal exit. This used a synthetic local model, not a private account.
- Existing-profile CLI connectivity reported ChatGPT and other configured providers, with calendar data available.
- Earlier live preview checks completed text, image and read-only tool requests and shared-history synchronization. Authentication was completed by the user.

## Windows identity

- The preview uses its own branded executable and application identity, separate from the installed application.
- A matching preview Start shortcut is registered. The exact obsolete development Electron alias is backed up before retirement; unrelated shortcuts remain untouched.
- Relaunching the preview shortcut retained the existing processes and CLI connection.
- Actual window icon handles and Windows Shell shortcut extraction returned the mascot. A live screenshot showed the correct taskbar mascot.
- The blank icon later recurred. The repair now generates seven native Windows ICO sizes, publishes icon and shortcut files atomically, and avoids rewriting unchanged assets. Windows decoded all seven sizes; repeated icon reads preserved the file modification time.
- The repaired preview was restarted with its existing profile preserved. Shortcut target/icon existence and branded runtime identity passed. The user subsequently confirmed that both the taskbar and Start show the mascot. This is user-supplied visual confirmation; recurrence on other Windows configurations remains a practical limitation.

## Startup toolkit and plugin appearance

- English and Chinese guides cover the CLI, independent plugin catalogue, ChatGPT setup, connection proxy and GitHub update/plugin proxy.
- An isolated native Electron test using the real frontend and backend opened all five guide destinations and checked settings scroll positions. It sent no AI requests.
- The installed graphing calculator and offline translator passed native light-to-dark theme updates, accent updates, input retention and isolation checks. The installed plugin registry was unchanged.
- The embedded graphing calculator passed graph examples, resize, close/detach and blocked-network checks. A regression test covers closing a plugin after its parent was destroyed.
- Only validated appearance colors and mode reach the plugin. Wallpapers, local paths, model settings and credentials are not included. Custom canvas/shadow-DOM plugins may need their own theme adapter.
- Translation model inference and a fresh live ChatGPT authorization were not repeated in this final pass. Earlier user-authorized live checks are distinguished from the synthetic final tests above.

## Privacy and publication

Test profiles, logs, screenshots, installed packages, user settings and credentials are excluded from publication. The source review of 72 changed/new files found no private user/workspace paths, credential patterns or forbidden runtime/profile/binary files; the staged set is checked again before pushing. The release uses the public edition and preserves the separate local free-model edition. No EXE is uploaded.
