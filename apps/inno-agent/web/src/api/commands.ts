import { apiFetch } from "./client.js";

/** Slash command the agent session can dispatch or expand (see GET /api/commands). */
export interface SlashCommandItem {
	/** Command name without the leading slash. Skills use the `skill:<name>` form. */
	name: string;
	description?: string;
	source: "extension" | "prompt" | "skill";
	/** Extension commands that run headless (Inno's own); plugin TUI-overlay commands omit this. */
	webSafe?: boolean;
}

export async function fetchSlashCommands(): Promise<SlashCommandItem[]> {
	const res = await apiFetch<{ commands?: SlashCommandItem[] }>("/api/commands");
	return res.commands ?? [];
}
