import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const completeMock = vi.hoisted(() => vi.fn());

vi.mock("@earendil-works/pi-ai/compat", () => ({ complete: completeMock }));

import { buildAnalysisSystemPrompt, buildChunkSystemPrompt, hashLongSourceText, summarizeContent } from "./summarizer.js";
import { computeWikiSourceBudget } from "./wiki-generator.js";
import { splitSourceIntoSemanticChunks } from "./structural-chunker.js";

const model = {} as never;
const registry = {
	getApiKeyAndHeaders: vi.fn().mockResolvedValue({ ok: true, apiKey: "test-key", headers: {} }),
} as never;
const roots: string[] = [];

afterEach(() => {
	completeMock.mockReset();
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("L2 summarizer", () => {
	it("uses Inno's own analysis and chunk contract", () => {
		const analysis = buildAnalysisSystemPrompt("purpose", "schema", "index");
		const chunk = buildChunkSystemPrompt("purpose", "schema", "index");
		expect(analysis).toContain("## Key Entities");
		expect(analysis).toContain("central or peripheral");
		expect(analysis).toContain("evidence strength");
		expect(analysis).toContain("## Recommendations");
		expect(chunk).toContain("## Chunk Analysis");
		expect(chunk).toContain("## Updated Global Digest");
		expect(chunk).toContain("Return exactly the following two headings");
		expect(analysis.indexOf("## Key Entities")).toBeLessThan(analysis.indexOf("## Key Concepts"));
		expect(analysis.indexOf("## Key Concepts")).toBeLessThan(analysis.indexOf("## Main Arguments & Findings"));
		expect(analysis).not.toContain("You are an expert research analyst. Read the source document");
		expect(chunk).not.toContain("You are analyzing a long source document for a personal wiki");
	});

	it("passes short source content to the configured model unchanged", async () => {
		completeMock.mockResolvedValue({
			stopReason: "stop",
			content: [{ type: "text", text: "## 摘要\n\n结果" }],
		});

		await expect(summarizeContent(model, registry, "标题", "短资料正文")).resolves.toEqual({
			analysis: "## 摘要\n\n结果",
			sourceContext: "短资料正文",
			chunked: false,
		});
		const request = completeMock.mock.calls[0][1];
		expect(request.systemPrompt).toContain("## Key Entities");
		expect(request.messages).toHaveLength(1);
		expect(request.messages[0].role).toBe("user");
		const userPrompt = request.messages[0].content[0].text as string;
		expect(userPrompt).toContain("短资料正文");
		expect(userPrompt).not.toContain("内容已截断");
	});

	it("preserves trailing analysis whitespace for the generation stage", async () => {
		completeMock.mockResolvedValue({
			stopReason: "stop",
			content: [{ type: "text", text: "## 摘要\n\n结果\n" }],
		});

		await expect(summarizeContent(model, registry, "标题", "短资料正文")).resolves.toEqual({
			analysis: "## 摘要\n\n结果\n",
			sourceContext: "短资料正文",
			chunked: false,
		});
	});

	it("injects the existing wiki into analysis so names and themes can be aligned", async () => {
		completeMock.mockResolvedValue({
			stopReason: "stop",
			content: [{ type: "text", text: "## 摘要\n\n结果" }],
		});

		await summarizeContent(model, registry, "标题", "正文", "## Existing index\n- [[规范概念名]]");
		const systemPrompt = completeMock.mock.calls[0][1].systemPrompt as string;
		expect(systemPrompt).toContain("[[规范概念名]]");
		expect(systemPrompt).toContain("confirms, extends, qualifies, or disputes");
	});

	it("passes folder context through the short-source analysis request", async () => {
		completeMock.mockResolvedValue({ stopReason: "stop", content: [{ type: "text", text: "analysis" }] });
		await summarizeContent(model, registry, "标题", "正文", "", { sourceIdentity: "papers/source.md", folderContext: "AI研究 > 论文" });
		const prompt = completeMock.mock.calls[0][1].messages[0].content[0].text as string;
		expect(prompt).toContain("source = papers/source.md\nfolder_hint = AI研究 > 论文");
	});

	it("propagates the model error to the archive retry boundary", async () => {
		completeMock.mockResolvedValue({ stopReason: "error", errorMessage: "provider unavailable", content: [] });
		await expect(summarizeContent(model, registry, "标题", "正文")).rejects.toThrow("provider unavailable");
	});

	it("preserves a key fact that appears after the first 50,000 characters", async () => {
		const tailFact = "TAIL_FACT_长文档末尾事实";
		completeMock.mockImplementation(async (_model, request) => {
			const prompt = request.messages[0].content[0].text as string;
			return {
				stopReason: "stop",
				content: [{ type: "text", text: `## Chunk Analysis\n${prompt.includes(tailFact) ? tailFact : "分块摘要"}\n## Updated Global Digest\n${prompt.includes(tailFact) ? `FIRST_DIGEST ${tailFact}` : "FIRST_DIGEST"}` }],
			};
		});

		const content = `${"前文。\n\n".repeat(20_000)}${tailFact}`;
		const result = await summarizeContent(model, registry, "长资料", content);
		expect(result?.analysis).toContain(tailFact);
		expect(result?.sourceContext).toContain("# Consolidated source context:");
		expect(result?.sourceContext).toContain(tailFact);
		expect(result?.chunked).toBe(true);
		const prompts = completeMock.mock.calls.map((call) => call[1].messages[0].content[0].text as string);
		expect(prompts.some((prompt) => prompt.includes(tailFact))).toBe(true);
		expect(prompts.slice(1).some((prompt) => prompt.includes("FIRST_DIGEST"))).toBe(true);
		expect(prompts.every((prompt) => !prompt.includes("内容已截断"))).toBe(true);
		expect(completeMock.mock.calls.every((call) => call[1].systemPrompt.includes("main segment"))).toBe(true);
	});

	it("rejects a same-length checkpoint when the source hash changed", async () => {
		const root = mkdtempSync(join(tmpdir(), "inno-long-checkpoint-"));
		roots.push(root);
		const checkpointPath = join(root, "checkpoint.json");
		const contentA = `# Section\n\n${"A sentence. ".repeat(7_500)}`;
		const contentB = `# Section\n\n${"B sentence. ".repeat(7_500)}`;
		expect(contentA.length).toBe(contentB.length);
		let phase: "A" | "B" = "A";
		completeMock.mockImplementation(async () => {
			return { stopReason: "stop", content: [{ type: "text", text: `## Chunk Analysis\n${phase} analysis\n## Updated Global Digest\n${phase} digest` }] };
		});

		await summarizeContent(model, registry, "Long", contentA, "", { checkpointPath, sourceIdentity: "same.md" });
		const firstCalls = completeMock.mock.calls.length;
		const checkpoint = JSON.parse(readFileSync(checkpointPath, "utf8"));
		expect(checkpoint).toMatchObject({ sourceHash: hashLongSourceText(contentA), completedThrough: checkpoint.chunkTotal });
		expect(checkpoint.updatedAt).toEqual(expect.any(Number));

		completeMock.mockClear();
		phase = "B";
		const result = await summarizeContent(model, registry, "Long", contentB, "", { checkpointPath, sourceIdentity: "same.md" });
		expect(completeMock).toHaveBeenCalledTimes(firstCalls);
		expect(result?.analysis).toContain("B analysis");
		expect(result?.analysis).not.toContain("A analysis");
	});

	it("resumes a compatible checkpoint from the next chunk with its rolling digest", async () => {
		const root = mkdtempSync(join(tmpdir(), "inno-long-checkpoint-resume-"));
		roots.push(root);
		const checkpointPath = join(root, "checkpoint.json");
		const content = `# Section\n\n${"Resume sentence. ".repeat(7_500)}`;
		const sourceBudget = computeWikiSourceBudget(undefined, 0);
		const targetChars = Math.max(12_000, Math.min(60_000, Math.floor(sourceBudget * 0.55)));
		const overlapChars = Math.max(800, Math.min(3_000, Math.floor(targetChars * 0.08)));
		const chunks = splitSourceIntoSemanticChunks(content, targetChars, overlapChars);
		writeFileSync(checkpointPath, JSON.stringify({
			version: 1,
			sourceIdentity: "resume.md",
			sourceHash: hashLongSourceText(content),
			sourceLength: content.length,
			sourceBudget,
			targetChars,
			overlapChars,
			chunkTotal: chunks.length,
			completedThrough: 1,
			globalDigest: "PRIOR_DIGEST",
			analyses: [`## Chunk 1/${chunks.length} — Section\nPRIOR_ANALYSIS`],
		}, null, 2));
		completeMock.mockResolvedValue({
			stopReason: "stop",
			content: [{ type: "text", text: "## Chunk Analysis\nRESUMED_ANALYSIS\n## Updated Global Digest\nRESUMED_DIGEST" }],
		});

		const result = await summarizeContent(model, registry, "Long", content, "", {
			checkpointPath, sourceIdentity: "resume.md", folderContext: "Research > Long",
		});
		expect(completeMock).toHaveBeenCalledTimes(chunks.length - 1);
		const firstPrompt = completeMock.mock.calls[0][1].messages[0].content[0].text as string;
		expect(firstPrompt).toContain("folder_hint = Research > Long");
		expect(firstPrompt).toContain("segment = 2/");
		expect(firstPrompt).toContain("PRIOR_DIGEST");
		expect(result?.analysis).toContain("PRIOR_ANALYSIS");
		expect(result?.analysis).toContain("RESUMED_ANALYSIS");
	});
});
