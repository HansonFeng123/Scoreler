import { describe, expect, it } from "vitest";
import { resolvePrerequisites, type PrerequisiteEdge } from "./prerequisite-resolver.js";
import { evaluateTeachingEntry, formatTeachingEntryDecision } from "./teaching-entry-gate.js";
import type { DerivedKnowledgeState, KnowledgeStateLabel } from "./types.js";

const target = "physics.inclined_plane_acceleration";
const prerequisite = "physics.force_decomposition";

function edge(overrides: Partial<PrerequisiteEdge> = {}): PrerequisiteEdge {
	return {
		target_concept_id: target,
		prerequisite_concept_id: prerequisite,
		relation: "required",
		required_level: 0.65,
		importance: 0.9,
		source: "teacher",
		source_confidence: 0.9,
		rationale: "需要先把重力分解到斜面方向。",
		...overrides,
	};
}

function state(label: KnowledgeStateLabel, mastery = 0.8, confidence = 0.8): DerivedKnowledgeState {
	return {
		concept_id: prerequisite,
		concept_name: "力的分解",
		domain: "physics",
		mastery,
		estimate_confidence: confidence,
		stability_days: 5,
		retrievability: 0.9,
		exposure_count: 0,
		retrieval_count: 2,
		lapse_count: 0,
		successful_transfer_count: 0,
		active_misconception_ids: label === "misconception" ? ["misc_force_direction"] : [],
		evidence_ids: ["evd_1"],
		state_label: label,
		diagnosis: "",
		next_actions: [],
	};
}

describe("prerequisite resolver", () => {
	it("teaches an atomic concept directly without tracing further", () => {
		const result = resolvePrerequisites(target, [edge()], [], { isAtomic: true });
		expect(result.action).toBe("direct");
		expect(result.assessments).toEqual([]);
	});

	it("diagnoses an unknown required prerequisite instead of assuming mastery or failure", () => {
		const result = resolvePrerequisites(target, [edge()], []);
		expect(result.action).toBe("diagnose");
		expect(result.assessments[0].status).toBe("uncertain");
	});

	it("proceeds when reliable evidence satisfies the task requirement", () => {
		const result = resolvePrerequisites(target, [edge()], [state("fragile")]);
		expect(result.action).toBe("proceed");
		expect(result.assessments[0].status).toBe("satisfied");
	});

	it("uses a fresh successful diagnostic for the current task without claiming long-term mastery", () => {
		const demonstrated = state("fragile", 0.35, 0.6);
		demonstrated.last_result = "correct";
		const result = resolvePrerequisites(target, [edge()], [demonstrated]);
		expect(result.action).toBe("proceed");
		expect(result.assessments[0].estimated_mastery).toBeLessThan(0.65);
	});

	it("teaches a reliably missing prerequisite and repairs a misconception first", () => {
		expect(resolvePrerequisites(target, [edge()], [state("learning", 0.2)]).action).toBe("teach");
		expect(resolvePrerequisites(target, [edge()], [state("misconception", 0.8)]).action).toBe("repair");
	});

	it("returns a stop-and-wait response contract for an interactive prerequisite action", () => {
		const decision = evaluateTeachingEntry({
			target_concept_id: target,
			mode: "learning",
			is_atomic: false,
			prerequisites: [edge()],
		}, [state("misconception", 0.8)]);
		const formatted = formatTeachingEntryDecision(decision);
		expect(formatted).toContain("下一条回复协议（必须遵守）");
		expect(formatted).toContain("不得给出原题的完整推导、公式或结论");
		expect(formatted).toContain("问完立即停止并等待学生回答");
	});

	it("does not let a low-confidence model inference directly block the task", () => {
		const inferred = edge({ source: "model_inferred", source_confidence: 0.3 });
		const result = resolvePrerequisites(target, [inferred], [state("learning", 0.2)]);
		expect(result.action).toBe("diagnose");
		expect(result.assessments[0].recommended_action).toBe("diagnose");
	});

	it("never lets supporting concepts crowd a required blocker out of the decision", () => {
		const supporting = [1, 2, 3].map((index) => edge({
			prerequisite_concept_id: `physics.supporting_${index}`,
			relation: "supporting",
			importance: 1,
		}));
		const required = edge({ importance: 0.1 });

		const result = resolvePrerequisites(target, [...supporting, required], [], {
			maxActivePrerequisites: 3,
		});
		expect(result.action).toBe("diagnose");
		expect(result.assessments.slice(0, 3).some((item) => (
			item.prerequisite_concept_id === prerequisite
		))).toBe(true);
	});

	it("bypasses diagnosis for direct-task mode", () => {
		const result = evaluateTeachingEntry({
			target_concept_id: target,
			mode: "direct_task",
			is_atomic: false,
			prerequisites: [edge()],
		}, []);
		expect(result.action).toBe("direct");
		expect(result.diagnostics_allowed).toBe(false);
	});
});
