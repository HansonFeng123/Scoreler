import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { writeText } from "../../storage/file-store.js";
import { buildWikiGraph } from "./wiki-graph.js";
import { ensureL2Directories, serializeFrontmatter } from "./wiki-maintainer.js";
import { wikiPathJoin } from "./wiki-paths.js";

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function writePage(root: string, name: string, title: string, sourceId: string, body: string, type = "concept"): string {
	// The returned path is the page's logical identity and must always use
	// forward slashes — building it with join() would produce backslashes on
	// Windows and never match the graph's node/edge ids.
	const path = wikiPathJoin("wiki", "concepts", `${name}.md`);
	writeText(
		join(root, path),
		`${serializeFrontmatter({
			title,
			created: "2026-07-30",
			type,
			tags: ["test"],
			sources: [],
			source_ids: [sourceId],
			updated: "2026-07-30",
			status: "draft",
			confidence: "medium",
		})}\n# ${title}\n\n${body}\n`,
	);
	return path;
}

describe("L2 wiki graph visualization data", () => {
	it("deduplicates reciprocal links and applies relevance only to explicit edges", () => {
		const root = mkdtempSync(join(tmpdir(), "inno-l2-graph-"));
		tempDirs.push(root);
		ensureL2Directories(root);

		const alpha = writePage(root, "alpha", "Alpha", "source-1", "[[Beta]] and again [[Beta]], plus [[Gamma]].");
		const beta = writePage(root, "beta", "Beta", "source-1", "[[Alpha]]");
		const gamma = writePage(root, "gamma", "Gamma", "source-2", "A separate source.");

		const graph = buildWikiGraph(root);
		const pageEdges = graph.edges.filter((edge) => edge.type === "link" && edge.target.startsWith("wiki/"));
		const alphaBeta = pageEdges.filter((edge) => new Set([edge.source, edge.target]).has(alpha) && new Set([edge.source, edge.target]).has(beta));
		const alphaGamma = pageEdges.find((edge) => new Set([edge.source, edge.target]).has(alpha) && new Set([edge.source, edge.target]).has(gamma));

		expect(alphaBeta).toHaveLength(1);
		expect(alphaGamma).toBeDefined();
		expect(alphaBeta[0]!.weight).toBeGreaterThan(alphaGamma!.weight);
		expect(graph.nodes.find((node) => node.id === alpha)?.community).toEqual(expect.any(Number));
		expect(graph.nodes.every((node) => node.type !== "tag")).toBe(true);
	});

	it("skips query and unresolved synthetic nodes", () => {
		const root = mkdtempSync(join(tmpdir(), "inno-l2-graph-"));
		tempDirs.push(root);
		ensureL2Directories(root);
		writePage(root, "alpha", "Alpha", "source-1", "[[Missing Page]]");
		writeText(
			join(root, "wiki", "queries", "open-question.md"),
			`${serializeFrontmatter({
				title: "Open question", created: "2026-07-30", type: "query", tags: [], related: [],
				sources: [], source_ids: ["source-1"], updated: "2026-07-30", status: "draft", confidence: "medium",
			})}\n# Open question\n\n[[alpha]]\n`,
		);

		const graph = buildWikiGraph(root);
		expect(graph.nodes.some((node) => node.id.includes("open-question"))).toBe(false);
		expect(graph.nodes.some((node) => node.id === "Missing Page")).toBe(false);
		expect(graph.maintenance.missing).toContainEqual(expect.objectContaining({ link: "Missing Page" }));
	});

	it("uses query pages only as relevance neighbors, never visible graph nodes", () => {
		const root = mkdtempSync(join(tmpdir(), "inno-l2-graph-"));
		tempDirs.push(root);
		ensureL2Directories(root);
		const alpha = writePage(root, "alpha", "Alpha", "source-1", "[[Beta]]\n[[Question]]");
		const beta = writePage(root, "beta", "Beta", "source-2", "[[Alpha]]\n[[Question]]");
		writePage(root, "question", "Question", "source-1", "[[Alpha]]\n[[Beta]]", "query");

		const graph = buildWikiGraph(root);
		const edge = graph.edges.find((candidate) => new Set([candidate.source, candidate.target]).size === 2
			&& [candidate.source, candidate.target].includes(alpha) && [candidate.source, candidate.target].includes(beta));

		expect(graph.nodes.some((node) => node.id.endsWith("question.md"))).toBe(false);
		// direct reciprocal link (6) + concept affinity (0.8) +
		// query common-neighbor score 1.5 / ln(out=2 + in=2).
		expect(edge?.weight).toBeCloseTo(6.8 + 1.5 / Math.log(4), 8);
	});

	it("includes schema-defined directories in the graph", () => {
		const root = mkdtempSync(join(tmpdir(), "inno-l2-graph-schema-"));
		tempDirs.push(root);
		ensureL2Directories(root);
		writeText(
			join(root, "wiki/methods/custom.md"),
			`${serializeFrontmatter({
				title: "Custom method", created: "2026-07-30", type: "method", tags: [], sources: [], source_ids: ["source-1"],
				updated: "2026-07-30", status: "draft", confidence: "medium",
			})}\n# Custom method\n\nA schema-defined page.\n`,
		);

		const graph = buildWikiGraph(root);
		expect(graph.nodes).toContainEqual(expect.objectContaining({ id: "wiki/methods/custom.md", type: "method" }));
	});

});
