import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DedupeStore } from "./dedupe-store.js";

let dir: string;
let file: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "inno-dedupe-"));
	file = join(dir, "dedupe.jsonl");
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("DedupeStore", () => {
	it("treats an unmarked message as new and a marked one as duplicate", () => {
		const store = new DedupeStore(file);
		expect(store.isDuplicate("feishu", "msg-1")).toBe(false);
		store.mark("feishu", "msg-1");
		expect(store.isDuplicate("feishu", "msg-1")).toBe(true);
	});

	it("scopes duplicates per channel", () => {
		const store = new DedupeStore(file);
		store.mark("feishu", "msg-1");
		expect(store.isDuplicate("qq", "msg-1")).toBe(false);
	});

	it("persists marks across instances (process restart)", () => {
		new DedupeStore(file).mark("feishu", "msg-1");
		const reloaded = new DedupeStore(file);
		expect(reloaded.isDuplicate("feishu", "msg-1")).toBe(true);
	});

	it("expires entries past their TTL", () => {
		const store = new DedupeStore(file, /* ttlMs */ -1);
		store.mark("feishu", "msg-1");
		expect(store.isDuplicate("feishu", "msg-1")).toBe(false);
	});

	it("does not load expired entries from disk", () => {
		const past = new Date(Date.now() - 60_000).toISOString();
		writeFileSync(
			file,
			JSON.stringify({ key: "feishu:msg-old", seenAt: past, expiresAt: past }) + "\n",
			"utf-8",
		);
		const store = new DedupeStore(file);
		expect(store.isDuplicate("feishu", "msg-old")).toBe(false);
	});

	it("cleanup() drops expired in-memory entries", () => {
		const store = new DedupeStore(file, /* ttlMs */ -1);
		store.mark("feishu", "msg-1");
		store.cleanup();
		expect(store.isDuplicate("feishu", "msg-1")).toBe(false);
	});

	it("compacts the file on boot when it holds expired lines", () => {
		const past = new Date(Date.now() - 60_000).toISOString();
		const future = new Date(Date.now() + 60_000).toISOString();
		writeFileSync(
			file,
			JSON.stringify({ key: "feishu:msg-old", seenAt: past, expiresAt: past }) + "\n"
				+ JSON.stringify({ key: "feishu:msg-new", seenAt: future, expiresAt: future }) + "\n",
			"utf-8",
		);
		const store = new DedupeStore(file);
		expect(store.isDuplicate("feishu", "msg-new")).toBe(true);
		// The expired line is gone from disk, not just from memory.
		const onDisk = readFileSync(file, "utf-8").trim().split("\n");
		expect(onDisk).toHaveLength(1);
		expect(JSON.parse(onDisk[0]!).key).toBe("feishu:msg-new");
	});

	it("compacts the file on boot when it holds duplicate keys", () => {
		const future = new Date(Date.now() + 60_000).toISOString();
		const line = JSON.stringify({ key: "feishu:msg-1", seenAt: future, expiresAt: future }) + "\n";
		writeFileSync(file, line + line + line, "utf-8");
		new DedupeStore(file);
		expect(readFileSync(file, "utf-8").trim().split("\n")).toHaveLength(1);
	});

	it("leaves an all-live file untouched on boot", () => {
		const store = new DedupeStore(file);
		store.mark("feishu", "msg-1");
		const before = readFileSync(file, "utf-8");
		new DedupeStore(file);
		expect(readFileSync(file, "utf-8")).toBe(before);
	});

	it("compacts in mark() once the file exceeds maxBytes", () => {
		const store = new DedupeStore(file, /* ttlMs */ 24 * 60 * 60 * 1000, /* maxBytes */ 200);
		store.mark("feishu", "msg-live");
		// Bloat the log with expired entries, as months of appends would.
		const past = new Date(Date.now() - 60_000).toISOString();
		const junk = JSON.stringify({ key: "feishu:expired", seenAt: past, expiresAt: past }) + "\n";
		writeFileSync(file, readFileSync(file, "utf-8") + junk.repeat(50), "utf-8");
		// This append crosses maxBytes → compaction drops the expired lines.
		store.mark("feishu", "msg-live-2");
		const lines = readFileSync(file, "utf-8").trim().split("\n");
		expect(lines).toHaveLength(2);
		// Live entries survive compaction: nothing is re-admitted as new.
		const reloaded = new DedupeStore(file);
		expect(reloaded.isDuplicate("feishu", "msg-live")).toBe(true);
		expect(reloaded.isDuplicate("feishu", "msg-live-2")).toBe(true);
	});
});
