import { describe, expect, it } from "vitest";
import type { SmartInputRule } from "../../../types/settings.js";
import {
	analyzeKeywords,
	buildOutgoing,
	slotChar,
	TOKEN_RE,
	tokenRegexFor,
	type OutgoingFile,
	type OutgoingSlot,
} from "./rules.js";
import { nameMatchesRule, sameRuleFormat } from "./kinds.js";

function rule(keyword: string, extensions = [".pdf"]): SmartInputRule {
	return { id: `r-${keyword}`, isPreset: false, keyword, extensions, allExtensions: false, excludeExtensions: [], enabled: true };
}

describe("analyzeKeywords", () => {
	it("finds literal keywords and flags demonstrative references", () => {
		const { kws } = analyzeKeywords("请读这份pdf和上一份 pdf", [rule("pdf")], new Set());
		expect(kws).toHaveLength(2);
		expect(kws[0]).toMatchObject({ start: 4, end: 7, word: "pdf", hi: true });
		expect(kws[1]).toMatchObject({ start: 12, end: 15, word: "pdf", hi: false });
	});

	it("finds Latin keywords when they touch adjacent text", () => {
		const { kws } = analyzeKeywords("pdfx 与 ddpdf对", [rule("pdf")], new Set());
		expect(kws).toHaveLength(2);
		expect(kws.map((hit) => hit.word)).toEqual(["pdf", "pdf"]);
	});

	it("matches CJK keywords as substrings and skips hits inside tokens", () => {
		const token = `{${slotChar(1)}}\u00A0\u00A0`;
		const { kws, slots } = analyzeKeywords(`看${token}和图片`, [rule("图片")], new Set([1]));
		expect(slots).toEqual([{ start: 1, end: 1 + token.length, slotId: 1 }]);
		expect(kws).toHaveLength(1);
		expect(kws[0].word).toBe("图片");
	});

	it("keeps only the longest overlapping keyword", () => {
		const systemFile = { ...rule("文件"), isPreset: true };
		const customFolder = rule("文件夹");
		const { kws } = analyzeKeywords("文件夹", [systemFile, customFolder], new Set());
		expect(kws).toHaveLength(1);
		expect(kws[0]).toMatchObject({ start: 0, end: 3, word: "文件夹", rule: customFolder });
	});

	it("ignores disabled rules", () => {
		const disabled = { ...rule("pdf"), enabled: false };
		expect(analyzeKeywords("看pdf", [disabled], new Set()).kws).toHaveLength(0);
	});

	it("marks 技能 and skill as Agent picker keywords without nesting slash commands", () => {
		const { kws } = analyzeKeywords(
			"/skill:existing 技能 skill",
			[rule("pdf")],
			new Set(),
			["技能", "skill"],
		);
		expect(kws.map((hit) => ({ word: hit.word, kind: hit.kind }))).toEqual([
			{ word: "技能", kind: "agent" },
			{ word: "skill", kind: "agent" },
		]);
	});
});

describe("buildOutgoing", () => {
	const file = (uid: number, state: OutgoingFile["state"], over: Partial<OutgoingFile> = {}): OutgoingFile => ({
		uid,
		name: over.name ?? `f${uid}.pdf`,
		path: over.path ?? over.name ?? `f${uid}.pdf`,
		state,
		...over,
	});

	it("restores tokens to words and computes word occurrence indices", () => {
		const token = `{${slotChar(7)}}\u00A0`;
		const value = `先说pdf再说，${token}`;
		const slots = new Map<number, OutgoingSlot>([
			[7, { word: "pdf", files: [file(1, "workspace")] }],
		]);
		const result = buildOutgoing(value, slots);
		expect(result.visibleText).toBe("先说pdf再说，pdf");
		// The restored token is the 2nd "pdf" occurrence.
		expect(result.readyBindings).toEqual([
			{ word: "pdf", wordIndex: 1, files: [{ uid: 1, name: "f1.pdf", path: "f1.pdf" }] },
		]);
		expect(result.pendingFiles).toEqual([]);
		expect(result.skippedCount).toBe(0);
	});

	it("separates pending local files and skipped uploads per slot", () => {
		const token = `{${slotChar(3)}}`;
		const slots = new Map<number, OutgoingSlot>([
			[3, {
				word: "word",
				files: [
					file(1, "workspace"),
					file(2, "local", { name: "local.docx", path: "local.docx", file: new File(["x"], "local.docx") }),
					file(3, "uploading"),
					file(4, "failed"),
				],
			}],
		]);
		const result = buildOutgoing(token, slots);
		expect(result.visibleText).toBe("word");
		expect(result.readyBindings[0].files).toHaveLength(1);
		expect(result.pendingFiles).toHaveLength(1);
		expect(result.pendingFiles[0].file.name).toBe("local.docx");
		expect(result.skippedCount).toBe(2);
	});

	it("leaves plain text untouched when no tokens exist", () => {
		const result = buildOutgoing("普通消息 pdf", new Map());
		expect(result.visibleText).toBe("普通消息 pdf");
		expect(result.readyBindings).toEqual([]);
	});
});

describe("token helpers", () => {
	it("round-trips slot ids through token chars", () => {
		const token = `{${slotChar(42)}}\u00A0\u00A0`;
		const match = token.match(TOKEN_RE)!;
		expect(match[0]).toBe(token);
		const withTypedSpace = `${token} `;
		expect(withTypedSpace.match(TOKEN_RE)![0]).toBe(token);
		const again = `prefix ${token} suffix`;
		expect(tokenRegexFor(42).test(again)).toBe(true);
		expect(tokenRegexFor(43).test(again)).toBe(false);
	});
});

describe("file format rule matching", () => {
	it("treats normalized equivalent format lists as merge-compatible", () => {
		expect(sameRuleFormat(
			rule("pdf-a", [".PDF", ".pdf"]),
			rule("pdf-b", ["pdf"]),
		)).toBe(true);
		expect(sameRuleFormat(rule("doc", [".doc"]), rule("docx", [".docx"]))).toBe(false);
		expect(sameRuleFormat(
			{ ...rule("any-a", []), allExtensions: true, excludeExtensions: ["tmp"] },
			{ ...rule("any-b", []), allExtensions: true, excludeExtensions: [".tmp"] },
		)).toBe(true);
	});

	it("accepts every format when all-formats mode is enabled", () => {
		const all = { ...rule("any", []), allExtensions: true };
		expect(nameMatchesRule("notes.txt", all)).toBe(true);
		expect(nameMatchesRule("archive.custom", all)).toBe(true);
		expect(nameMatchesRule("README", all)).toBe(true);
	});

	it("applies exclusions after the allow-list or all-formats check", () => {
		const all = { ...rule("any", []), allExtensions: true, excludeExtensions: [".tmp", "bin"] };
		expect(nameMatchesRule("notes.txt", all)).toBe(true);
		expect(nameMatchesRule("cache.tmp", all)).toBe(false);
		expect(nameMatchesRule("tool.bin", all)).toBe(false);

		const limited = { ...rule("docs", [".pdf", ".docx"]), excludeExtensions: [".pdf"] };
		expect(nameMatchesRule("brief.docx", limited)).toBe(true);
		expect(nameMatchesRule("brief.pdf", limited)).toBe(false);
	});

	it("treats a preset rule as all-formats when all-formats mode is on", () => {
		const preset = { ...rule("pdf", []), isPreset: true, allExtensions: true };
		expect(nameMatchesRule("notes.txt", preset)).toBe(true);
	});
});
