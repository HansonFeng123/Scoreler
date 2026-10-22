import { describe, expect, it } from "vitest";
import { buildContextPack, formatContextPackForPrompt } from "./context-pack.js";
import { createLearningEvidenceEvent } from "./evidence.js";
import { createDefaultProfile } from "./types.js";

describe("learner context pack v2", () => {
	it("injects evidence-derived state and current retrievability", () => {
		const event = createLearningEvidenceEvent("student", {
			concept_id: "physics.force_decomposition",
			kind: "application",
			result: "correct",
			hint_level: 0,
			evaluator: "teacher",
			evaluator_confidence: 1,
		}, new Date("2026-08-01T00:00:00.000Z"));
		const pack = buildContextPack(
			createDefaultProfile("student"),
			[event],
			{ asOf: new Date("2026-08-02T00:00:00.000Z") },
		);

		expect(pack.relevant_concepts[0]).toMatchObject({
			concept_id: "physics.force_decomposition",
			state_label: "fragile",
		});
		expect(pack.relevant_concepts[0].retrievability).toBeTypeOf("number");
		const prompt = formatContextPackForPrompt(pack);
		expect(prompt).toContain("当前可提取概率");
		expect(prompt).toContain("建议：");
	});

	it("keeps legacy fixed review dates during migration", () => {
		const profile = createDefaultProfile("student");
		profile.knowledge_states.push({
			concept_id: "math.fractions",
			concept_name: "分数",
			domain: "math",
			mastery: 0.5,
			confidence: 0.5,
			stability: 0.3,
			review_due_at: "2026-08-01T00:00:00.000Z",
			evidence_ids: [],
			diagnosis: "旧画像",
			next_actions: [],
		});
		const pack = buildContextPack(profile, [], { asOf: new Date("2026-08-02T00:00:00.000Z") });
		expect(pack.review_due_concepts?.[0].concept_id).toBe("math.fractions");
	});
});
