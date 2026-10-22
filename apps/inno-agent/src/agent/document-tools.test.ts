import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

const parser = vi.hoisted(() => ({
	parseDocument: vi.fn(),
	screenshotDocument: vi.fn(),
}));

vi.mock("../memory/l2/document-parser.js", () => ({
	...parser,
	DocumentParseError: class DocumentParseError extends Error {},
}));

import { createDocumentTools } from "./document-tools.js";

describe("parse_document", () => {
	let workspaceDir: string;

	afterEach(() => {
		parser.parseDocument.mockReset();
		parser.screenshotDocument.mockReset();
		if (workspaceDir) rmSync(workspaceDir, { recursive: true, force: true });
	});

	it("resolves relative paths against the current session cwd", async () => {
		workspaceDir = mkdtempSync(join(tmpdir(), "inno-document-tool-"));
		const filePath = join(workspaceDir, "paper.pdf");
		writeFileSync(filePath, "placeholder");
		parser.parseDocument.mockResolvedValue({ pageCount: 1, text: "parsed", pages: [{ pageNumber: 1, text: "parsed" }] });

		const tool = createDocumentTools()[0];
		const result = await tool.execute(
			"test-call",
			{ filePath: "paper.pdf" },
			undefined,
			undefined,
			{ cwd: workspaceDir } as never,
		);

		expect(parser.parseDocument).toHaveBeenCalledWith(filePath);
		expect(result.details).toMatchObject({ filePath });
		expect(result.content[0]).toMatchObject({ type: "text" });
	});
});
