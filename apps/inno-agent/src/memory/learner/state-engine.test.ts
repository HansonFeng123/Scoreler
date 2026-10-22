import { describe, expect, it } from "vitest";
import { createLearningEvidenceEvent } from "./evidence.js";
import {
	applyDerivedKnowledgeState,
	applyEvidenceToLinkedMisconception,
	projectLearnerKnowledge,
} from "./state-engine.js";
import { createDefaultProfile, createLearningEvent } from "./types.js";

const conceptId = "physics.force_decomposition";

function project(events: ReturnType<typeof createLearningEvidenceEvent>[], asOf = new Date("2026-08-10T00:00:00.000Z")) {
	return projectLearnerKnowledge(createDefaultProfile("student"), events, asOf)
		.find((state) => state.concept_id === conceptId)!;
}

describe("learner state engine", () => {
	it("treats explanation as exposure rather than mastery evidence", () => {
		const event = createLearningEvent(
			"student",
			"concept_explained",
			{ concept_ids: [conceptId] },
			{ topic: "力的分解" },
		);
		event.timestamp = "2026-08-09T00:00:00.000Z";

		const state = projectLearnerKnowledge(createDefaultProfile("student"), [event], new Date("2026-08-10T00:00:00.000Z"))[0];
		expect(state.mastery).toBe(0.05);
		expect(state.last_successful_retrieval_at).toBeUndefined();
		expect(state.state_label).toBe("learning");
	});

	it("does not let an explanation smuggle in a mastery delta", () => {
		const event = createLearningEvent(
			"student",
			"concept_explained",
			{ concept_ids: [conceptId] },
			{ topic: "力的分解" },
			{ mastery_delta: 0.8 },
		);
		event.timestamp = "2026-08-09T00:00:00.000Z";

		const state = projectLearnerKnowledge(
			createDefaultProfile("student"),
			[event],
			new Date("2026-08-10T00:00:00.000Z"),
		)[0];
		expect(state.mastery).toBe(0.05);
		expect(state.last_result).toBeUndefined();
	});

	it("weights independent recall more strongly than heavily guided recall", () => {
		const guided = createLearningEvidenceEvent("student", {
			concept_id: conceptId,
			kind: "guided_recall",
			result: "correct",
			hint_level: 2,
			evaluator: "teacher",
			evaluator_confidence: 1,
		}, new Date("2026-08-09T00:00:00.000Z"));
		const independent = createLearningEvidenceEvent("student", {
			concept_id: conceptId,
			kind: "free_recall",
			result: "correct",
			hint_level: 0,
			delay_seconds: 86_400,
			evaluator: "teacher",
			evaluator_confidence: 1,
		}, new Date("2026-08-09T00:00:00.000Z"));

		expect(project([independent]).mastery).toBeGreaterThan(project([guided]).mastery);
		expect(project([independent]).stability_days).toBeGreaterThan(project([guided]).stability_days);
	});

	it("allows reliable failure evidence to lower mastery and stability", () => {
		const success = createLearningEvidenceEvent("student", {
			concept_id: conceptId,
			kind: "application",
			result: "correct",
			hint_level: 0,
			evaluator: "deterministic",
			evaluator_confidence: 1,
		}, new Date("2026-08-01T00:00:00.000Z"));
		const failure = createLearningEvidenceEvent("student", {
			concept_id: conceptId,
			kind: "application",
			result: "incorrect",
			hint_level: 0,
			evaluator: "deterministic",
			evaluator_confidence: 1,
		}, new Date("2026-08-09T00:00:00.000Z"));

		const afterSuccess = project([success]);
		const afterFailure = project([success, failure]);
		expect(afterFailure.mastery).toBeLessThan(afterSuccess.mastery);
		expect(afterFailure.stability_days).toBeLessThan(afterSuccess.stability_days);
		expect(afterFailure.lapse_count).toBe(1);
	});

	it("does not let a contradictory score invert the categorical result", () => {
		const contradictoryFailure = createLearningEvidenceEvent("student", {
			concept_id: conceptId,
			kind: "application",
			result: "incorrect",
			score: 1,
			hint_level: 0,
			evaluator: "deterministic",
			evaluator_confidence: 1,
		}, new Date("2026-08-09T00:00:00.000Z"));

		const state = project([contradictoryFailure]);
		expect(state.mastery).toBeLessThanOrEqual(0.05);
		expect(state.last_result).toBe("incorrect");
		expect(state.lapse_count).toBe(1);
	});

	it("computes lower retrievability as time passes without rewriting evidence", () => {
		const success = createLearningEvidenceEvent("student", {
			concept_id: conceptId,
			kind: "free_recall",
			result: "correct",
			hint_level: 0,
			evaluator: "teacher",
			evaluator_confidence: 1,
		}, new Date("2026-08-01T00:00:00.000Z"));

		const nextDay = project([success], new Date("2026-08-02T00:00:00.000Z"));
		const later = project([success], new Date("2026-09-01T00:00:00.000Z"));
		expect(later.retrievability).toBeLessThan(nextDay.retrievability!);
		expect(later.evidence_ids).toEqual(nextDay.evidence_ids);
	});

	it("keeps the latest capability result when a later explanation is recorded", () => {
		const success = createLearningEvidenceEvent("student", {
			concept_id: conceptId,
			kind: "application",
			result: "correct",
			hint_level: 0,
			evaluator: "deterministic",
			evaluator_confidence: 1,
		}, new Date("2026-08-08T00:00:00.000Z"));
		const explanation = createLearningEvent(
			"student",
			"concept_explained",
			{ concept_ids: [conceptId] },
			{ topic: "力的分解" },
		);
		explanation.timestamp = "2026-08-09T00:00:00.000Z";

		const state = projectLearnerKnowledge(
			createDefaultProfile("student"),
			[success, explanation],
			new Date("2026-08-10T00:00:00.000Z"),
		)[0];
		expect(state.last_result).toBe("correct");
	});

	it("does not include evidence that occurs after the projection time", () => {
		const future = createLearningEvidenceEvent("student", {
			concept_id: conceptId,
			kind: "application",
			result: "correct",
			hint_level: 0,
			evaluator: "deterministic",
			evaluator_confidence: 1,
		}, new Date("2026-08-20T00:00:00.000Z"));

		const state = project([future], new Date("2026-08-10T00:00:00.000Z"));
		expect(state.mastery).toBe(0.05);
		expect(state.evidence_ids).toEqual([]);
		expect(state.state_label).toBe("unknown");
	});

	it("keeps a compact evidence snapshot after the event window is gone", () => {
		const profile = createDefaultProfile("student");
		profile.knowledge_states.push({
			concept_id: conceptId,
			concept_name: "力的分解",
			domain: "physics",
			mastery: 0.05,
			confidence: 0.35,
			stability: 0.1,
			evidence_ids: [],
			diagnosis: "暂无诊断",
			next_actions: [],
		});
		const success = createLearningEvidenceEvent("student", {
			concept_id: conceptId,
			kind: "application",
			result: "correct",
			hint_level: 0,
			evaluator: "teacher",
			evaluator_confidence: 1,
		}, new Date("2026-08-09T00:00:00.000Z"));
		const projected = projectLearnerKnowledge(
			profile,
			[success],
			new Date("2026-08-10T00:00:00.000Z"),
		)[0];

		expect(applyDerivedKnowledgeState(profile, projected)).toBe(true);
		const afterRotation = projectLearnerKnowledge(
			profile,
			[],
			new Date("2026-08-11T00:00:00.000Z"),
		)[0];
		expect(afterRotation.mastery).toBeCloseTo(projected.mastery, 8);
		expect(afterRotation.retrieval_count).toBe(1);
		expect(afterRotation.last_result).toBe("correct");
		expect(afterRotation.last_successful_retrieval_at).toBe("2026-08-09T00:00:00.000Z");
		expect(profile.knowledge_states[0].confidence).toBe(projected.estimate_confidence);
		expect(profile.knowledge_states[0].stability).toBeCloseTo(projected.stability_days / 7, 8);
		expect(profile.knowledge_states[0].last_practiced_at).toBe("2026-08-09T00:00:00.000Z");
	});

	it("moves only an explicitly linked, reliably repaired misconception out of active", () => {
		const profile = createDefaultProfile("student");
		profile.misconceptions.push({
			misconception_id: "misc_force_direction",
			concept_id: conceptId,
			description: "把运动方向当成额外受力",
			status: "active",
			severity: 0.8,
			confidence: 0.9,
			first_seen_at: "2026-08-01T00:00:00.000Z",
			last_seen_at: "2026-08-01T00:00:00.000Z",
			evidence_ids: [],
			repair_strategy: "用受力图反例检查",
		});
		const repaired = createLearningEvidenceEvent("student", {
			concept_id: conceptId,
			kind: "application",
			result: "correct",
			hint_level: 0,
			evaluator: "teacher",
			evaluator_confidence: 1,
			misconception_id: "misc_force_direction",
		}, new Date("2026-08-09T00:00:00.000Z")).evidence!;

		expect(applyEvidenceToLinkedMisconception(profile, repaired)).toBe(true);
		expect(profile.misconceptions[0].status).toBe("repairing");

		const relapsed = createLearningEvidenceEvent("student", {
			concept_id: conceptId,
			kind: "application",
			result: "incorrect",
			hint_level: 0,
			evaluator: "teacher",
			evaluator_confidence: 1,
			misconception_id: "misc_force_direction",
		}, new Date("2026-08-12T00:00:00.000Z")).evidence!;
		expect(applyEvidenceToLinkedMisconception(profile, relapsed)).toBe(true);
		expect(profile.misconceptions[0].status).toBe("active");
		expect(profile.misconceptions[0].last_seen_at).toBe("2026-08-12T00:00:00.000Z");
	});
});
