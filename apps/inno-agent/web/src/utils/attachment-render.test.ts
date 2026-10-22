import { describe, expect, it } from "vitest";
import { splitContentByBindings } from "./attachment-render.js";
import type { AttachmentBinding } from "../types/chat.js";

function binding(word: string, wordIndex: number, files = 1): AttachmentBinding {
	return {
		word,
		wordIndex,
		files: Array.from({ length: files }, (_, i) => ({ path: `${word}-${i}.pdf`, kind: "pdf" as const, source: "workspace" as const })),
	};
}

describe("splitContentByBindings", () => {
	it("splits at the recorded occurrence of each word", () => {
		const result = splitContentByBindings("先读这份pdf，再总结excel里的数据", [
			binding("pdf", 0),
			binding("excel", 0),
		]);
		expect(result.segments).toEqual([
			{ kind: "text", text: "先读这份" },
			{ kind: "binding", binding: binding("pdf", 0) },
			{ kind: "text", text: "，再总结" },
			{ kind: "binding", binding: binding("excel", 0) },
			{ kind: "text", text: "里的数据" },
		]);
		expect(result.unplaced).toEqual([]);
	});

	it("targets the nth occurrence via wordIndex", () => {
		const result = splitContentByBindings("pdf 和第二个 pdf 不一样", [binding("pdf", 1)]);
		expect(result.segments[0]).toEqual({ kind: "text", text: "pdf 和第二个 " });
		expect(result.segments[1].kind).toBe("binding");
		expect(result.segments[2]).toEqual({ kind: "text", text: " 不一样" });
	});

	it("falls back to unplaced when the occurrence is missing", () => {
		const result = splitContentByBindings("这里没有关键词", [binding("pdf", 3)]);
		expect(result.segments).toEqual([{ kind: "text", text: "这里没有关键词" }]);
		expect(result.unplaced).toEqual([binding("pdf", 3)]);
	});

	it("drops overlapping placements to unplaced instead of corrupting the layout", () => {
		const pdf = binding("pdf", 0);
		const df = binding("df", 0);
		const result = splitContentByBindings("看pdf文件", [pdf, df]);
		expect(result.segments.filter((segment) => segment.kind === "binding")).toHaveLength(1);
		// The later-starting nested binding loses the race and renders after the text.
		expect(result.unplaced).toEqual([df]);
	});

	it("preserves plain text when there are no bindings", () => {
		const result = splitContentByBindings("普通消息", []);
		expect(result.segments).toEqual([{ kind: "text", text: "普通消息" }]);
	});
});
