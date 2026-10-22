import { describe, expect, it } from "vitest";
import { buildSlashPaletteEntries, slashQueryFromDraft } from "./slash-palette-utils.js";
import type { SlashCommandItem } from "../../api/commands.js";

const APP_ACTIONS = [
	{ action: "new-chat" as const, name: "new", description: "Start a new chat" },
	{ action: "model" as const, name: "model", description: "Switch model" },
];

const COMMANDS: SlashCommandItem[] = [
	{ name: "review", description: "Review code", source: "prompt" },
	{ name: "skill:ppt-creation", description: "Create slides", source: "skill" },
	{ name: "skill:lesson-plan", description: "Plan a lesson", source: "skill" },
	{ name: "todos", description: "List todo items", source: "extension" },
];

describe("slashQueryFromDraft", () => {
	it("opens on a bare slash", () => {
		expect(slashQueryFromDraft("/")).toBe("");
	});

	it("captures the partial query", () => {
		expect(slashQueryFromDraft("/sk")).toBe("sk");
		expect(slashQueryFromDraft("/skill:ppt")).toBe("skill:ppt");
	});

	it("closes once the command takes arguments", () => {
		expect(slashQueryFromDraft("/skill:ppt make slides")).toBeNull();
	});

	it("ignores non-command drafts and slashes mid-text", () => {
		expect(slashQueryFromDraft("")).toBeNull();
		expect(slashQueryFromDraft("hello /world")).toBeNull();
		expect(slashQueryFromDraft(" /new")).toBeNull();
	});
});

describe("buildSlashPaletteEntries", () => {
	it("lists app actions first, then agent commands grouped by source", () => {
		const entries = buildSlashPaletteEntries(APP_ACTIONS, COMMANDS, "");
		expect(entries.map((e) => e.key)).toEqual([
			"app:new-chat",
			"app:model",
			"agent:todos", // extension before prompt before skill
			"agent:review",
			"agent:skill:lesson-plan", // skills sorted by name
			"agent:skill:ppt-creation",
		]);
		expect(entries[0].group).toBe("app");
		expect(entries[2].group).toBe("agent");
	});

	it("filters both groups by substring, case-insensitively", () => {
		const entries = buildSlashPaletteEntries(APP_ACTIONS, COMMANDS, "MO");
		expect(entries.map((e) => e.key)).toEqual(["app:model"]);
	});

	it("matches skill commands by their full name", () => {
		const entries = buildSlashPaletteEntries(APP_ACTIONS, COMMANDS, "skill:");
		expect(entries.map((e) => e.name)).toEqual(["skill:lesson-plan", "skill:ppt-creation"]);
	});

	it("also matches against descriptions (localized queries find English slugs)", () => {
		expect(buildSlashPaletteEntries(APP_ACTIONS, COMMANDS, "slides").map((e) => e.key)).toEqual(["agent:skill:ppt-creation"]);
		expect(buildSlashPaletteEntries(APP_ACTIONS, COMMANDS, "Switch").map((e) => e.key)).toEqual(["app:model"]);
	});

	it("returns an empty list when nothing matches", () => {
		expect(buildSlashPaletteEntries(APP_ACTIONS, COMMANDS, "zzz")).toEqual([]);
	});
});
