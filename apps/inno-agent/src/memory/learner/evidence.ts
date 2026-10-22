import { randomUUID } from "node:crypto";
import {
	createLearningEvent,
	type EvidenceEvaluator,
	type EvidenceKind,
	type EvidenceResult,
	type LearningEvidence,
	type LearningEvent,
} from "./types.js";

const KIND_WEIGHT: Record<EvidenceKind, number> = {
	exposure: 0,
	recognition: 0.25,
	guided_recall: 0.45,
	free_recall: 0.75,
	application: 0.85,
	transfer: 1,
	self_report: 0.1,
	manual_override: 1,
};

const HINT_WEIGHT = [1, 0.8, 0.5, 0.1] as const;

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function asFiniteNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asEvidenceResult(payload: Record<string, unknown>): EvidenceResult {
	const raw = payload.result;
	if (raw === "correct" || raw === "partial" || raw === "incorrect" || raw === "unknown") return raw;
	if (payload.correct === true) return "correct";
	if (payload.correct === false) return "incorrect";
	const score = asFiniteNumber(payload.score);
	if (score === undefined) return "unknown";
	if (score >= 0.8) return "correct";
	if (score > 0) return "partial";
	return "incorrect";
}

function asHintLevel(value: unknown): 0 | 1 | 2 | 3 {
	const numeric = asFiniteNumber(value);
	if (numeric === undefined) return 0;
	return Math.max(0, Math.min(3, Math.round(numeric))) as 0 | 1 | 2 | 3;
}

function asEvidenceKind(value: unknown, fallback: EvidenceKind): EvidenceKind {
	const kinds: EvidenceKind[] = [
		"exposure",
		"recognition",
		"guided_recall",
		"free_recall",
		"application",
		"transfer",
		"self_report",
		"manual_override",
	];
	return typeof value === "string" && kinds.includes(value as EvidenceKind) ? value as EvidenceKind : fallback;
}

function spacingWeight(delaySeconds?: number): number {
	if (delaySeconds === undefined || delaySeconds < 0) return 1;
	if (delaySeconds < 5 * 60) return 0.75;
	if (delaySeconds < 24 * 60 * 60) return 0.9;
	if (delaySeconds < 7 * 24 * 60 * 60) return 1.05;
	return 1.25;
}

export function evidenceWeight(evidence: LearningEvidence): number {
	return clamp01(
		KIND_WEIGHT[evidence.kind]
			* HINT_WEIGHT[evidence.hint_level]
			* clamp01(evidence.evaluator_confidence)
			* spacingWeight(evidence.delay_seconds),
	);
}

export interface NewLearningEvidence {
	concept_id: string;
	kind: EvidenceKind;
	result: EvidenceResult;
	score?: number;
	hint_level?: 0 | 1 | 2 | 3;
	delay_seconds?: number;
	transfer_distance?: number;
	learner_confidence?: number;
	evaluator: EvidenceEvaluator;
	evaluator_confidence: number;
	session_id?: string;
	misconception_id?: string;
	metadata?: Record<string, unknown>;
	dedupe_key?: string;
}

export function createLearningEvidenceEvent(
	learnerId: string,
	input: NewLearningEvidence,
	now: Date = new Date(),
): LearningEvent {
	const occurredAt = now.toISOString();
	const event = createLearningEvent(
		learnerId,
		"learning_evidence",
		{ concept_ids: [input.concept_id], session_id: input.session_id },
		{
			concept: input.concept_id,
			kind: input.kind,
			result: input.result,
			hint_level: input.hint_level ?? 0,
		},
	);
	event.timestamp = occurredAt;
	event.schema_version = 2;
	event.dedupe_key = input.dedupe_key;
	event.evidence = {
		evidence_id: `evd_${randomUUID().slice(0, 8)}`,
		event_id: event.event_id,
		learner_id: learnerId,
		concept_id: input.concept_id,
		occurred_at: occurredAt,
		kind: input.kind,
		result: input.result,
		score: input.score === undefined ? undefined : clamp01(input.score),
		hint_level: input.hint_level ?? 0,
		delay_seconds: input.delay_seconds,
		transfer_distance: input.transfer_distance === undefined ? undefined : clamp01(input.transfer_distance),
		learner_confidence: input.learner_confidence === undefined ? undefined : clamp01(input.learner_confidence),
		evaluator: input.evaluator,
		evaluator_confidence: clamp01(input.evaluator_confidence),
		session_id: input.session_id,
		misconception_id: input.misconception_id,
		metadata: input.metadata,
	};
	return event;
}

function legacyEvidence(event: LearningEvent, conceptId: string): LearningEvidence {
	let kind: EvidenceKind = "exposure";
	if (event.event_type === "exercise_attempt") kind = asEvidenceKind(event.payload.evidence_kind, "application");
	if (event.event_type === "self_assessed") kind = "self_report";
	if (event.event_type === "milestone_reached") kind = asEvidenceKind(event.payload.evidence_kind, "exposure");

	return {
		evidence_id: `legacy_${event.event_id}_${conceptId}`,
		event_id: event.event_id,
		learner_id: event.learner_id,
		concept_id: conceptId,
		occurred_at: event.timestamp,
		kind,
		result: asEvidenceResult(event.payload),
		score: asFiniteNumber(event.payload.score),
		hint_level: asHintLevel(event.payload.hint_level),
		delay_seconds: asFiniteNumber(event.payload.delay_seconds),
		transfer_distance: asFiniteNumber(event.payload.transfer_distance),
		evaluator: event.event_type === "self_assessed" ? "self" : "model",
		evaluator_confidence: event.event_type === "self_assessed" ? 0.2 : 0.5,
		session_id: event.context.session_id,
		metadata: { legacy: true, event_type: event.event_type },
	};
}

export function evidenceFromEvent(event: LearningEvent): LearningEvidence[] {
	if (event.evidence) return [event.evidence];
	if (
		event.event_type !== "concept_explained"
		&& event.event_type !== "exercise_attempt"
		&& event.event_type !== "self_assessed"
		&& event.event_type !== "milestone_reached"
	) return [];
	return (event.context.concept_ids ?? []).map((conceptId) => legacyEvidence(event, conceptId));
}

export function collectLearningEvidence(events: LearningEvent[]): LearningEvidence[] {
	return events
		.flatMap(evidenceFromEvent)
		.sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
}
