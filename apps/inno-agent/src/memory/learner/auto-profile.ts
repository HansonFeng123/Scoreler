import type {
	KnowledgeState,
	LearnerPreferences,
	LearnerProfile,
	LearningEvent,
	LearningGoal,
	Misconception,
} from "./types.js";

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function uniqueStrings(values: string[]): string[] {
	return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

function normalizeIdPart(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9._\-\u4e00-\u9fa5]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 64);
}

function payloadString(event: LearningEvent, key: string): string | undefined {
	const value = event.payload[key];
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function eventText(event: LearningEvent): string {
	const parts: string[] = [];
	for (const value of Object.values(event.payload)) {
		if (typeof value === "string") parts.push(value);
		if (Array.isArray(value)) {
			parts.push(...value.filter((item): item is string => typeof item === "string"));
		}
	}
	if (event.context.goal_id) parts.push(event.context.goal_id);
	if (event.context.concept_ids) parts.push(...event.context.concept_ids);
	return parts.join(" ");
}

function hasArchiveIntent(text: string): boolean {
	return /不学|不学习|不再学习|放弃|停止学习|取消.*目标|归档|archive|archived|stop learning|quit/i.test(text);
}

/**
 * Words that express the archiving intent itself rather than the topic.
 * Stripped before keyword extraction so "不再学习" never becomes a keyword.
 */
const INTENT_WORDS =
	/不再学习|不想学习|不想学|不学习|不学|停止学习|放弃学习|放弃|停止|取消|归档|别再学|目标|学习|stop learning|quit learning|quit|archived?|drop|learn|learning/gi;

/**
 * Extract topic keywords from free text: latin tokens (length >= 2, so
 * "c++" / "ts" / "go" survive) and CJK bigrams (so "吉他入门" still matches
 * a goal titled "吉他"). A lone CJK character yields no bigrams, so it is
 * kept as a unigram — otherwise a single-char topic ("琴") could never match
 * anything. Returns lowercase keywords.
 */
function extractTopicKeywords(text: string): string[] {
	const cleaned = text.toLowerCase().replace(INTENT_WORDS, " ");
	const keywords: string[] = [];
	for (const match of cleaned.matchAll(/[a-z0-9][a-z0-9+#._-]*/g)) {
		if (match[0].length >= 2) keywords.push(match[0]);
	}
	for (const match of cleaned.matchAll(/[一-鿿]+/g)) {
		const run = match[0];
		if (run.length === 1) {
			keywords.push(run);
			continue;
		}
		for (let i = 0; i < run.length - 1; i++) keywords.push(run.slice(i, i + 2));
	}
	return keywords;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Generic topic matcher: does the archive target mention anything the
 * haystack (goal title / concept id / domain) talks about? Replaces the
 * former hardcoded rust|c++|python|typescript regexes that silently failed
 * for every other topic.
 *
 * Matching rules: latin keywords of 3+ chars match as substrings ("rust" in
 * "rust-ownership"); 2-char tokens ("go", "ts") require a non-alphanumeric
 * boundary to avoid "go" matching "good habits". CJK bigrams match as
 * substrings.
 */
function topicKeywordsMatch(haystack: string, targetText: string): boolean {
	for (const keyword of extractTopicKeywords(targetText)) {
		if (/^[a-z0-9+#._-]+$/.test(keyword) && keyword.length === 2) {
			if (new RegExp(`(^|[^a-z0-9])${escapeRegExp(keyword)}([^a-z0-9]|$)`, "i").test(haystack)) return true;
			continue;
		}
		if (haystack.includes(keyword)) return true;
	}
	return false;
}

function targetMatchesGoal(goal: LearningGoal, targetText: string, targetGoalId?: string): boolean {
	const haystack = `${goal.goal_id} ${goal.title}`.toLowerCase();
	const target = targetText.toLowerCase();
	if (targetGoalId && goal.goal_id === targetGoalId) return true;
	// Empty id/title must never match — includes("") is always true.
	if (goal.goal_id && target.includes(goal.goal_id.toLowerCase())) return true;
	if (goal.title && target.includes(goal.title.toLowerCase())) return true;

	return topicKeywordsMatch(haystack, target);
}

function archiveMatchingGoals(profile: LearnerProfile, targetText: string, timestamp: string, targetGoalId?: string): boolean {
	let changed = false;
	for (const goal of profile.goals) {
		if (!targetMatchesGoal(goal, targetText, targetGoalId)) continue;
		if (goal.status !== "archived" || goal.priority !== 0 || goal.updated_at !== timestamp) {
			goal.status = "archived";
			goal.priority = 0;
			goal.updated_at = timestamp;
			changed = true;
		}
	}
	return changed;
}

function targetMatchesKnowledge(state: KnowledgeState, targetText: string): boolean {
	const haystack = `${state.concept_id} ${state.concept_name} ${state.domain}`.toLowerCase();
	const target = targetText.toLowerCase();
	// Empty concept_id must never match — includes("") is always true.
	if (state.concept_id && target.includes(state.concept_id.toLowerCase())) return true;
	return topicKeywordsMatch(haystack, target);
}

function archiveMatchingKnowledge(profile: LearnerProfile, targetText: string): boolean {
	let changed = false;
	for (const state of profile.knowledge_states) {
		if (!targetMatchesKnowledge(state, targetText)) continue;
		const diagnosis = "相关学习目标已归档；除非用户重新提出该方向，否则不再主动安排该概念学习。";
		if (
			state.diagnosis !== diagnosis ||
			state.next_actions.length > 0 ||
			state.review_due_at !== undefined
		) {
			state.diagnosis = diagnosis;
			state.next_actions = [];
			delete state.review_due_at;
			changed = true;
		}
	}
	return changed;
}

function titleFromConceptId(conceptId: string): string {
	const last = conceptId.split(/[._/]/).filter(Boolean).at(-1) ?? conceptId;
	return last.replace(/[_-]+/g, " ");
}

function inferDomain(conceptId: string): string {
	const parts = conceptId.split(".");
	return parts.length > 1 ? parts.slice(0, -1).join(".") : "general";
}

function mapPreference(raw: string): Partial<LearnerPreferences> {
	const text = raw.trim();
	const lowered = text.toLowerCase();
	if (!text) return {};

	if (text.includes("避免") || lowered.startsWith("avoid")) {
		return { avoid: [text.replace(/^避免[:：]?\s*/, "")] };
	}
	if (lowered.includes("code") || text.includes("代码")) {
		return { explanation_style: ["code_first"] };
	}
	if (lowered.includes("example") || text.includes("例子") || text.includes("示例")) {
		return { explanation_style: ["example_first"] };
	}
	if (text.includes("理论") || lowered.includes("theory")) {
		return { explanation_style: ["theory_first"] };
	}
	if (text.includes("小步") || lowered.includes("small")) {
		return { practice_style: ["small_steps"] };
	}
	if (text.includes("即时") || text.includes("反馈") || lowered.includes("feedback")) {
		return { practice_style: ["immediate_feedback"], feedback_tone: ["encouraging"] };
	}
	if (text.includes("鼓励") || lowered.includes("encourag")) {
		return { feedback_tone: ["encouraging"] };
	}
	if (text.includes("苏格拉底") || lowered.includes("socratic")) {
		return { feedback_tone: ["socratic"] };
	}
	return {};
}

function mergePreferences(profile: LearnerProfile, incoming: Partial<LearnerPreferences>): void {
	profile.preferences = {
		explanation_style: uniqueStrings([
			...profile.preferences.explanation_style,
			...(incoming.explanation_style ?? []),
		]),
		practice_style: uniqueStrings([
			...profile.preferences.practice_style,
			...(incoming.practice_style ?? []),
		]),
		feedback_tone: uniqueStrings([
			...profile.preferences.feedback_tone,
			...(incoming.feedback_tone ?? []),
		]),
		avoid: uniqueStrings([...profile.preferences.avoid, ...(incoming.avoid ?? [])]),
	};
}

function ensureKnowledgeState(profile: LearnerProfile, conceptId: string): KnowledgeState {
	let state = profile.knowledge_states.find((ks) => ks.concept_id === conceptId);
	if (state) return state;

	state = {
		concept_id: conceptId,
		concept_name: titleFromConceptId(conceptId),
		domain: inferDomain(conceptId),
		mastery: 0.05,
		confidence: 0.35,
		stability: 0.1,
		evidence_ids: [],
		diagnosis: "有学习接触记录，尚未形成稳定掌握度判断。",
		next_actions: ["继续通过讲解、练习或复盘补充证据。"],
	};
	profile.knowledge_states.push(state);
	return state;
}

/**
 * Fixed mastery increments per event type, applied only when an event carries
 * no explicit `derived_signals.mastery_delta`.
 *
 * HONESTY NOTE: these are hand-tuned heuristics, not a calibrated model
 * (no forgetting curve, no item difficulty). `mastery` / `confidence` /
 * `stability` in the profile should be read as relative ordering signals
 * ("which concept needs review first"), never as probabilities.
 */
export const MASTERY_DELTAS: Partial<Record<LearningEvent["event_type"], number>> = {
	exercise_attempt: 0.03,
	milestone_reached: 0.02,
	self_assessed: 0.01,
};

function updateKnowledgeFromEvent(profile: LearnerProfile, event: LearningEvent): boolean {
	const conceptIds = event.context.concept_ids ?? [];
	if (conceptIds.length === 0) return false;

	// Being shown an explanation is exposure, not evidence that the learner can
	// retrieve or apply the concept. Keep accepting mastery_delta on legacy
	// events for compatibility, but never let concept_explained promote mastery.
	const delta =
		event.event_type === "concept_explained"
			? 0
			: typeof event.derived_signals?.mastery_delta === "number"
				? event.derived_signals.mastery_delta
				: (MASTERY_DELTAS[event.event_type] ?? 0);

	let changed = false;
	for (const conceptId of conceptIds) {
		const state = ensureKnowledgeState(profile, conceptId);
		const hasSeenEvidence = state.evidence_ids.includes(event.event_id);
		const eventIsNewer =
			!state.last_practiced_at || Date.parse(event.timestamp) >= Date.parse(state.last_practiced_at);
		if (!state.evidence_ids.includes(event.event_id)) {
			state.evidence_ids.push(event.event_id);
			changed = true;
		}

		if (delta !== 0 && !hasSeenEvidence) {
			state.mastery = clamp01(state.mastery + delta);
			state.confidence = clamp01(Math.max(state.confidence, 0.45) + Math.abs(delta) * 0.2);
			state.stability = clamp01(state.stability + Math.max(0, delta) * 0.15);
			changed = true;
		}

		if (eventIsNewer && state.last_practiced_at !== event.timestamp) {
			state.last_practiced_at = event.timestamp;
			changed = true;
		}
		if (eventIsNewer && (event.event_type === "exercise_attempt" || event.event_type === "concept_explained")) {
			const due = new Date(event.timestamp);
			due.setDate(due.getDate() + (state.mastery < 0.4 ? 1 : state.mastery < 0.75 ? 3 : 7));
			const nextReview = due.toISOString();
			if (state.review_due_at !== nextReview) {
				state.review_due_at = nextReview;
				changed = true;
			}
		}

		const topic =
			typeof event.payload.topic === "string"
				? event.payload.topic
				: typeof event.payload.concept === "string"
					? event.payload.concept
					: typeof event.payload.summary === "string"
						? event.payload.summary
				: undefined;
		if (topic && eventIsNewer) {
			const before = JSON.stringify({
				diagnosis: state.diagnosis,
				next_actions: state.next_actions,
			});
			state.diagnosis = `最近学习/讨论了「${topic}」，需要后续练习验证掌握度。`;
			state.next_actions = uniqueStrings([
				`用自己的话复述 ${state.concept_name} 的核心机制。`,
				`完成一个小练习来验证 ${state.concept_name} 的掌握情况。`,
				...state.next_actions,
			]).slice(0, 5);
			const after = JSON.stringify({
				diagnosis: state.diagnosis,
				next_actions: state.next_actions,
			});
			if (before !== after) changed = true;
		}
	}
	return changed;
}

function updateGoalFromEvent(profile: LearnerProfile, event: LearningEvent): boolean {
	if (event.event_type !== "goal_declared") return false;
	const text = eventText(event);
	const rawGoal = payloadString(event, "goal");
	const previousGoal = payloadString(event, "previous_goal");
	const goalDescription = payloadString(event, "goal_description");
	let changed = false;

	if (previousGoal && hasArchiveIntent(text)) {
		changed = archiveMatchingGoals(profile, previousGoal, event.timestamp) || changed;
		changed = archiveMatchingKnowledge(profile, previousGoal) || changed;
	}

	if (hasArchiveIntent(text)) {
		const archiveTarget = goalDescription ?? previousGoal ?? rawGoal ?? text;
		changed = archiveMatchingGoals(profile, archiveTarget, event.timestamp, event.context.goal_id) || changed;
		changed = archiveMatchingKnowledge(profile, archiveTarget) || changed;
	}

	if (!rawGoal || hasArchiveIntent(rawGoal)) return changed;

	const goalId = event.context.goal_id ?? `goal_${normalizeIdPart(rawGoal)}`;
	const existing = profile.goals.find((g) => g.goal_id === goalId);
	const before = existing ? JSON.stringify(existing) : undefined;
	const goal: LearningGoal = existing ?? {
		goal_id: goalId,
		title: rawGoal,
		type: "skill",
		priority: 0.8,
		status: "active",
		success_criteria: [],
		source: "user_declared",
		updated_at: event.timestamp,
	};

	goal.title = rawGoal;
	goal.status = "active";
	if (goal.priority <= 0) goal.priority = 0.8;
	goal.updated_at = event.timestamp;
	if (!existing) profile.goals.push(goal);
	return changed || !existing || before !== JSON.stringify(goal);
}

function updatePreferencesFromEvent(profile: LearnerProfile, event: LearningEvent): boolean {
	const candidates = [
		...(event.derived_signals?.preference_candidates ?? []),
		...(event.event_type === "preference_stated" && typeof event.payload.preference === "string"
			? [event.payload.preference]
			: []),
	];
	if (candidates.length === 0) return false;

	const before = JSON.stringify(profile.preferences);
	for (const candidate of candidates) {
		mergePreferences(profile, mapPreference(candidate));
	}
	return JSON.stringify(profile.preferences) !== before;
}

function updateMisconceptionsFromEvent(profile: LearnerProfile, event: LearningEvent): boolean {
	const candidates = event.derived_signals?.misconception_candidates ?? [];
	if (candidates.length === 0) return false;
	const conceptId = event.context.concept_ids?.[0] ?? "general";
	let changed = false;
	for (const description of candidates) {
		const trimmed = description.trim();
		if (!trimmed) continue;
		const id = `misc_${normalizeIdPart(trimmed).slice(0, 24)}`;
		let m = profile.misconceptions.find((x) => x.misconception_id === id);
		if (!m) {
			m = {
				misconception_id: id,
				concept_id: conceptId,
				description: trimmed,
				status: "active",
				severity: 0.5,
				confidence: 0.4,
				first_seen_at: event.timestamp,
				last_seen_at: event.timestamp,
				evidence_ids: [event.event_id],
				repair_strategy: "",
			} satisfies Misconception;
			profile.misconceptions.push(m);
			changed = true;
		} else if (!m.evidence_ids.includes(event.event_id)) {
			m.evidence_ids.push(event.event_id);
			m.last_seen_at = event.timestamp;
			changed = true;
		}
	}
	return changed;
}

function appendSummary(profile: LearnerProfile, event: LearningEvent): boolean {
	const conceptIds = event.context.concept_ids ?? [];
	const label =
		typeof event.payload.topic === "string"
			? event.payload.topic
			: typeof event.payload.concept === "string"
				? event.payload.concept
				: typeof event.payload.goal === "string"
					? event.payload.goal
					: typeof event.payload.goal_description === "string"
						? event.payload.goal_description
						: conceptIds[0];

	if (!label) return false;

	const sentence = `最近记录：${label}（${event.event_type}，${event.timestamp.slice(0, 10)}）。`;
	if (profile.profile_summary.includes(sentence)) return false;

	const base = profile.profile_summary.trim();
	profile.profile_summary = base ? `${base}\n${sentence}` : sentence;
	const lines = profile.profile_summary.split("\n").filter(Boolean);
	profile.profile_summary = lines.slice(Math.max(0, lines.length - 8)).join("\n");
	return true;
}

export interface ApplyLearningEventOptions {
	updateSummary?: boolean;
}

export function learningEventSummarySentence(event: LearningEvent): string | undefined {
	const conceptIds = event.context.concept_ids ?? [];
	const label =
		typeof event.payload.topic === "string"
			? event.payload.topic
			: typeof event.payload.concept === "string"
				? event.payload.concept
				: typeof event.payload.goal === "string"
					? event.payload.goal
					: typeof event.payload.goal_description === "string"
						? event.payload.goal_description
						: conceptIds[0];

	if (!label) return undefined;
	return `最近记录：${label}（${event.event_type}，${event.timestamp.slice(0, 10)}）。`;
}

export function applyLearningEventToProfile(
	profile: LearnerProfile,
	event: LearningEvent,
	options: ApplyLearningEventOptions = {},
): boolean {
	let changed = false;
	changed = updateGoalFromEvent(profile, event) || changed;
	changed = updateKnowledgeFromEvent(profile, event) || changed;
	changed = updatePreferencesFromEvent(profile, event) || changed;
	changed = updateMisconceptionsFromEvent(profile, event) || changed;
	if (options.updateSummary ?? true) {
		changed = appendSummary(profile, event) || changed;
	}
	return changed;
}
