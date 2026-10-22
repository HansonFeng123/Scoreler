/**
 * Wiki link graph builder + graph analysis.
 *
 * Builds the resolved `[[link]]` graph for the `/api/wiki/graph` endpoint, and
 * computes algorithmic graph metrics used for maintenance and the overview:
 *   - filename-id link resolution
 *   - node degree (resolved links only)
 *   - Louvain communities + modularity + per-community cohesion
 *   - maintenance signals: missing (dangling) links, orphan pages, possible
 *     duplicate pages, and contested pages
 *
 * The output stays backward-compatible with the previous shape ({nodes, edges}
 * with node {id,title,type,tags} and edge {source,target,type}); new fields are
 * additive so the existing frontend keeps working.
 */

import { basename, extname, join } from "node:path";
import { wikiPathJoin } from "./wiki-paths.js";
import { UndirectedGraph } from "graphology";
import louvainImport from "graphology-communities-louvain";

// The louvain package's default export is typed awkwardly under Node16 CJS/ESM
// interop; pin the one method we use to a local type.
type LouvainDetailed = (g: unknown) => { communities: Record<string, number>; modularity: number; count: number };
const louvainDetailed = (louvainImport as unknown as { detailed: LouvainDetailed }).detailed;
import { readText } from "../../storage/file-store.js";
import { parseFrontmatter } from "./wiki-maintainer.js";
import { buildAliasIndex, extractOutgoingLinks, normalizeWikiLink, stripParenthetical } from "./wiki-links.js";
import { listWikiPagePaths } from "./wiki-page-files.js";

/** Cohesion below this (for communities of at least MIN_COMMUNITY_SIZE) is flagged. */
const LOW_COHESION_THRESHOLD = 0.15;
const MIN_COMMUNITY_SIZE = 3;

/**
 * The generated overview page. It is a meta/summary page (links to the top
 * nodes it was derived from), so including it in the graph would add a
 * "connects everything" super-node AND inflate the degree of exactly the nodes
 * it ranks — a feedback loop. It is therefore excluded from the graph.
 */
export const OVERVIEW_PATH = wikiPathJoin("wiki", "analysis", "overview.md");

export interface WikiGraphNode {
	id: string;
	title: string;
	type: string;
	tags: string[];
	/** Resolved-link degree (page nodes only). */
	degree?: number;
	/** Louvain community id (page nodes only). */
	community?: number;
}
export interface WikiGraphEdge {
	source: string;
	target: string;
	type: "link" | "tag";
	/** Relative relevance used by graph layout and rendering. */
	weight: number;
}
export interface WikiGraphMaintenance {
	/** `[[links]]` that resolve to no page. */
	missing: { from: string; link: string }[];
	/** Page paths with no resolved link in or out. */
	orphans: string[];
	/** Groups of page paths whose titles collapse to the same base (possible dups). */
	duplicates: string[][];
	/** Page paths flagged `contested: true`. */
	contested: string[];
}
export interface WikiGraphCommunities {
	count: number;
	modularity: number;
	lowCohesion: { community: number; cohesion: number; size: number }[];
}
export interface WikiGraph {
	nodes: WikiGraphNode[];
	edges: WikiGraphEdge[];
	maintenance: WikiGraphMaintenance;
	communities: WikiGraphCommunities;
}

interface PageRecord {
	path: string;
	title: string;
	type: string;
	tags: string[];
	sourceIds: string[];
	body: string;
	contested: boolean;
}

interface ResolvedLinkRecord {
	source: string;
	target: string;
	directions: Set<string>;
}

// Relevance weights only already-resolved explicit wikilinks; they never invent
// edges and keep provenance/common-neighbor signals bounded.
const DIRECT_LINK_WEIGHT = 3;
const SOURCE_OVERLAP_WEIGHT = 4;
const COMMON_NEIGHBOR_WEIGHT = 1.5;

const TYPE_AFFINITY: Record<string, Record<string, number>> = {
	entity: { concept: 1.2, entity: 0.8, source: 1, synthesis: 1, query: 0.8 },
	concept: { entity: 1.2, concept: 0.8, source: 1, synthesis: 1.2, query: 1 },
	source: { entity: 1, concept: 1, source: 0.5, query: 0.8, synthesis: 1 },
	query: { concept: 1, entity: 0.8, synthesis: 1, source: 0.8, query: 0.5 },
	synthesis: { concept: 1.2, entity: 1, source: 1, query: 1, synthesis: 0.8 },
};

function relevanceType(type: string): string {
	return type === "source-summary" ? "source" : type;
}

function inferTypeFromPath(wikiPath: string): string {
	if (wikiPath.includes("entities/")) return "entity";
	if (wikiPath.includes("concepts/")) return "concept";
	if (wikiPath.includes("queries/")) return "query";
	if (wikiPath.includes("comparisons/")) return "comparison";
	if (wikiPath.includes("synthesis/")) return "synthesis";
	if (wikiPath.includes("analysis/")) return "analysis";
	return "source-summary";
}

/** Read all wiki pages (excluding the generated overview). */
function readAllPages(l2DataDir: string, includeQueries = false): PageRecord[] {
	const pages: PageRecord[] = [];
	for (const wikiPath of listWikiPagePaths(l2DataDir)) {
		if (wikiPath === OVERVIEW_PATH) continue;
		const { frontmatter, body } = parseFrontmatter(readText(join(l2DataDir, wikiPath)));
		if (!frontmatter) continue;
		if (!includeQueries && frontmatter.type === "query") continue;
		pages.push({
			path: wikiPath,
			title: frontmatter.title || basename(wikiPath, extname(wikiPath)),
			type: frontmatter.type || inferTypeFromPath(wikiPath),
			tags: frontmatter.tags ?? [],
			sourceIds: frontmatter.source_ids ?? [],
			body,
			contested: frontmatter.contested === true,
		});
	}
	return pages.sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
}

/**
 * The relevance graph retains query pages even though the visible graph
 * excludes them. Queries can therefore contribute a common neighbor to the
 * weight of an already-explicit page edge, but never become visible nodes.
 */
function buildRetrievalAdjacency(pages: PageRecord[]): { outgoing: Map<string, Set<string>>; incoming: Map<string, Set<string>> } {
	const alias = buildAliasIndex(pages);
	const outgoing = new Map(pages.map((page) => [page.path, new Set<string>()]));
	const incoming = new Map(pages.map((page) => [page.path, new Set<string>()]));
	for (const page of pages) {
		for (const rawLink of extractOutgoingLinks(page.body)) {
			const target = alias.resolve(rawLink);
			if (!target || target === page.path) continue;
			outgoing.get(page.path)!.add(target);
			incoming.get(target)!.add(page.path);
		}
	}
	return { outgoing, incoming };
}

/**
 * Build the wiki graph plus algorithmic analysis. Node ids are wiki-relative
 * paths; `[[links]]` resolve with filename-id aliases. Unresolved
 * links remain maintenance findings and never become graph nodes.
 */
export function buildWikiGraph(l2DataDir: string): WikiGraph {
	const allPages = readAllPages(l2DataDir, true);
	const pages = allPages.filter((page) => page.type !== "query");
	const alias = buildAliasIndex(pages);
	const pageByPath = new Map(pages.map((p) => [p.path, p]));
	const retrievalAdjacency = buildRetrievalAdjacency(allPages);

	const nodes: WikiGraphNode[] = [];
	const resolvedLinks = new Map<string, ResolvedLinkRecord>();
	const missing: { from: string; link: string }[] = [];

	// Resolved-link adjacency (undirected, distinct neighbors) for degree/community.
	const neighbors = new Map<string, Set<string>>();
	for (const p of pages) neighbors.set(p.path, new Set());

	for (const p of pages) {
		nodes.push({ id: p.path, title: p.title, type: p.type, tags: p.tags });
		for (const rawLink of extractOutgoingLinks(p.body)) {
			const target = alias.resolve(rawLink);
			if (target && target !== p.path) {
				const pairKey = [p.path, target].sort().join("\u0000");
				let record = resolvedLinks.get(pairKey);
				if (!record) {
					record = { source: p.path, target, directions: new Set() };
					resolvedLinks.set(pairKey, record);
				}
				record.directions.add(`${p.path}\u0000${target}`);
				neighbors.get(p.path)!.add(target);
				neighbors.get(target)!.add(p.path);
			} else if (!target) {
				// Skip unresolved links in the graph; retain only lint data.
				const label = rawLink.split("|")[0].trim();
				if (!missing.some((item) => item.from === p.path && item.link === label)) {
					missing.push({ from: p.path, link: label });
				}
			}
		}
	}

	const retrievalNeighbors = (path: string): Set<string> => new Set([
		...(retrievalAdjacency.outgoing.get(path) ?? []),
		...(retrievalAdjacency.incoming.get(path) ?? []),
	]);
	const commonNeighborScore = (source: string, target: string): number => {
		let score = 0;
		const targetNeighbors = retrievalNeighbors(target);
		for (const candidate of retrievalNeighbors(source)) {
			if (!targetNeighbors.has(candidate)) continue;
			const degree = (retrievalAdjacency.outgoing.get(candidate)?.size ?? 0) + (retrievalAdjacency.incoming.get(candidate)?.size ?? 0);
			score += 1 / Math.log(Math.max(degree, 2));
		}
		return score;
	};

	const resolvedEdges: WikiGraphEdge[] = [...resolvedLinks.values()].map((record) => {
		const sourcePage = pageByPath.get(record.source)!;
		const targetPage = pageByPath.get(record.target)!;
		const sourceIds = new Set(sourcePage.sourceIds);
		const sharedSourceCount = targetPage.sourceIds.filter((id) => sourceIds.has(id)).length;
		const affinity = TYPE_AFFINITY[relevanceType(sourcePage.type)]?.[relevanceType(targetPage.type)] ?? 0.5;
		const weight =
			record.directions.size * DIRECT_LINK_WEIGHT +
			sharedSourceCount * SOURCE_OVERLAP_WEIGHT +
			commonNeighborScore(record.source, record.target) * COMMON_NEIGHBOR_WEIGHT +
			affinity;
		return { source: record.source, target: record.target, type: "link", weight };
	});
	const edges = resolvedEdges;

	// ---- community detection over the explicit-wikilink graph ----
	const g = new UndirectedGraph();
	for (const p of pages) g.addNode(p.path);
	for (const edge of resolvedEdges) {
		if (!g.hasEdge(edge.source, edge.target)) {
			g.addEdge(edge.source, edge.target, { weight: edge.weight });
		}
	}

	let community = new Map<string, number>();
	let modularity = 0;
	if (g.order > 0 && g.size > 0) {
		try {
			const detailed = louvainDetailed(g);
			community = new Map(Object.entries(detailed.communities));
			modularity = typeof detailed.modularity === "number" ? detailed.modularity : 0;
		} catch {
			community = new Map();
		}
	}

	// Stable, compact ids make the community palette predictable across reloads.
	const rawCommunityGroups = new Map<number, string[]>();
	for (const [path, id] of community) {
		(rawCommunityGroups.get(id) ?? rawCommunityGroups.set(id, []).get(id)!).push(path);
	}
	const communityIdRemap = new Map(
		[...rawCommunityGroups.entries()]
			.sort((a, b) => b[1].length - a[1].length || a[1][0]!.localeCompare(b[1][0]!, "zh-CN"))
			.map(([id], index) => [id, index]),
	);
	community = new Map([...community].map(([path, id]) => [path, communityIdRemap.get(id) ?? 0]));

	const degreeByPath = new Map<string, number>();
	for (const [path, set] of neighbors) degreeByPath.set(path, set.size);

	for (const node of nodes) {
		node.degree = degreeByPath.get(node.id) ?? 0;
		const c = community.get(node.id);
		if (c !== undefined) node.community = c;
	}

	// ---- maintenance signals ----
	const orphans = pages.filter((p) => (degreeByPath.get(p.path) ?? 0) === 0).map((p) => p.path);
	const contested = pages.filter((p) => p.contested).map((p) => p.path);

	const baseGroups = new Map<string, string[]>();
	for (const p of pages) {
		const key = normalizeWikiLink(stripParenthetical(p.title));
		if (!key) continue;
		(baseGroups.get(key) ?? baseGroups.set(key, []).get(key)!).push(p.path);
	}
	const duplicates = [...baseGroups.values()].filter((g2) => g2.length > 1);

	// ---- per-community cohesion ----
	const commMembers = new Map<number, Set<string>>();
	for (const [path, c] of community) {
		(commMembers.get(c) ?? commMembers.set(c, new Set()).get(c)!).add(path);
	}
	const lowCohesion: { community: number; cohesion: number; size: number }[] = [];
	for (const [c, members] of commMembers) {
		if (members.size < MIN_COMMUNITY_SIZE) continue;
		let intra = 0;
		let incident = 0;
		for (const path of members) {
			for (const nb of neighbors.get(path) ?? []) {
				incident++;
				if (members.has(nb)) intra++;
			}
		}
		const cohesion = incident > 0 ? intra / incident : 0;
		if (cohesion < LOW_COHESION_THRESHOLD) {
			lowCohesion.push({ community: c, cohesion: Number(cohesion.toFixed(3)), size: members.size });
		}
	}

	return {
		nodes,
		edges,
		maintenance: { missing, orphans, duplicates, contested },
		communities: { count: commMembers.size, modularity: Number(modularity.toFixed(4)), lowCohesion },
	};
}

export interface WikiGraphStats {
	totalPages: number;
	typeCounts: Record<string, number>;
	topByDegree: { title: string; type: string; degree: number }[];
	maintenance: WikiGraphMaintenance;
	communities: WikiGraphCommunities;
}

/**
 * Per-type counts + degree ranking over the real page nodes, plus the graph's
 * maintenance/community analysis. Used by the overview generator.
 */
export function computeWikiGraphStats(graph: WikiGraph, topN = 15): WikiGraphStats {
	const pageNodes = graph.nodes.filter((n) => n.type !== "tag" && n.id.startsWith("wiki/"));

	const typeCounts: Record<string, number> = {};
	for (const n of pageNodes) typeCounts[n.type] = (typeCounts[n.type] ?? 0) + 1;

	const topByDegree = pageNodes
		.map((n) => ({ title: n.title, type: n.type, degree: n.degree ?? 0 }))
		.sort((a, b) => b.degree - a.degree || a.title.localeCompare(b.title, "zh-CN"))
		.slice(0, topN);

	return {
		totalPages: pageNodes.length,
		typeCounts,
		topByDegree,
		maintenance: graph.maintenance,
		communities: graph.communities,
	};
}
