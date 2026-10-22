import { describe, expect, it } from "vitest";

import { segmentForFts } from "../l3/sqlite-store.js";
import type { L2IndexStore, L2LexHit, L2PageMeta } from "./l2-index-store.js";
import { searchL2 } from "./l2-search.js";

function page(path: string, title: string, body: string, sourceIds: string[] = [], type = "concept"): L2PageMeta {
	return { path, title, body, sourceIds, type, tags: [] };
}

function lexicalHit(value: L2PageMeta): L2LexHit {
	return { ...value, bm25: -1 };
}

function fakeStore(pages: L2PageMeta[], hits: L2LexHit[]): L2IndexStore {
	return {
		getAllPages: () => pages,
		searchLexical: () => hits,
	} as unknown as L2IndexStore;
}

describe("L2 retrieval", () => {
	it("segments CJK runs into discriminative bigrams", () => {
		expect(segmentForFts("学习计划 Agent42")).toBe("学习 习计 计划 agent42");
	});

	it("expands lexical hits to directly linked pages", async () => {
		const alpha = page("wiki/concepts/alpha.md", "Alpha", "关联 [[Beta]]");
		const beta = page("wiki/concepts/beta.md", "Beta", "Beta details");
		const results = await searchL2(fakeStore([alpha, beta], [lexicalHit(alpha)]), "alpha", { limit: 5 });

		expect(results.map((result) => result.path)).toEqual([alpha.path, beta.path]);
		expect(results[1].via).toContain("graph");
	});

	it("uses shared source provenance as a graph signal", async () => {
		const seed = page("wiki/concepts/seed.md", "Seed", "Seed body", ["source-1"]);
		const sibling = page("wiki/entities/sibling.md", "Sibling", "Sibling body", ["source-1"], "entity");
		const unrelated = page("wiki/entities/other.md", "Other", "Other body", ["source-2"], "entity");
		const results = await searchL2(
			fakeStore([seed, sibling, unrelated], [lexicalHit(seed)]),
			"seed",
			{ limit: 5 },
		);

		expect(results.map((result) => result.path)).toEqual([seed.path, sibling.path]);
		expect(results.find((result) => result.path === sibling.path)?.via).toContain("graph");
	});
});
