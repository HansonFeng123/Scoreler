import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	clearSessionAgentCommands,
	mergeSessionAgentCommands,
	recordSessionAgentCommand,
	resetAgentCommandStoreForTests,
} from "./agent-command-store.js";

describe("Agent command sidecar store", () => {
	let dataDir: string;

	beforeEach(() => {
		dataDir = mkdtempSync(join(tmpdir(), "inno-agent-command-store-"));
		mkdirSync(join(dataDir, "sessions"), { recursive: true });
		resetAgentCommandStoreForTests();
	});

	afterEach(() => {
		rmSync(dataDir, { recursive: true, force: true });
		resetAgentCommandStoreForTests();
	});

	it("restores expanded Agent commands to their original text FIFO", () => {
		recordSessionAgentCommand(dataDir, "s1", {
			commandContent: "/recall",
			expandedContent: "请使用 l3_recall 工具回顾我们之前的对话，总结一下最近学过的重点。",
		});
		recordSessionAgentCommand(dataDir, "s1", {
			commandContent: "/recall 最近学了什么？",
			expandedContent: "请使用 l3_recall 工具检索我们过去的对话，并结合检索结果回答：最近学了什么？",
		});

		const merged = mergeSessionAgentCommands(dataDir, "s1", [
			{ role: "assistant", content: "好的", timestamp: 0 },
			{ role: "user", content: "请使用 l3_recall 工具回顾我们之前的对话，总结一下最近学过的重点。", timestamp: 1 },
			{ role: "assistant", content: "总结如下", timestamp: 2 },
			{ role: "user", content: "请使用 l3_recall 工具检索我们过去的对话，并结合检索结果回答：最近学了什么？", timestamp: 3 },
		]);

		expect(merged[1].content).toBe("/recall");
		expect(merged[3].content).toBe("/recall 最近学了什么？");
		expect(merged[0].content).toBe("好的");
	});

	it("clears metadata for only the deleted session", () => {
		const entry = {
			commandContent: "/wiki",
			expandedContent: "扩展后的 wiki 指令",
		};
		recordSessionAgentCommand(dataDir, "s1", entry);
		recordSessionAgentCommand(dataDir, "s2", entry);
		clearSessionAgentCommands(dataDir, "s1");

		expect(mergeSessionAgentCommands(dataDir, "s1", [
			{ role: "user", content: entry.expandedContent, timestamp: 1 },
		])[0].content).toBe(entry.expandedContent);
		expect(mergeSessionAgentCommands(dataDir, "s2", [
			{ role: "user", content: entry.expandedContent, timestamp: 1 },
		])[0].content).toBe("/wiki");
	});

	it("collapses legacy expanded command text without sidecar metadata", () => {
		const merged = mergeSessionAgentCommands(dataDir, "old-session", [
			{ role: "user", content: "请使用 l3_recall 工具回顾我们之前的对话，总结一下最近学过的重点。", timestamp: 1 },
			{ role: "user", content: "请将以下关于我的信息记录到学习者画像（L1），并简短确认你记住了什么：喜欢用图示学习", timestamp: 2 },
			{ role: "user", content: "普通文本", timestamp: 3 },
		]);

		expect(merged[0].content).toBe("/recall");
		expect(merged[1].content).toBe("/remember 喜欢用图示学习");
		expect(merged[2].content).toBe("普通文本");
	});
});
