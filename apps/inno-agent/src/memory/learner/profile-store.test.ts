import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLearningEvidenceEvent } from "./evidence.js";
import { loadEvents, loadRecentEvents, recordEvent, recordEventAndUpdateProfile } from "./profile-store.js";
import { createLearningEvent, type LearningEvent } from "./types.js";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "inno-profile-store-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

function recordEvents(count: number, payloadSize = 0): LearningEvent[] {
	const events: LearningEvent[] = [];
	for (let i = 0; i < count; i++) {
		const event = createLearningEvent("learner", "concept_explained", {}, { n: i, pad: "x".repeat(payloadSize) });
		recordEvent(dir, event);
		events.push(event);
	}
	return events;
}

describe("loadRecentEvents", () => {
	it("returns the last N events in order", () => {
		const events = recordEvents(5);
		const recent = loadRecentEvents(dir, 3);
		expect(recent.map((e) => e.event_id)).toEqual(events.slice(-3).map((e) => e.event_id));
	});

	it("returns everything when fewer than N events exist", () => {
		const events = recordEvents(2);
		expect(loadRecentEvents(dir, 8).map((e) => e.event_id)).toEqual(events.map((e) => e.event_id));
	});

	it("returns [] when no events have been recorded", () => {
		expect(loadRecentEvents(dir, 8)).toEqual([]);
	});

	it("reads only the tail window and tolerates a partial first line", () => {
		// Events padded so the file far exceeds the tail window: the window
		// starts mid-record, and that partial record must be dropped rather
		// than crash or corrupt the parse.
		const events = recordEvents(10, 200);
		const singleLineSize = JSON.stringify(events[0]).length + 1;
		const recent = loadRecentEvents(dir, 10, singleLineSize * 3);
		expect(recent.length).toBeGreaterThanOrEqual(2);
		expect(recent.length).toBeLessThan(10);
		expect(recent.map((e) => e.event_id)).toEqual(events.slice(-recent.length).map((e) => e.event_id));
	});

	it("loadEvents still replays the full log for rebuilds", () => {
		const events = recordEvents(10, 200);
		expect(loadEvents(dir).map((e) => e.event_id)).toEqual(events.map((e) => e.event_id));
	});
});

describe("learning evidence ledger", () => {
	it("deduplicates retry-safe evidence writes", () => {
		const event = createLearningEvidenceEvent("student", {
			concept_id: "physics.force_decomposition",
			kind: "application",
			result: "correct",
			evaluator: "teacher",
			evaluator_confidence: 1,
			dedupe_key: "session-1:question-1:answer-1",
		});

		recordEventAndUpdateProfile(dir, event);
		recordEventAndUpdateProfile(dir, event);
		expect(loadEvents(dir)).toHaveLength(1);
	});

	it("does not increase mastery merely because the assistant explained a concept", () => {
		const event = createLearningEvent(
			"student",
			"concept_explained",
			{ concept_ids: ["physics.force_decomposition"] },
			{ topic: "力的分解" },
		);
		const profile = recordEventAndUpdateProfile(dir, event);
		expect(profile.knowledge_states[0].mastery).toBe(0.05);
		expect(profile.knowledge_states[0].stability).toBe(0.1);
	});
});
