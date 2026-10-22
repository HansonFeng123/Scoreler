import type { SlashCommandItem } from "../../api/commands.js";

/**
 * Pure helpers for the composer slash-command palette. Kept free of React so
 * the filtering semantics are unit-testable (mirrors workspace.test.ts style).
 */

export type SlashPaletteAction = "new-chat" | "model" | "profile" | "jobs" | "skills" | "settings";

export interface SlashPaletteEntry {
	key: string;
	/** Text after the leading `/`, e.g. `new` or `skill:ppt-creation`. */
	name: string;
	description?: string;
	group: "app" | "agent";
	/** App actions execute in the UI; agent commands are inserted into the composer. */
	action?: SlashPaletteAction;
}

/** The palette opens only while the draft is a bare `/query` (no whitespace). */
export function slashQueryFromDraft(draft: string): string | null {
	const match = /^\/(\S*)$/.exec(draft);
	return match ? match[1] : null;
}

function matchesQuery(name: string, description: string | undefined, query: string): boolean {
	if (!query) return true;
	const needle = query.toLowerCase();
	return name.toLowerCase().includes(needle) || (description?.toLowerCase().includes(needle) ?? false);
}

/**
 * Build the flat, display-ordered palette entries: app actions first
 * (Codex-style), then agent commands sorted by name within each source group
 * (extension → prompt → skill). Matches against both the command name and
 * its description, so localized queries (e.g. "画像") find English slugs.
 */
export function buildSlashPaletteEntries(
	appActions: Array<{ action: SlashPaletteAction; name: string; description: string }>,
	commands: SlashCommandItem[],
	query: string,
): SlashPaletteEntry[] {
	const entries: SlashPaletteEntry[] = [];
	for (const item of appActions) {
		if (matchesQuery(item.name, item.description, query)) {
			entries.push({ key: `app:${item.action}`, name: item.name, description: item.description, group: "app", action: item.action });
		}
	}
	const sourceOrder: Record<SlashCommandItem["source"], number> = { extension: 0, prompt: 1, skill: 2 };
	const sorted = [...commands].sort((a, b) => sourceOrder[a.source] - sourceOrder[b.source] || a.name.localeCompare(b.name));
	for (const command of sorted) {
		if (matchesQuery(command.name, command.description, query)) {
			entries.push({ key: `agent:${command.name}`, name: command.name, description: command.description, group: "agent" });
		}
	}
	return entries;
}
