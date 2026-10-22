import { describe, expect, it } from "vitest";
import { toWikiPath, wikiPathJoin } from "./wiki-paths.js";

describe("wiki-paths", () => {
	it("wikiPathJoin always uses forward slashes", () => {
		expect(wikiPathJoin("wiki", "concepts", "foo.md")).toBe("wiki/concepts/foo.md");
	});

	it("toWikiPath normalizes Windows separators", () => {
		expect(toWikiPath("wiki\\concepts\\foo.md")).toBe("wiki/concepts/foo.md");
		expect(toWikiPath("wiki/concepts/foo.md")).toBe("wiki/concepts/foo.md");
	});
});
