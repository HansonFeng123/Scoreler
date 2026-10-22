import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureDir, writeText } from "../../storage/file-store.js";
import { serializeFrontmatter } from "../l2/wiki-maintainer.js";
import { loadPrerequisiteEdges } from "./prerequisite-store.js";

describe("L2 prerequisite store", () => {
	it("loads explicit teaching dependencies and ignores ordinary links", () => {
		const root = mkdtempSync(join(tmpdir(), "inno-prerequisites-"));
		try {
			const conceptsDir = join(root, "wiki", "concepts");
			ensureDir(conceptsDir);
			const frontmatter = serializeFrontmatter({
				title: "斜面加速度",
				created: "2026-08-09",
				updated: "2026-08-09",
				type: "concept",
				tags: ["physics"],
				sources: [],
				source_ids: [],
				status: "reviewed",
				confidence: "high",
				concept_id: "physics.inclined_plane_acceleration",
				prerequisites: [{
					concept_id: "physics.force_decomposition",
					relation: "required",
					required_level: 0.7,
					importance: 0.95,
					source: "teacher",
					source_confidence: 1,
					rationale: "需要计算沿斜面方向的分力。",
				}],
			});
			writeText(join(conceptsDir, "inclined-plane.md"), `${frontmatter}\n正文链接到 [[摩擦力]]。`);

			const edges = loadPrerequisiteEdges(root, "physics.inclined_plane_acceleration");
			expect(edges).toHaveLength(1);
			expect(edges[0]).toMatchObject({
				prerequisite_concept_id: "physics.force_decomposition",
				required_level: 0.7,
				source: "teacher",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
