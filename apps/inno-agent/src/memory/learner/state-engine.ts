import { collectLearningEvidence, evidenceWeight } from "./evidence.js";
import type {
	DerivedKnowledgeState,
	KnowledgeState,
	LearnerProfile,
	LearningEvidence,
	LearningEvent,
} from "./types.js";

const LEARNING_RATE = 0.35;
const REVIEW_RETRIEVABILITY_THRESHOLD = 0.7;

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function validTime(value?: string): number | undefined {
	if (!value) return undefined;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function resultValue(evidence: LearningEvidence): number | undefined {
	// The categorical result is the authoritative rubric outcome. A model can
	// accidentally emit contradictory fields (for example, result=incorrect
	// with score=1); constrain the optional score to the selected result band
	// so malformed evidence can never invert the learning signal.
	if (evidence.result === "correct") return clamp(evidence.score ?? 1, 0.8, 1);
	if (evidence.result === "partial") return clamp(evidence.score ?? 0.5, 0.2, 0.79);
	if (evidence.result === "incorrect") return 0;
	return undefined;
}

function isRetrieval(evidence: LearningEvidence): boolean {
	return evidence.kind === "guided_recall"
		|| evidence.kind === "free_recall"
		|| evidence.kind === "application"
		|| evidence.kind === "transfer";
}

export function calculateRetrievability(
	lastSuccessfulRetrievalAt: string | undefined,
	stabilityDays: number,
	asOf: Date,
): number | undefined {
	const last = validTime(lastSuccessfulRetrievalAt);
	if (last === undefined) return undefined;
	const elapsedDays = Math.max(0, (asOf.getTime() - last) / 86_400_000);
	return clamp(0.9 ** (elapsedDays / Math.max(0.25, stabilityDays)), 0, 1);
}

function nextReviewAt(lastSuccessfulRetrievalAt: string | undefined, stabilityDays: number): string | undefined {
	const last = validTime(lastSuccessfulRetrievalAt);
	if (last === undefined) return undefined;
	const elapsedDays = stabilityDays
		* (Math.log(REVIEW_RETRIEVABILITY_THRESHOLD) / Math.log(0.9));
	return new Date(last + elapsedDays * 86_400_000).toISOString();
}

function stateDescription(state: DerivedKnowledgeState): { diagnosis: string; nextActions: string[] } {
	switch (state.state_label) {
		case "misconception":
			return {
				diagnosis: "存在与当前概念相关的活跃误区，应先修复而不是继续叠加讲解。",
				nextActions: ["使用反例或表征转换定位并修复误区。"],
			};
		case "stable":
			return {
				diagnosis: "有多次可靠提取和迁移证据，当前状态较稳定。",
				nextActions: ["直接应用该概念，必要时安排更远迁移。"],
			};
		case "review_due":
			return {
				diagnosis: "曾有成功提取，但根据间隔时间当前可能需要唤醒。",
				nextActions: ["先做一次无提示的低成本提取，不要提前重新讲解。"],
			};
		case "fragile":
			return {
				diagnosis: "近期有成功表现，但稳定度或证据质量仍不足。",
				nextActions: ["用一道轻微变式验证能否独立应用。"],
			};
		case "learning":
			return {
				diagnosis: "已有接触或低质量证据，尚不能确认独立掌握。",
				nextActions: ["用一个最小任务诊断，而不是询问学习者是否会。"],
			};
		default:
			return {
				diagnosis: "没有足够可靠的学习证据，当前状态未知。",
				nextActions: ["仅在当前任务确实依赖该概念时进行一次低成本诊断。"],
			};
	}
}

export interface ProjectKnowledgeStateOptions {
	asOf?: Date;
	hasActiveMisconception?: boolean;
	activeMisconceptionIds?: string[];
}

export function projectKnowledgeState(
	base: KnowledgeState | undefined,
	conceptId: string,
	evidence: LearningEvidence[],
	options: ProjectKnowledgeStateOptions = {},
): DerivedKnowledgeState {
	const asOf = options.asOf ?? new Date();
	let mastery = clamp(base?.mastery ?? 0.05, 0, 1);
	let estimateConfidence = clamp(
		base?.estimate_confidence
			?? Math.min(base?.confidence ?? 0.1, (base?.evidence_ids.length ?? 0) > 0 ? 0.6 : 0.35),
		0,
		1,
	);
	let stabilityDays = clamp(base?.stability_days ?? Math.max(0.25, (base?.stability ?? 0.1) * 7), 0.25, 365);
	let lastEvidenceAt = base?.last_evidence_at ?? base?.last_practiced_at;
	let lastSuccessfulRetrievalAt = base?.last_successful_retrieval_at;
	let lastResult: LearningEvidence["result"] | undefined = base?.last_result;
	let exposureCount = base?.exposure_count ?? 0;
	let retrievalCount = base?.retrieval_count ?? 0;
	let lapseCount = base?.lapse_count ?? 0;
	let successfulTransferCount = base?.successful_transfer_count ?? 0;
	const evidenceIds = new Set(base?.evidence_ids ?? []);
	const asOfTime = asOf.getTime();

	const relevant = evidence
		.filter((item) => {
			if (item.concept_id !== conceptId) return false;
			const occurredAt = validTime(item.occurred_at);
			return occurredAt === undefined || occurredAt <= asOfTime;
		})
		.sort((a, b) => (validTime(a.occurred_at) ?? 0) - (validTime(b.occurred_at) ?? 0));

	for (const item of relevant) {
		if (evidenceIds.has(item.evidence_id)) continue;
		evidenceIds.add(item.evidence_id);
		lastEvidenceAt = item.occurred_at;
		if (item.kind === "exposure") exposureCount += 1;
		if (isRetrieval(item)) retrievalCount += 1;

		const observed = resultValue(item);
		const weight = evidenceWeight(item);
		const isLegacy = item.metadata?.legacy === true;
		if (observed === undefined || weight === 0 || isLegacy) {
			continue;
		}
		if (isRetrieval(item)) lastResult = item.result;

		mastery = clamp(mastery + LEARNING_RATE * weight * (observed - mastery), 0, 1);
		estimateConfidence = clamp(1 - (1 - estimateConfidence) * (1 - 0.5 * weight), 0, 1);

		if (observed >= 0.8 && isRetrieval(item)) {
			const before = calculateRetrievability(lastSuccessfulRetrievalAt, stabilityDays, new Date(item.occurred_at)) ?? 1;
			stabilityDays = clamp(stabilityDays * (1 + 0.6 * weight + 0.3 * Math.max(0, 1 - before)), 0.25, 365);
			lastSuccessfulRetrievalAt = item.occurred_at;
			if (item.kind === "transfer") successfulTransferCount += 1;
		} else if (observed < 0.5 && isRetrieval(item)) {
			stabilityDays = clamp(stabilityDays * (0.8 - 0.4 * weight), 0.25, 365);
			lapseCount += 1;
		}
	}

	const retrievability = calculateRetrievability(lastSuccessfulRetrievalAt, stabilityDays, asOf);
	let stateLabel: DerivedKnowledgeState["state_label"];
	if (options.hasActiveMisconception) {
		stateLabel = "misconception";
	} else if (
		mastery >= 0.75
		&& estimateConfidence >= 0.65
		&& stabilityDays >= 7
		&& successfulTransferCount > 0
	) {
		stateLabel = "stable";
	} else if (lastResult === "incorrect") {
		stateLabel = "learning";
	} else if (retrievability !== undefined && retrievability < REVIEW_RETRIEVABILITY_THRESHOLD) {
		stateLabel = "review_due";
	} else if (lastSuccessfulRetrievalAt) {
		stateLabel = "fragile";
	} else if (relevant.length > 0 || base?.last_practiced_at) {
		stateLabel = "learning";
	} else {
		stateLabel = "unknown";
	}

	const projected: DerivedKnowledgeState = {
		concept_id: conceptId,
		concept_name: base?.concept_name ?? conceptId,
		domain: base?.domain ?? "general",
		mastery,
		estimate_confidence: estimateConfidence,
		stability_days: stabilityDays,
		retrievability,
		last_evidence_at: lastEvidenceAt,
		last_successful_retrieval_at: lastSuccessfulRetrievalAt,
		last_result: lastResult,
		next_review_at: nextReviewAt(lastSuccessfulRetrievalAt, stabilityDays),
		exposure_count: exposureCount,
		retrieval_count: retrievalCount,
		lapse_count: lapseCount,
		successful_transfer_count: successfulTransferCount,
		active_misconception_ids: options.activeMisconceptionIds ?? [],
		evidence_ids: [...evidenceIds],
		state_label: stateLabel,
		diagnosis: "",
		next_actions: [],
	};
	const description = stateDescription(projected);
	projected.diagnosis = description.diagnosis;
	projected.next_actions = description.nextActions;
	return projected;
}

/**
 * Fold a derived evidence snapshot back into the compact learner profile.
 * This keeps state stable when events.jsonl is tail-read or rotated; evidence
 * ids prevent recent events from being applied twice on the next projection.
 */
export function applyDerivedKnowledgeState(
	profile: LearnerProfile,
	state: DerivedKnowledgeState,
): boolean {
	const target = profile.knowledge_states.find((item) => item.concept_id === state.concept_id);
	if (!target) return false;
	const before = JSON.stringify(target);
	target.mastery = state.mastery;
	// Keep the v1 fields coherent while the existing profile API/UI migrates to
	// the explicit v2 fields below.
	target.confidence = state.estimate_confidence;
	target.stability = clamp(state.stability_days / 7, 0, 1);
	target.last_practiced_at = state.last_evidence_at;
	target.estimate_confidence = state.estimate_confidence;
	target.stability_days = state.stability_days;
	target.retrievability = state.retrievability;
	target.state_label = state.state_label;
	target.last_evidence_at = state.last_evidence_at;
	target.last_successful_retrieval_at = state.last_successful_retrieval_at;
	target.last_result = state.last_result;
	target.exposure_count = state.exposure_count;
	target.retrieval_count = state.retrieval_count;
	target.lapse_count = state.lapse_count;
	target.successful_transfer_count = state.successful_transfer_count;
	target.review_due_at = state.next_review_at;
	target.evidence_ids = [...state.evidence_ids];
	target.diagnosis = state.diagnosis;
	target.next_actions = [...state.next_actions];
	return JSON.stringify(target) !== before;
}

/**
 * A misconception is not cleared merely because the same concept was used.
 * Only an explicitly linked, reliable repair check moves it out of the active
 * blocker state. A later linked failure reactivates it.
 */
export function applyEvidenceToLinkedMisconception(
	profile: LearnerProfile,
	evidence: LearningEvidence,
): boolean {
	if (!evidence.misconception_id) return false;
	const target = profile.misconceptions.find((item) => (
		item.misconception_id === evidence.misconception_id
		&& item.concept_id === evidence.concept_id
	));
	if (!target) return false;
	const before = JSON.stringify(target);
	if (!target.evidence_ids.includes(evidence.evidence_id)) {
		target.evidence_ids.push(evidence.evidence_id);
	}
	if (evidence.result === "incorrect" || evidence.result === "partial") {
		target.status = "active";
		target.last_seen_at = evidence.occurred_at;
	} else if (
		evidence.result === "correct"
		&& isRetrieval(evidence)
		&& evidence.hint_level <= 1
		&& evidence.evaluator_confidence >= 0.7
		&& evidenceWeight(evidence) >= 0.25
	) {
		target.status = "repairing";
	}
	return JSON.stringify(target) !== before;
}

export function projectLearnerKnowledge(
	profile: LearnerProfile,
	events: LearningEvent[],
	asOf: Date = new Date(),
): DerivedKnowledgeState[] {
	const evidence = collectLearningEvidence(events);
	const conceptIds = new Set([
		...profile.knowledge_states.map((state) => state.concept_id),
		...profile.misconceptions.map((item) => item.concept_id),
		...evidence.map((item) => item.concept_id),
	]);
	return [...conceptIds].map((conceptId) => {
		const base = profile.knowledge_states.find((state) => state.concept_id === conceptId);
		const activeMisconceptionIds = profile.misconceptions
			.filter((item) => item.concept_id === conceptId && item.status === "active")
			.map((item) => item.misconception_id);
		return projectKnowledgeState(base, conceptId, evidence, {
			asOf,
			hasActiveMisconception: activeMisconceptionIds.length > 0,
			activeMisconceptionIds,
		});
	});
}
