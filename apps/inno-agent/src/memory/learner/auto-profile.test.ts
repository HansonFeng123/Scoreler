import { describe, expect, it } from "vitest";
import { applyLearningEventToProfile, MASTERY_DELTAS } from "./auto-profile.js";
import { createDefaultProfile, createLearningEvent, type LearningGoal } from "./types.js";

function makeGoal(title: string, overrides: Partial<LearningGoal> = {}): LearningGoal {
	return {
		goal_id: `goal_${title}`,
		title,
		type: "skill",
		priority: 0.8,
		status: "active",
		success_criteria: [],
		source: "user_declared",
		updated_at: "2026-08-01T00:00:00.000Z",
		...overrides,
	};
}

function archiveEvent(goalDescription: string) {
	return createLearningEvent("default", "goal_declared", {}, {
		goal_description: goalDescription,
		action: "archived",
	});
}

describe("goal archiving: generic topic matching", () => {
	it("archives a non-programming goal (the hardcoded-regex blind spot)", () => {
		const profile = createDefaultProfile();
		profile.goals.push(makeGoal("吉他入门"));

		const changed = applyLearningEventToProfile(profile, archiveEvent("不再学习吉他"), { updateSummary: false });

		expect(changed).toBe(true);
		expect(profile.goals[0].status).toBe("archived");
		expect(profile.goals[0].priority).toBe(0);
	});

	it("still archives programming-language goals after the regex removal", () => {
		const profile = createDefaultProfile();
		profile.goals.push(makeGoal("Rust 所有权进阶"));

		applyLearningEventToProfile(profile, archiveEvent("stop learning rust"), { updateSummary: false });

		expect(profile.goals[0].status).toBe("archived");
	});

	it("matches a partial topic mention against a longer goal title", () => {
		const profile = createDefaultProfile();
		profile.goals.push(makeGoal("高等数学·微积分专项"));

		applyLearningEventToProfile(profile, archiveEvent("我不想学数学了"), { updateSummary: false });

		expect(profile.goals[0].status).toBe("archived");
	});

	it("does not archive goals on unrelated text", () => {
		const profile = createDefaultProfile();
		profile.goals.push(makeGoal("吉他入门"));

		applyLearningEventToProfile(profile, archiveEvent("我不想学做饭了"), { updateSummary: false });

		expect(profile.goals[0].status).toBe("active");
	});

	it("matches 2-char language tokens only on word boundaries", () => {
		const profile = createDefaultProfile();
		profile.goals.push(makeGoal("Build good habits"));

		// "go" must not substring-match "good".
		applyLearningEventToProfile(profile, archiveEvent("stop learning go"), { updateSummary: false });

		expect(profile.goals[0].status).toBe("active");
	});

	it("archives knowledge states tied to the archived topic", () => {
		const profile = createDefaultProfile();
		profile.goals.push(makeGoal("吉他入门"));
		applyLearningEventToProfile(
			profile,
			createLearningEvent("default", "concept_explained", { concept_ids: ["music.吉他基础和弦"] }, { topic: "吉他和弦" }),
			{ updateSummary: false },
		);
		expect(profile.knowledge_states[0].next_actions.length).toBeGreaterThan(0);

		applyLearningEventToProfile(profile, archiveEvent("不再学习吉他"), { updateSummary: false });

		expect(profile.knowledge_states[0].next_actions).toEqual([]);
		expect(profile.knowledge_states[0].diagnosis).toContain("归档");
	});

	it("matches a single-char CJK topic against a longer goal title", () => {
		const profile = createDefaultProfile();
		profile.goals.push(makeGoal("钢琴入门"));

		// "琴" is a lone CJK char after intent stripping — no bigram exists,
		// so only the unigram fallback can match it.
		applyLearningEventToProfile(profile, archiveEvent("不学琴"), { updateSummary: false });

		expect(profile.goals[0].status).toBe("archived");
	});

	it("never matches a goal with an empty title (includes(\"\") is always true)", () => {
		const profile = createDefaultProfile();
		profile.goals.push(makeGoal("", { goal_id: "goal_empty" }));

		applyLearningEventToProfile(profile, archiveEvent("不再学习吉他"), { updateSummary: false });

		expect(profile.goals[0].status).toBe("active");
	});

	it("never matches a knowledge state with an empty concept_id", () => {
		const profile = createDefaultProfile();
		applyLearningEventToProfile(
			profile,
			createLearningEvent("default", "concept_explained", { concept_ids: [""] }, { topic: "x" }),
			{ updateSummary: false },
		);
		const state = profile.knowledge_states.find((s) => s.concept_id === "");
		expect(state).toBeDefined();
		const actionsBefore = state!.next_actions.length;

		applyLearningEventToProfile(profile, archiveEvent("不再学习吉他"), { updateSummary: false });

		// A match would have cleared next_actions; they must be untouched.
		expect(state!.next_actions).toHaveLength(actionsBefore);
	});
});

describe("mastery deltas", () => {
	it("applies the documented fixed increments per event type", () => {
		const profile = createDefaultProfile();
		const ctx = { concept_ids: ["programming.python.decorators"] };

		applyLearningEventToProfile(profile, createLearningEvent("default", "exercise_attempt", ctx, {}), { updateSummary: false });
		const after = profile.knowledge_states[0].mastery;

		// Initial mastery is 0.05 (ensureKnowledgeState), then +MASTERY_DELTAS.exercise_attempt.
		expect(MASTERY_DELTAS.exercise_attempt).toBe(0.03);
		expect(after).toBeCloseTo(0.05 + 0.03, 6);
	});

	it("prefers an explicit derived_signals.mastery_delta over the defaults", () => {
		const profile = createDefaultProfile();
		applyLearningEventToProfile(
			profile,
			createLearningEvent("default", "exercise_attempt", { concept_ids: ["a.b"] }, {}, { mastery_delta: -0.02 }),
			{ updateSummary: false },
		);
		expect(profile.knowledge_states[0].mastery).toBeCloseTo(0.05 - 0.02, 6);
	});

	it("never counts the same event twice (evidence idempotency)", () => {
		const profile = createDefaultProfile();
		const event = createLearningEvent("default", "concept_explained", { concept_ids: ["a.b"] }, {});
		applyLearningEventToProfile(profile, event, { updateSummary: false });
		const once = profile.knowledge_states[0].mastery;
		applyLearningEventToProfile(profile, event, { updateSummary: false });
		expect(profile.knowledge_states[0].mastery).toBe(once);
	});
});
