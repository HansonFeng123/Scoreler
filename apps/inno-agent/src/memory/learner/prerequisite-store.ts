import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileExists, readText } from "../../storage/file-store.js";
import { parseFrontmatter } from "../l2/wiki-maintainer.js";
import type { ConfidenceLevel } from "../l2/types.js";
import type { PrerequisiteEdge } from "./prerequisite-resolver.js";

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function confidenceFromPage(value: ConfidenceLevel): number {
	if (value === "high") return 0.9;
	if (value === "low") return 0.4;
	return 0.65;
}

function markdownFiles(dir: string): string[] {
	if (!fileExists(dir)) return [];
	const result: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) result.push(...markdownFiles(path));
		else if (entry.isFile() && entry.name.endsWith(".md")) result.push(path);
	}
	return result;
}

export interface LoadPrerequisiteOptions {
	scope?: string;
}

/**
 * Read explicit prerequisite edges from L2 concept-page frontmatter.
 * Ordinary wikilinks are intentionally ignored because relatedness is not a
 * directional teaching dependency.
 */
export function loadPrerequisiteEdges(
	l2DataDir: string | undefined,
	targetConceptId: string,
	options: LoadPrerequisiteOptions = {},
): PrerequisiteEdge[] {
	if (!l2DataDir || !targetConceptId.trim()) return [];
	const edges: PrerequisiteEdge[] = [];
	for (const path of markdownFiles(join(l2DataDir, "wiki", "concepts"))) {
		const parsed = parseFrontmatter(readText(path));
		const frontmatter = parsed.frontmatter;
		if (!frontmatter || frontmatter.concept_id !== targetConceptId) continue;
		for (const item of frontmatter.prerequisites ?? []) {
			if (options.scope && item.scope && item.scope !== options.scope) continue;
			edges.push({
				target_concept_id: targetConceptId,
				prerequisite_concept_id: item.concept_id,
				relation: item.relation ?? "required",
				required_level: clamp01(item.required_level ?? 0.65),
				importance: clamp01(item.importance ?? 0.8),
				source: item.source ?? "imported",
				source_confidence: clamp01(item.source_confidence ?? confidenceFromPage(frontmatter.confidence)),
				rationale: item.rationale ?? `L2 概念页声明 ${item.concept_id} 为前置知识。`,
				scope: item.scope,
			});
		}
	}
	return edges;
}
