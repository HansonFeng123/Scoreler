/**
 * MCP (Model Context Protocol) integration via the `pi-mcp-adapter` package.
 *
 * Two pieces:
 * 1. `loadMcpAdapterExtension` — conditionally loads the adapter as a PI
 *    extension factory. The package ships TypeScript source only, so loading
 *    goes through jiti — the same mechanism pi-runner already uses for
 *    pi-sandbox. Any failure degrades to a warning; MCP must never break boot.
 * 2. `createMcpStatusExtension` — a tiny always-on extension that bridges the
 *    adapter's event-bus status snapshots into a module-level store, consumed
 *    by the HTTP layer (`GET /api/mcp`) to show live server status in the UI.
 *
 * Server definitions live in the managed file `<configDir>/mcp-adapter.json` (written
 * by `src/mcp/mcp-config-store.ts`); the adapter additionally merges the
 * standard shared locations (`.mcp.json`, `~/.config/mcp/mcp.json`, …).
 *
 * The file is named `mcp-adapter.json` (pi-mcp-adapter ≥3.0 convention), NOT
 * `mcp.json`: pi ≥0.99's built-in MCP extension reads `<agentDir>/mcp.json`,
 * and inno's agentDir IS configDir — if the managed file kept the old name,
 * pi's built-in MCP (auto-loaded by `main()` in CLI mode) would start those
 * servers even when inno's `mcp.enabled` is false, and would double-start
 * them alongside the adapter.
 */
import { join } from "node:path";
import type { ExtensionAPI, ExtensionFactory } from "@earendil-works/pi-coding-agent";
import type { InnoConfig } from "../config.js";
import { logger } from "../logger.js";
import type { RuntimePaths } from "../runtime.js";

const mcpLogger = logger.child({ module: "mcp" });

/** Event channel the adapter publishes its versioned status snapshots on. */
export const MCP_STATUS_EVENT = "pi-mcp-adapter/status/v1";

// Local mirror of pi-mcp-adapter's McpStatusSnapshot. Duplicated deliberately:
// the adapter's type surface is TS-source-only and this file must compile with
// the repo's plain tsc setup.
export type McpServerRuntimeStatus =
	| "connected"
	| "cached"
	| "failed"
	| "needs-auth"
	| "not-connected"
	| "disabled";

export interface McpServerStatus {
	name: string;
	status: McpServerRuntimeStatus;
	toolCount: number;
	resourceCount?: number;
	failedAgoSeconds?: number;
	disabled: boolean;
}

export interface McpStatusSnapshot {
	version: number;
	servers: McpServerStatus[];
	totalTools: number;
	totalResources: number;
	connectedCount: number;
	disabledCount: number;
}

let lastSnapshot: McpStatusSnapshot | null = null;
let adapterLoaded = false;

/** Latest status snapshot published by the adapter, or null when none yet. */
export function getMcpStatusSnapshot(): McpStatusSnapshot | null {
	return lastSnapshot;
}

/** Whether the adapter extension was successfully loaded at boot. */
export function isMcpAdapterLoaded(): boolean {
	return adapterLoaded;
}

/** Managed MCP config file the adapter is pointed at (`<configDir>/mcp-adapter.json`). */
export function getManagedMcpConfigPath(paths: RuntimePaths): string {
	return join(paths.configDir, "mcp-adapter.json");
}

/**
 * Extension bridging the adapter's status event bus into the module-level
 * snapshot consumed by the HTTP layer. Safe to register unconditionally — when
 * the adapter isn't loaded the event simply never fires.
 */
export function createMcpStatusExtension(): ExtensionFactory {
	return (pi: ExtensionAPI) => {
		pi.events.on(MCP_STATUS_EVENT, (data) => {
			try {
				const snapshot = data as McpStatusSnapshot | null;
				lastSnapshot = snapshot && Array.isArray(snapshot.servers) ? snapshot : null;
			} catch (err) {
				mcpLogger.warn({ err }, "failed to handle MCP status snapshot");
			}
		});
	};
}

type CreateMcpAdapter = (options: { configPath: string }) => ExtensionFactory;

/**
 * Load the pi-mcp-adapter extension when MCP is enabled in config. Returns
 * null (with a logged warning) when disabled or when loading fails.
 */
export async function loadMcpAdapterExtension(
	config: InnoConfig,
	paths: RuntimePaths,
): Promise<ExtensionFactory | null> {
	if (config.mcp?.enabled !== true) return null;
	const configPath = getManagedMcpConfigPath(paths);
	try {
		const { createJiti } = await import("jiti/static");
		const jiti = createJiti(import.meta.url, { moduleCache: false });
		const mod = (await jiti.import("pi-mcp-adapter")) as { createMcpAdapter?: CreateMcpAdapter };
		if (typeof mod.createMcpAdapter !== "function") {
			throw new Error("createMcpAdapter export not found in pi-mcp-adapter");
		}
		adapterLoaded = true;
		mcpLogger.info({ configPath }, "MCP adapter extension loaded");
		return mod.createMcpAdapter({ configPath });
	} catch (err) {
		// pi-mcp-adapter ships TypeScript source only (exports → ./index.ts) and
		// is loaded through jiti, so a new upstream version can break loading at
		// any time — the dependency is pinned in package.json for that reason.
		mcpLogger.warn(
			{ err },
			"MCP enabled but pi-mcp-adapter failed to load — continuing without MCP. " +
			"If pi-mcp-adapter was just upgraded, its TS-source entry point may have changed; it is pinned in package.json for this reason.",
		);
		return null;
	}
}
