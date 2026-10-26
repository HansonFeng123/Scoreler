# Toolbox plugin format (v1)

The application-controlled `plugins.json` is authoritative. Updating Scoreler replaces that catalog; installing plugins never changes it. Search uses catalog name, description, subjects and keywords only. Catalog entries pin the owner/repository, release tag, exact asset URL, version, compatibility and SHA-256. A GitHub release and its asset uploader must match the catalog owner. Redirects are limited to explicit GitHub release-asset hosts and paths. This integrity check is not a code audit or guarantee of safety.

## Package

A flat ZIP contains `manifest.json`, `index.html`, and optionally `LICENSE` and `README.md`. No directories, symlinks, encrypted entries, duplicate names or additional files are accepted. Maximum compressed size is 5 MB and extracted size is 10 MB. All HTML, CSS and JavaScript must be bundled in index.html; dependencies remain in the plugin source repository and are not installed by Scoreler.

Example manifest:

```json
{"id":"unit-converter","owner":"ExampleAuthor","name":"Unit converter","description":"Offline length conversion","version":"1.0.0","scoreler":{"min":"1.3.0","max":"1.99.99"},"permissions":[],"entry":"index.html","apiVersion":1}
```

IDs and version strings are validated; unknown fields and any nonempty permission list are rejected. A package must match its catalog identity/version/checksum when installed from the catalog. Local imports are labeled as local and receive the same archive and compatibility checks. Duplicate installs and downgrades are rejected. Updates stage first and activate the registry atomically; a failure preserves the old registry.

## Tool environment

The only host context is the immutable `window.ScorelerPlugin` object with `apiVersion: 1` and `locale: "en" | "zh-CN"`. No private data or credentials are included. There is no privileged preload, Node integration or plugin IPC. Each launch uses a fresh in-memory Electron session with a sandboxed renderer and restrictive CSP. Network requests, external navigation, new windows, downloads and permission grants are blocked. Tools must tolerate unavailable localStorage/IndexedDB and browser workers.

This is a browser sandbox, not an operating-system container. A malicious tool could exhaust resources or exploit a browser flaw. Review the source and author before installation. No plugin safety certification is implied.

Disabling closes the selected tool. Uninstall removes its active package and registry entry; study records and other plugins are kept. V1 has no host-managed persistent plugin settings. Closing the tool discards its state. Successful updates may leave older content-addressed package files on disk; they are not active.

The unit-converter example is in `examples/unit-converter`. Build a ZIP with `node scripts/build-plugin-zip.cjs examples/unit-converter output.zip`. Keep the output outside tracked source unless intentionally publishing a plugin release asset.

## Graphing calculator attribution

The separate calculator plugin uses Equation.io, copyright 2026 Anthony Foster, under the MIT license. Its repository retains the upstream source commit, license and offline build adaptations. It is not a Desmos clone or an affiliated Desmos product. Scoreler's bundled catalog points to the approved plugin release assets; the engine source is not bundled with Scoreler itself.

## Download proxy

Plugin downloads follow the **Use saved proxy for GitHub updates** option in Settings. Only the host downloader reads that local address. The optional proxy transport uses system curl, verifies TLS, does not follow redirects itself, and receives no authentication tokens or provider keys. Redirects remain subject to the catalog downloader's host/path checks. Disabling the option uses a dedicated in-memory Electron system-network session. Plugin tool windows remain offline regardless of this setting.
