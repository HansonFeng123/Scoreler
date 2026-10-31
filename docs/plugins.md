# Toolbox plugin formats

The independent [Scoreler plugin catalog](https://github.com/HansonFeng123/scoreler-plugin-catalog) publishes `plugins.json` on its `main` branch. From Scoreler 1.4, Toolbox > Plugins > Refresh plugin list fetches that fixed public source without updating the application. The entire response is limited to 1 MiB, validated against the supported schema, and atomically cached in the local plugin directory. Invalid metadata, oversized responses, redirects and network failures preserve the last valid list and all installed packages. A missing or invalid cache falls back to the bundled `plugins.json`; listing installed tools never requires a network request. Refreshing only changes discovery and available-update metadata. Package installation and updates remain explicit, reviewed actions. Plugins cannot replace the catalog or choose a catalog URL. Search uses catalog name, description, subjects and keywords only. Catalog entries pin the owner/repository, release tag, exact asset URL, version, compatibility and SHA-256. A GitHub release and its asset uploader must match the catalog owner. Redirects are limited to explicit GitHub release-asset hosts and paths. This integrity check is not a code audit or guarantee of safety.

## Package

A flat ZIP contains `manifest.json`, `index.html`, and optionally `LICENSE` and `README.md`. No directories, symlinks, encrypted entries or duplicate names (including case collisions) are accepted. V1 accepts only those four files. Format v1 keeps its maximum compressed size of 5 MB and extracted size of 10 MB. From Scoreler 1.3.2, format v2 (`apiVersion: 2`) permits self-contained WebAssembly tools up to 256 MB compressed and 384 MB extracted. V2 also permits flat `asset-*.json`, `.js`, `.wasm`, `.onnx` and `.txt` resources within the same package (up to 30 total entries). Directories, native libraries and executables remain forbidden. Resources are read only from that plugin’s package and served through its isolated session; no cross-plugin or external fetch is allowed. V2 allows same-package scripts and fetch plus CSP `wasm-unsafe-eval`; external network, workers, filesystem, Node, host data and permissions remain unavailable. The opaque sandbox origin and denied storage/permissions are retained. Catalogue entries opt into v2 explicitly with `apiVersion: 2`. Large downloads are bounded to 15 minutes. V1 bundles HTML, CSS and JavaScript in index.html. V2 may use the allowed flat asset files; no npm dependencies or native libraries are installed by Scoreler. Large v2 packages use bounded byte ranges with retries, verified Content-Range headers and a final package checksum; the UI displays downloaded bytes.

Example manifest:

```json
{"id":"unit-converter","owner":"ExampleAuthor","name":"Unit converter","description":"Offline length conversion","version":"1.0.0","scoreler":{"min":"1.3.0","max":"1.99.99"},"permissions":[],"entry":"index.html","apiVersion":1}
```

IDs and version strings are validated; unknown fields and any nonempty permission list are rejected. A package must match its catalog identity/version/checksum when installed from the catalog. Local imports are labeled as local and receive the same archive and compatibility checks. Duplicate installs and downgrades are rejected. Updates stage first and activate the registry atomically; a failure preserves the old registry.

## Tool environment

From Scoreler 1.3.1, enabled installed plugins have cards in Toolbox and open in a main-process-owned WebContentsView inside the main window. The plugin receives no host preload. Bounds follow the visible tool slot; leaving the tool, reloading, disabling or uninstalling closes its renderer. This does not change the v1 package format.

The host context is the immutable `window.ScorelerPlugin` object with the package `apiVersion` (1 or 2), `locale: "en" | "zh-CN"`, and an appearance-only `theme` getter. No private data or credentials are included. There is no privileged preload, Node integration or plugin IPC. Each launch uses a fresh in-memory Electron session with a sandboxed renderer and restrictive CSP. Network requests, external navigation, new windows, downloads and permission grants are blocked. Tools must tolerate unavailable localStorage/IndexedDB and browser workers.

## Following Scoreler appearance

`ScorelerPlugin.theme` exposes `{version: 1, mode: "light" | "dark", colors: {bg, surface, text, muted, line, accent, onAccent}}`. These are validated solid colors, with a contrasting primary-button label. Wallpaper images, file paths and the rest of the appearance record are never passed to plugins. CSS variables use the `--scoreler-` prefix, for example `--scoreler-accent` and `--scoreler-surface`.

Listen for `window`'s `scoreler-theme-change` event to update a custom canvas or component. Its `detail` contains the new theme, also available from the getter. Theme updates preserve the running view and its input. Host styles adapt standard controls; custom canvas or shadow-DOM content needs a compatible adapter. The existing graphing calculator uses its own light/dark switch to redraw its grid and curves while the host adapts its panels and controls. The existing offline translator follows the host colors directly. Neither package needs to be reinstalled for these host-side adaptations.

This is a browser sandbox, not an operating-system container. A malicious tool could exhaust resources or exploit a browser flaw. Review the source and author before installation. No plugin safety certification is implied.

Disabling closes the selected tool. Uninstall removes its active package and registry entry; study records and other plugins are kept. V1 has no host-managed persistent plugin settings. Closing the tool discards its state. Successful updates may leave older content-addressed package files on disk; they are not active.

The unit-converter example is in `examples/unit-converter`. Build a ZIP with `node scripts/build-plugin-zip.cjs examples/unit-converter output.zip`. Keep the output outside tracked source unless intentionally publishing a plugin release asset.

## Graphing calculator attribution

The separate calculator plugin uses Equation.io, copyright 2026 Anthony Foster, under the MIT license. Its repository retains the upstream source commit, license and offline build adaptations. It is not a Desmos clone or an affiliated Desmos product. Scoreler's bundled catalog points to the approved plugin release assets; the engine source is not bundled with Scoreler itself.

## Download proxy

Catalog refreshes and plugin downloads follow the **Use saved proxy for GitHub updates** option in Settings. Only the host downloader reads that local address. The optional proxy transport uses system curl, verifies TLS, does not follow redirects itself, and receives no authentication tokens or provider keys. Redirects remain subject to the catalog downloader's host/path checks. Disabling the option uses a dedicated in-memory Electron system-network session. Plugin tool windows remain offline regardless of this setting.
