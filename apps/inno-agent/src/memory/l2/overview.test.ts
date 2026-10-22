import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { writeText } from "../../storage/file-store.js";
import { runL2Lint } from "./l2-lint.js";
import { regenerateOverview } from "./overview.js";
import { ensureL2Directories, serializeFrontmatter } from "./wiki-maintainer.js";

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("L2 overview", () => {
	it("renders missing targets as text instead of duplicating dangling links", async () => {
		const root = mkdtempSync(join(tmpdir(), "inno-l2-overview-"));
		tempDirs.push(root);
		ensureL2Directories(root);
		writeText(
			join(root, "wiki", "concepts", "known.md"),
			`${serializeFrontmatter({
				title: "Known",
				created: "2026-07-30",
				type: "concept",
				tags: ["concept"],
				sources: [],
				source_ids: [],
				updated: "2026-07-30",
				status: "draft",
				confidence: "medium",
			})}\n# Known\n\n正文引用 [[Missing Target]]。\n`,
		);

		await regenerateOverview(root);

		const overview = readFileSync(join(root, "wiki", "analysis", "overview.md"), "utf8");
		expect(overview).toContain("`Missing Target`");
		expect(overview).not.toContain("[[Missing Target]]");
		const dangling = runL2Lint(root).findings.filter((finding) => finding.code === "dangling_link");
		expect(dangling).toHaveLength(1);
		expect(dangling[0].path).toBe("wiki/concepts/known.md");
	});
});
