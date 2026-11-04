# Scoreler testing and fixes — 2026-11-04

Tested the current 1.4.2 source checkout in `publication/scoreler-public` on Windows with Node 24.19.0. All stateful checks used temporary profiles, synthetic study records and local model fixtures. The installed application, saved accounts and personal study profile were not replaced. No release was published.

## Reproduced defects and fixes

| Defect | Result after repair | Evidence |
| --- | --- | --- |
| HTTP body decoding split Chinese characters and emoji across network chunks, replacing them with replacement characters. | Decode UTF-8 incrementally without changing the byte limit. | New byte-by-byte Chinese/emoji request regression. |
| A client interrupt during an upload left the body reader pending indefinitely. | Reject interrupted bodies with a client error. | New interrupted-request regression. |
| Queue cancellation rejected an operation even after it had started changing sessions. The caller could receive `session_busy` while the change still completed. | Cancel waiting work only; running operations retain their slot and report their actual result. Failed/cancelled work does not block later operations. | Three queue regressions and all 59 real-server smoke tests. |
| The legacy learning-agent extension registered prerequisite/evidence tools, then filtered and blocked them. Its teaching instructions were also missing. | Permit its explicitly registered learner tools when L1 is enabled and restore the shared teaching instructions. Unrestricted shell/file tools remain blocked. Remove its obsolete second-calendar-edit approval gate to match current direct scheduling. | Real AgentSession test completes prerequisite repair, records evidence, resumes the problem and avoids repeated diagnosis. |
| Closing a cached study store left callers able to retrieve its closed SQLite connection. The learning-agent test also left this handle open on Windows. | Evict the closed store and close its test fixture before cleanup. | Complete suite passes, including Windows teaching-agent cleanup. |
| Student routes accepted non-object JSON bodies and could throw a server error for `null`. | Require object bodies before field access. | HTTP tests for null, arrays, booleans, numbers and strings. |
| Saving a stale mistake edit recreated a record deleted in the meantime. | Require an existing ID for PUT, consistent with event editing. | HTTP regression verifies the record remains deleted. |
| Missing mistake screenshots committed 200 headers before disk access failed, dropping the connection. | Read before sending headers and return a complete 404. | Real HTTP regression reads the error body. |
| Malformed URL escapes, duplicate folder names and invalid appearance settings returned server errors. | Return actionable 400 errors; missing files/folders return 404. | Student HTTP boundary regressions. |
| Corrupt drawing elements or points threw inside the validator; duplicate element IDs were accepted. | Return false for invalid nested values and duplicate IDs. Reject the edit before touching the saved note. | Shared drawing tests and an HTTP preservation regression. |
| The invalid range `bytes=-` returned a partial video response. | Return 416; valid start/end and suffix ranges continue working. | Eight video range cases over real HTTP. |
| Downloading a JPEG poster named it `.mp4`. | Download posters as `.jpg`. | Content-Disposition regression. |

The original complete-suite attempt also exposed restricted-account failures in Windows DPAPI/username lookup and resource contention during a cold Mermaid import. Both credential and Mermaid tests pass in the normal Windows user session. The suite now defaults to four workers to bound concurrent DOM/module transforms. No credential protection was weakened.

## Verification results

- Production build passed: ChatGPT package syntax, backend TypeScript, Remotion bundle, frontend TypeScript and Vite production assets.
- Complete Vitest suite: **177 files passed; 1,049 tests passed; one skipped**. The skipped test verifies POSIX `0600` permissions and intentionally does not run on Windows. This includes the real-server HTTP smoke suite, frontend components, stores, calendar/undo, library, notes, practice, dictation, memory, settings, rendering and request boundaries.
- `npm run test:desktop`: **109 passed**, covering Electron helpers, encrypted mail storage, scoped ChatGPT consent/transport, client authentication/stream handling, CLI installation and authenticated pipes, plugins, archive validation, updater rollback/state, icons, shortcuts and countdown notifications.
- Isolated desktop chat passed with real frontend, backend and preload: two user turns, a note tool call and persisted note, model selection, confirmation preferences, blocked unknown bridge actions, conversation-deletion confirmation and preservation of the note. Composer bounds passed at 1,365, 1,000 and 720 window widths; the narrow-layout screenshot was inspected.
- Isolated dictation/plugin desktop workflow passed: repeated marking, legacy attempt preservation, read-only history, unsent draft restoration, cancelled deletion, scoped confirmed deletion, install/restart/disable/enable/uninstall, embedded plugin isolation and English/Chinese navigation.
- Rebuilt desktop setup navigation passed for CLI, plugins, ChatGPT, provider proxy and update proxy, without AI requests.
- Isolated CLI agent workflow passed: Chinese conversation, image transport, calendar tool execution with shared persistence, history visible in both CLI and desktop APIs, and study-file import. A native Windows pseudoterminal also passed bitmap screenshot paste, Chinese input, keyboard model/reasoning selection, new conversation, resize and clean exit.
- Full study integration passed: local synthetic model tool loops; Markdown/PDF/DOCX import and cited retrieval; structured practice and submitted answers; atomic calendar batches and undo; scoped deletion/draft withdrawal; saved memory across new chats and server restart; persistence of conversation/events/answers; tools-disabled models; vision image transport and history; workspace browsing/uploads; screenshot-only mistakes; cross-origin rejection; and encrypted provider credentials on disk.
- Actual teaching-video generation passed through the agent tool: source reference, Windows narration, local render, poster/lesson access, download and valid/invalid HTTP range playback. `ffprobe` verified H.264 video at 1,280 × 720, AAC audio and an eight-second duration; a full FFmpeg video/audio decode passed.

The first integration image assertion used a tiny PNG fixture rejected by the SDK image decoder. A generated, decodable PNG replaced that fixture; the complete integration passed. This was a test-fixture problem, not a reproduced provider capability defect.

The optional native-PTY verification runner also retained a Windows helper handle after completing its assertions. Its fixture services are now closed before flushing the receipt and ending the standalone runner. The repeated native-PTY run exited with code zero.

## Repeating the checks

Run from this checkout in a normal Windows user session:

```powershell
npm run build
npm test
npm run test:desktop
$env:SCORELER_TEST_VIDEO='1'
npm run test:integration
```

The integration suite uses a local synthetic model and temporary data, without a paid AI request. Video generation additionally requires a usable local Chromium installation/runtime and a matching Windows narration voice.

Detailed local run output is retained in ignored `.test-audit-*.log` files. Synthetic desktop receipts/screenshots are under ignored `runtime/`; synthetic integration artifacts are in the temporary directory printed by its successful result.

## Limits

These results do not establish compatibility with every model, mailbox, website, display or Windows configuration. Live external AI inference, Tavily search, a real IMAP server, school-site sign-in, remote update publication/installation, a newly packaged installer, Office application import, and long-duration load/soak testing were not exercised. Their selected local/mocked regression paths passed where listed above. The locally rebuilt source has the fixes; an already installed copy requires a separate update/package step.

The pre-existing untracked `electron/ui-recovery.cjs` was left untouched.
