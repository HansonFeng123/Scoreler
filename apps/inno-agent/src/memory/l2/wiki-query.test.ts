import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { writeText } from "../../storage/file-store.js";
import type { L2Memory } from "./l2-memory.js";
import { queryWikiHybridDetailed } from "./wiki-query.js";

const tempDirs: string[] = [];

function tempDir(): string {
	const root = mkdtempSync(join(tmpdir(), "inno-wiki-query-"));
	tempDirs.push(root);
	return root;
}

afterEach(() => {
	for (const root of tempDirs.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("structured Wiki query results", () => {
	it("keeps path, score, match signals, and source provenance in details", async () => {
		const root = tempDir();
		writeText(join(root, "wiki/index.md"), "# Index");
		writeText(join(root, "wiki/concepts/retrieval.md"), "# 检索练习\n\n正文");
		const memory = {
			dataDir: root,
			search: async () => [{
				path: "wiki/concepts/retrieval.md",
				title: "检索练习",
				type: "concept",
				sourceIds: ["l2src_learning"],
				score: 0.42,
				via: ["lexical", "graph"],
			}],
		} as unknown as L2Memory;

		const result = await queryWikiHybridDetailed(memory, "主动回忆");
		expect(result.mode).toBe("indexed");
		expect(result.hits).toEqual([{
			path: "wiki/concepts/retrieval.md",
			title: "检索练习",
			score: 0.42,
			via: ["lexical", "graph"],
			sourceIds: ["l2src_learning"],
		}]);
		expect(result.text).toContain("wiki/concepts/retrieval.md");
	});
});
