import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncCodemodeDefaultTools } from "./pi-runner.js";

function readSettings(dir: string): Record<string, unknown> {
	return JSON.parse(readFileSync(join(dir, "settings.json"), "utf-8")) as Record<string, unknown>;
}

function writeSettings(dir: string, settings: Record<string, unknown>): void {
	writeFileSync(join(dir, "settings.json"), JSON.stringify(settings), "utf-8");
}

describe("syncCodemodeDefaultTools", () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "inno-codemode-"));
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it("creates defaultTools with +codemode when enabling with no settings file", () => {
		syncCodemodeDefaultTools(dir, true);
		expect(readSettings(dir).defaultTools).toEqual(["+codemode"]);
	});

	it("appends +codemode to an existing adjust-form list", () => {
		writeSettings(dir, { defaultTools: ["+grep", "-write"] });
		syncCodemodeDefaultTools(dir, true);
		expect(readSettings(dir).defaultTools).toEqual(["+grep", "-write", "+codemode"]);
	});

	it("appends plain codemode to a plain-name list (forms cannot mix)", () => {
		writeSettings(dir, { defaultTools: ["read", "bash"] });
		syncCodemodeDefaultTools(dir, true);
		expect(readSettings(dir).defaultTools).toEqual(["read", "bash", "codemode"]);
	});

	it("is a no-op when already active", () => {
		writeSettings(dir, { defaultTools: ["+codemode"] });
		syncCodemodeDefaultTools(dir, true);
		expect(readSettings(dir).defaultTools).toEqual(["+codemode"]);
	});

	it("removes the managed entries when disabling and deletes an emptied key", () => {
		writeSettings(dir, { defaultTools: ["+codemode"], retry: { provider: { timeoutMs: 600000 } } });
		syncCodemodeDefaultTools(dir, false);
		const settings = readSettings(dir);
		expect(settings.defaultTools).toBeUndefined();
		expect(settings.retry).toEqual({ provider: { timeoutMs: 600000 } });
	});

	it("keeps other entries when disabling", () => {
		writeSettings(dir, { defaultTools: ["+grep", "+codemode"] });
		syncCodemodeDefaultTools(dir, false);
		expect(readSettings(dir).defaultTools).toEqual(["+grep"]);
	});

	it("is a no-op when disabling with nothing to remove", () => {
		writeSettings(dir, { defaultTools: ["read"] });
		syncCodemodeDefaultTools(dir, false);
		expect(readSettings(dir).defaultTools).toEqual(["read"]);
	});

	it("recovers from a corrupt settings file", () => {
		writeFileSync(join(dir, "settings.json"), "{ not json", "utf-8");
		syncCodemodeDefaultTools(dir, true);
		expect(readSettings(dir).defaultTools).toEqual(["+codemode"]);
	});

	it("round-trips enable → disable back to a clean file", () => {
		syncCodemodeDefaultTools(dir, true);
		syncCodemodeDefaultTools(dir, false);
		expect(readSettings(dir).defaultTools).toBeUndefined();
	});
});
