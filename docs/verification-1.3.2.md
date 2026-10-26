# Scoreler 1.3.2 — offline translator verification

Verified on Windows with isolated test profiles on 2026-10-26. Translation tests use synthetic example text and the actual bundled neural models, not mocked AI responses or personal study data.

## Translator

- All twelve configuration/tokenizer/model files match the upstream revision-pinned Git or Git LFS hashes. Local SHA-256 hashes are recorded separately. English-to-Chinese revision: `046f55aec303cdee3e0318604406d4df20f1e8ea`; Chinese-to-English revision: `39d480d52a9ea3065a1f117adfe4dbc55de10e6f`.
- The release ZIP is 161,080,352 bytes and includes both quantized models, tokenizer data, Transformers.js 2.17.2, ONNX Runtime 1.14.0 and full licence notices. Model files are package resources, not a giant inline HTML payload; the initial single-HTML draft failed a startup timeout and was replaced before publication.
- Real native embedded-view translations: “Water freezes at zero degrees Celsius.” → “水冻结在零摄氏度。”; “我喜欢学习科学。” → “I like to study science.”; automatic detection “你好。” → “Hello.”.
- Empty/overlong input validation, swap/clear controls and decimal-aware sentence segmentation passed. English and Chinese UI screenshots were rendered and inspected at 1100 px and 680 px without horizontal overflow.
- Requests during translation were only for packaged local models/runtime resources. Execution uses the WASM backend with one CPU thread; no WebGPU/CUDA provider is configured. The plugin has no Node or desktop preload bridge. Closing detaches the embedded view, and no separate user window is created.

## Host and regression

- Production backend/video/frontend build passed.
- Seventeen plugin-store tests passed, including v1 limits, explicit v2 size handling, rejected extra v1 resources, disabled/resource path checks case-colliding filename rejection, ordered ranged downloads, incomplete-range retries and invalid-range rejection.
- Native capability probe passed: v1 cannot compile WASM or fetch resources; v2 can compile WASM and read its own sample resource. Both deny external network and expose neither Node nor the desktop bridge.
- Existing graphing-calculator math cases, native embedded resize/close and isolation regression passed after the format change.

## Live catalogue installation

The actual published GitHub release asset was downloaded through Scoreler’s proxy transport in verified ranges: 161,080,352 bytes. Release owner/uploader checks, final SHA-256, install, retained registration after restart, disable/enable and selected uninstall passed. A separate synthetic history marker was preserved. Native UI progress reports completed bytes; incomplete ranges retry and a failure keeps the previously installed version.

## Scope and limitations

The compact models are useful for short sentences, but can mistranslate specialist terms, names, idioms and ambiguous text. Important output needs human review. Requests are limited to 2,000 characters and split into short sentences/chunks. First-load latency and RAM use depend on the computer. Model and translation state are not retained after leaving the tool. The plugin needs Scoreler 1.3.2 or later; older plugin formats are unchanged.

Upstream attribution and the Apache-2.0, CC-BY-4.0 and MIT licence texts are included in the separate translator repository and its release package. No upstream endorsement or universal security certification is implied. The unrelated pre-existing teaching-entry-agent test failure documented for 1.3 remains outside this change; this is a targeted verification report, not a claim that the whole repository test suite passed.
