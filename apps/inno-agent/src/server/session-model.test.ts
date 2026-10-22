import { describe, expect, it } from "vitest";
import { selectActiveSessionEntries } from "./session-model.js";

describe("selectActiveSessionEntries", () => {
	it("keeps only the newest branch after a user question is replaced", () => {
		const entries: Array<Record<string, unknown>> = [
			{ type: "session", id: "session-id", timestamp: "2026-08-26T00:00:00Z" },
			{ type: "model_change", id: "model", parentId: null },
			{ type: "message", id: "question", parentId: "model", message: { role: "user", content: "12" } },
			{ type: "message", id: "old-answer", parentId: "question", message: { role: "assistant", content: "correct" } },
			{ type: "custom", id: "edit-marker", parentId: "model", customType: "inno_edit_branch" },
			{ type: "message", id: "replacement", parentId: "edit-marker", message: { role: "user", content: "8" } },
			{ type: "message", id: "new-answer", parentId: "replacement", message: { role: "assistant", content: "incorrect" } },
		];

		expect(selectActiveSessionEntries(entries).map((entry) => entry.id)).toEqual([
			"session-id",
			"model",
			"edit-marker",
			"replacement",
			"new-answer",
		]);
	});

	it("leaves a linear session unchanged", () => {
		const entries: Array<Record<string, unknown>> = [
			{ type: "session", id: "session-id" },
			{ type: "message", id: "first", parentId: null },
			{ type: "message", id: "second", parentId: "first" },
		];

		expect(selectActiveSessionEntries(entries)).toEqual(entries);
	});
});
