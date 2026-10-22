import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { ManifestEntry, WikiPageFrontmatter } from "./types.js";
import {
	appendLog,
	createSourcePage,
	ensureL2Directories,
	getSourcePagePath,
	parseFrontmatter,
	readMaintenanceContext,
	rebuildIndex,
	serializeFrontmatter,
	updateIndexAfterIngest,
} from "./wiki-maintainer.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "inno-l2-maintainer-"));
	tempDirs.push(dir);
	return dir;
}

function entry(overrides: Partial<ManifestEntry> = {}): ManifestEntry {
	return {
		id: "l2src_source1",
		title: "测试资料",
		sourceType: "markdown",
		rawPath: "raw/uploads/source.md",
		extractedPath: "extracted/source.md",
		wikiPages: [],
		tags: ["学习", "yaml:value"],
		contentHash: "abc123",
		status: "indexed",
		source: { origin: "user_upload" },
		createdAt: "2026-07-30T00:00:00.000Z",
		updatedAt: "2026-07-30T00:00:00.000Z",
		...overrides,
	};
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("L2 wiki maintenance", () => {
	it("uses portable logical paths for source pages", () => {
		for (const pagePath of [
			getSourcePagePath(entry()),
			getSourcePagePath(entry(), "notes/algebra.md"),
		]) {
			expect(pagePath).toMatch(/^wiki\/sources\/[^/\\]+\.md$/);
		}
	});

	it("round-trips frontmatter through the YAML parser", () => {
		const frontmatter: WikiPageFrontmatter = {
			title: "包含: 冒号与 # 符号",
			created: "2026-07-30",
			type: "concept",
			tags: ["yaml:value", "中文 标签"],
			related: [],
			sources: ["wiki/sources/source.md"],
			source_ids: ["l2src_source1"],
			updated: "2026-07-30",
			status: "reviewed",
			confidence: "high",
			contested: false,
		};

		const parsed = parseFrontmatter(`${serializeFrontmatter(frontmatter)}\n正文`);
		expect(parsed.frontmatter).toEqual({ ...frontmatter, contradictions: [] });
		expect(parsed.body).toBe("正文");
	});

	it("creates navigation and schema files without user setup", () => {
		const root = makeTempDir();
		ensureL2Directories(root);

		expect(readFileSync(join(root, "wiki", "SCHEMA.md"), "utf8")).toContain("# Wiki Schema");
		const purpose = readFileSync(join(root, "wiki", "PURPOSE.md"), "utf8");
		expect(purpose).toContain("## Scope\n\n**In scope:**\n-");
		expect(purpose).not.toContain("What is in scope? What is explicitly out of scope?");
		expect(readFileSync(join(root, "wiki", "index.md"), "utf8")).toBe("# Wiki Index\n");
		expect(readMaintenanceContext(root).index).toBe("");
		expect(readFileSync(join(root, "wiki", "log.md"), "utf8")).toBe("");
		appendLog(root, "ingest", "Fallback");
		expect(readFileSync(join(root, "wiki", "log.md"), "utf8")).toContain("# L2 Wiki Log");
	});

	it("keeps source provenance in the page and rebuilt index", () => {
		const root = makeTempDir();
		ensureL2Directories(root);
		const source = entry();
		const pagePath = createSourcePage(root, source, "## 摘要\n\n核心结论。", source.extractedPath);
		source.wikiPages = [pagePath];
		rebuildIndex(root, [source]);

		const page = readFileSync(join(root, pagePath), "utf8");
		const parsed = parseFrontmatter(page);
		expect(parsed.frontmatter?.source_ids).toEqual([source.id]);
		expect(parsed.frontmatter?.sources).toEqual([source.rawPath]);
		expect(page).toContain(source.extractedPath);
		expect(readFileSync(join(root, "wiki", "index.md"), "utf8")).toContain(`[[${pagePath.replace(/^wiki\//, "").replace(/\.md$/, "")}]]`);
	});

	it("materializes the target first-ingest index shape", () => {
		const root = makeTempDir();
		ensureL2Directories(root);
		const source = entry();
		const pagePath = createSourcePage(root, source, "## 摘要\n\n核心结论。", source.extractedPath);

		expect(readMaintenanceContext(root).index).toBe("");
		expect(updateIndexAfterIngest(root, [pagePath])).toBe(true);
		expect(readFileSync(join(root, "wiki", "index.md"), "utf8")).toBe([
			"# Wiki Index",
			"",
			"## Recently Updated",
			`- [[${pagePath.replace(/^wiki\//, "").replace(/\.md$/, "")}]] — ${source.title}`,
			"",
		].join("\n"));
	});

	it("updates the ingest index incrementally and preserves existing sections", () => {
		const root = makeTempDir();
		ensureL2Directories(root);
		const source = entry();
		const pagePath = createSourcePage(root, source, "## 摘要\n\n核心结论。", source.extractedPath);
		const indexPath = join(root, "wiki", "index.md");
		const existing = `${readFileSync(indexPath, "utf8").trimEnd()}\n\n## Custom\n- Keep me\n`;
		writeFileSync(indexPath, existing, "utf8");

		expect(updateIndexAfterIngest(root, [pagePath])).toBe(true);
		const updated = readFileSync(indexPath, "utf8");
		expect(updated).toContain("## Custom\n- Keep me");
		expect(updated).toContain(`[[${pagePath.replace(/^wiki\//, "").replace(/\.md$/, "")}]]`);
		expect(updateIndexAfterIngest(root, [pagePath])).toBe(false);
	});

	it("preserves schema-defined directories when rebuilding the index", () => {
		const root = makeTempDir();
		ensureL2Directories(root);
		mkdirSync(join(root, "wiki", "methods"), { recursive: true });
		writeFileSync(join(root, "wiki", "methods", "custom.md"), `${serializeFrontmatter({
			title: "Custom method", created: "2026-07-30", type: "method", tags: [], sources: [], source_ids: [],
			updated: "2026-07-30", status: "draft", confidence: "medium",
		})}\n# Custom method\n`, "utf8");

		rebuildIndex(root, []);
		expect(readFileSync(join(root, "wiki", "index.md"), "utf8")).toContain("[[methods/custom]] — Custom method");
	});
});
