import { randomUUID } from "node:crypto";
import type { IncomingMessage as HttpReq, ServerResponse } from "node:http";
import { loadProfile, saveProfile } from "../../memory/learner/profile-store.js";
import type {
	KnowledgeState,
	LearnerPreferences,
	LearnerProfile,
	LearningGoal,
	Misconception,
} from "../../memory/learner/types.js";
import type { RuntimePaths } from "../../runtime.js";
import { json, matchRoute, readBody } from "../http-helpers.js";

export interface LearnerRouteContext {
	paths: RuntimePaths;
}

// ---------------------------------------------------------------------------
// Helpers moved verbatim from server.ts (P2 route split)
// ---------------------------------------------------------------------------

function clamp01(n: number): number {
	if (!Number.isFinite(n)) return 0;
	if (n < 0) return 0;
	if (n > 1) return 1;
	return n;
}

function normalizePreferences(input: Partial<LearnerPreferences>): LearnerPreferences {
	function arr(value: unknown): string[] {
		if (!Array.isArray(value)) return [];
		return value.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
	}
	return {
		explanation_style: arr(input.explanation_style),
		practice_style: arr(input.practice_style),
		feedback_tone: arr(input.feedback_tone),
		avoid: arr(input.avoid),
	};
}

/**
 * /api/learner/* route domain (L1 profile inspect/edit). Returns true when
 * the request was handled. Extracted verbatim from server.ts during the P2
 * route split — behavior unchanged.
 */
export async function handleLearnerRoutes(
	req: HttpReq,
	res: ServerResponse,
	method: string,
	url: string,
	ctx: LearnerRouteContext,
): Promise<boolean> {
	const { paths } = ctx;

	// --- Learner profile API (L1) ---
	if (method === "GET" && url === "/api/learner/profile") {
		const profile = loadProfile(paths.learnerDataDir);
		json(res, 200, profile);
		return true;
	}

	if (method === "PATCH" && url === "/api/learner/profile") {
		const body = await readBody(req) as Partial<LearnerProfile>;
		const profile = loadProfile(paths.learnerDataDir);
		if (typeof body.profile_summary === "string") {
			profile.profile_summary = body.profile_summary;
		}
		if (body.preferences && typeof body.preferences === "object") {
			profile.preferences = normalizePreferences(body.preferences as Partial<LearnerPreferences>);
		}
		saveProfile(paths.learnerDataDir, profile);
		json(res, 200, profile);
		return true;
	}

	if (method === "POST" && url === "/api/learner/profile/goals") {
		const body = await readBody(req) as Partial<LearningGoal>;
		const profile = loadProfile(paths.learnerDataDir);
		const goal: LearningGoal = {
			goal_id: `goal_${randomUUID().slice(0, 8)}`,
			title: typeof body.title === "string" ? body.title : "新目标",
			type: (body.type as LearningGoal["type"]) || "skill",
			priority: typeof body.priority === "number" ? body.priority : 0.5,
			status: (body.status as LearningGoal["status"]) || "active",
			success_criteria: Array.isArray(body.success_criteria) ? body.success_criteria.filter((s) => typeof s === "string") : [],
			source: "user_declared",
			updated_at: new Date().toISOString(),
		};
		profile.goals = [goal, ...profile.goals];
		saveProfile(paths.learnerDataDir, profile);
		json(res, 201, goal);
		return true;
	}

	const goalPatchMatch = matchRoute("PATCH", method, url, "/api/learner/profile/goals/:goalId");
	if (goalPatchMatch) {
		const body = await readBody(req) as Partial<LearningGoal>;
		const profile = loadProfile(paths.learnerDataDir);
		const index = profile.goals.findIndex((g) => g.goal_id === goalPatchMatch.goalId);
		if (index < 0) {
			json(res, 404, { error: "Goal not found" });
			return true;
		}
		const current = profile.goals[index];
		profile.goals[index] = {
			...current,
			title: typeof body.title === "string" ? body.title : current.title,
			type: (body.type as LearningGoal["type"]) ?? current.type,
			priority: typeof body.priority === "number" ? body.priority : current.priority,
			status: (body.status as LearningGoal["status"]) ?? current.status,
			success_criteria: Array.isArray(body.success_criteria)
				? body.success_criteria.filter((s) => typeof s === "string")
				: current.success_criteria,
			updated_at: new Date().toISOString(),
		};
		saveProfile(paths.learnerDataDir, profile);
		json(res, 200, profile.goals[index]);
		return true;
	}

	const goalDeleteMatch = matchRoute("DELETE", method, url, "/api/learner/profile/goals/:goalId");
	if (goalDeleteMatch) {
		const profile = loadProfile(paths.learnerDataDir);
		const before = profile.goals.length;
		profile.goals = profile.goals.filter((g) => g.goal_id !== goalDeleteMatch.goalId);
		if (profile.goals.length === before) {
			json(res, 404, { error: "Goal not found" });
			return true;
		}
		saveProfile(paths.learnerDataDir, profile);
		json(res, 200, { deleted: true });
		return true;
	}

	const knowledgePatchMatch = matchRoute("PATCH", method, url, "/api/learner/profile/knowledge/:conceptId");
	if (knowledgePatchMatch) {
		const body = await readBody(req) as Partial<KnowledgeState>;
		const profile = loadProfile(paths.learnerDataDir);
		const index = profile.knowledge_states.findIndex((k) => k.concept_id === knowledgePatchMatch.conceptId);
		if (index < 0) {
			json(res, 404, { error: "Concept not found" });
			return true;
		}
		const current = profile.knowledge_states[index];
		profile.knowledge_states[index] = {
			...current,
			mastery: typeof body.mastery === "number" ? clamp01(body.mastery) : current.mastery,
			confidence: typeof body.confidence === "number" ? clamp01(body.confidence) : current.confidence,
			stability: typeof body.stability === "number" ? clamp01(body.stability) : current.stability,
			diagnosis: typeof body.diagnosis === "string" ? body.diagnosis : current.diagnosis,
			next_actions: Array.isArray(body.next_actions)
				? body.next_actions.filter((s) => typeof s === "string")
				: current.next_actions,
		};
		saveProfile(paths.learnerDataDir, profile);
		json(res, 200, profile.knowledge_states[index]);
		return true;
	}

	const misconceptionPatchMatch = matchRoute("PATCH", method, url, "/api/learner/profile/misconceptions/:miscId");
	if (misconceptionPatchMatch) {
		const body = await readBody(req) as Partial<Misconception>;
		const profile = loadProfile(paths.learnerDataDir);
		const index = profile.misconceptions.findIndex((m) => m.misconception_id === misconceptionPatchMatch.miscId);
		if (index < 0) {
			json(res, 404, { error: "Misconception not found" });
			return true;
		}
		const current = profile.misconceptions[index];
		profile.misconceptions[index] = {
			...current,
			status: (body.status as Misconception["status"]) ?? current.status,
			severity: typeof body.severity === "number" ? clamp01(body.severity) : current.severity,
			repair_strategy: typeof body.repair_strategy === "string" ? body.repair_strategy : current.repair_strategy,
			last_seen_at: new Date().toISOString(),
		};
		saveProfile(paths.learnerDataDir, profile);
		json(res, 200, profile.misconceptions[index]);
		return true;
	}

	return false;
}
