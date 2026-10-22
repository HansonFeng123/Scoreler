import type { DerivedKnowledgeState } from "./types.js";

export type PrerequisiteRelation = "required" | "supporting";
export type PrerequisiteSource = "curated" | "teacher" | "imported" | "model_inferred";
export type PrerequisiteStatus = "satisfied" | "uncertain" | "missing" | "misconception";
export type PrerequisiteAction = "use" | "diagnose" | "teach" | "repair";

export interface PrerequisiteEdge {
	target_concept_id: string;
	prerequisite_concept_id: string;
	relation: PrerequisiteRelation;
	required_level: number;
	importance: number;
	source: PrerequisiteSource;
	source_confidence: number;
	rationale: string;
	scope?: string;
	depth?: number;
}

export interface PrerequisiteAssessment {
	target_concept_id: string;
	prerequisite_concept_id: string;
	status: PrerequisiteStatus;
	required_level: number;
	estimated_mastery?: number;
	retrievability?: number;
	estimate_confidence: number;
	reason: string;
	recommended_action: PrerequisiteAction;
	evidence_ids: string[];
	misconception_ids: string[];
	edge: PrerequisiteEdge;
}

export interface PrerequisiteResolution {
	target_concept_id: string;
	is_atomic: boolean;
	action: "direct" | "proceed" | "diagnose" | "teach" | "repair";
	reason: string;
	assessments: PrerequisiteAssessment[];
}

export interface ResolvePrerequisiteOptions {
	isAtomic?: boolean;
	maxDepth?: number;
	maxActivePrerequisites?: number;
	minimumRelationConfidence?: number;
	minimumStateConfidence?: number;
	minimumRetrievability?: number;
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function assessmentFor(
	edge: PrerequisiteEdge,
	state: DerivedKnowledgeState | undefined,
	options: Required<Pick<ResolvePrerequisiteOptions,
		"minimumRelationConfidence" | "minimumStateConfidence" | "minimumRetrievability">>,
): PrerequisiteAssessment {
	const base = {
		target_concept_id: edge.target_concept_id,
		prerequisite_concept_id: edge.prerequisite_concept_id,
		required_level: edge.required_level,
		estimated_mastery: state?.mastery,
		retrievability: state?.retrievability,
		estimate_confidence: state?.estimate_confidence ?? 0,
		evidence_ids: state?.evidence_ids ?? [],
		misconception_ids: state?.active_misconception_ids ?? [],
		edge,
	};

	if (!state || state.state_label === "unknown") {
		return {
			...base,
			status: "uncertain",
			reason: "记忆中没有足够可靠的掌握证据，不能默认学生已经会。",
			recommended_action: "diagnose",
		};
	}
	if (state.state_label === "misconception") {
		return {
			...base,
			status: "misconception",
			reason: "存在与该前置概念相关的活跃误区。",
			recommended_action: edge.source_confidence < options.minimumRelationConfidence ? "diagnose" : "repair",
		};
	}
	if (
		state.estimate_confidence < options.minimumStateConfidence
		|| state.state_label === "review_due"
		|| (state.retrievability !== undefined && state.retrievability < options.minimumRetrievability)
	) {
		return {
			...base,
			status: "uncertain",
			reason: "掌握证据不足或已经过期，需要用一个最小任务确认当前能否提取。",
			recommended_action: "diagnose",
		};
	}
	const currentlyDemonstrated = state.last_result === "correct"
		&& state.retrieval_count > 0
		&& state.retrievability !== undefined
		&& state.retrievability >= options.minimumRetrievability;
	if (state.mastery < edge.required_level && !currentlyDemonstrated) {
		const lowConfidenceRelation = edge.source === "model_inferred"
			&& edge.source_confidence < options.minimumRelationConfidence;
		return {
			...base,
			status: "missing",
			reason: lowConfidenceRelation
				? "模型推断该概念可能是前置，但关系置信度不足，先诊断而不直接阻断原任务。"
				: `可靠证据显示当前掌握度低于本任务要求的 ${edge.required_level.toFixed(2)}。`,
			recommended_action: lowConfidenceRelation ? "diagnose" : "teach",
		};
	}
	return {
		...base,
		status: "satisfied",
		reason: "现有证据满足本次任务要求，可以直接使用该能力。",
		recommended_action: "use",
	};
}

function priority(assessment: PrerequisiteAssessment): number {
	const gap = assessment.estimated_mastery === undefined
		? 1
		: Math.max(0, assessment.required_level - assessment.estimated_mastery);
	const uncertainty = assessment.status === "uncertain" ? 1 : 0;
	const misconception = assessment.status === "misconception" ? 1.5 : 0;
	return assessment.edge.importance * (gap + uncertainty + misconception);
}

export function resolvePrerequisites(
	targetConceptId: string,
	edges: PrerequisiteEdge[],
	states: DerivedKnowledgeState[],
	options: ResolvePrerequisiteOptions = {},
): PrerequisiteResolution {
	const isAtomic = options.isAtomic ?? false;
	if (isAtomic || edges.length === 0) {
		return {
			target_concept_id: targetConceptId,
			is_atomic: isAtomic,
			action: "direct",
			reason: isAtomic
				? "目标已达到本次教学的原子概念边界，不再继续追溯前置知识。"
				: "当前任务没有声明必要前置知识，直接从目标概念开始。",
			assessments: [],
		};
	}

	const maxDepth = options.maxDepth ?? 2;
	const maxActivePrerequisites = options.maxActivePrerequisites ?? 3;
	const thresholds = {
		minimumRelationConfidence: clamp01(options.minimumRelationConfidence ?? 0.6),
		minimumStateConfidence: clamp01(options.minimumStateConfidence ?? 0.4),
		minimumRetrievability: clamp01(options.minimumRetrievability ?? 0.65),
	};
	const stateById = new Map(states.map((state) => [state.concept_id, state]));
	const bestEdgeByPrerequisite = new Map<string, PrerequisiteEdge>();
	for (const edge of edges) {
		if (edge.target_concept_id !== targetConceptId || (edge.depth ?? 1) > maxDepth) continue;
		const normalized = {
			...edge,
			required_level: clamp01(edge.required_level),
			importance: clamp01(edge.importance),
			source_confidence: clamp01(edge.source_confidence),
		};
		const existing = bestEdgeByPrerequisite.get(edge.prerequisite_concept_id);
		if (!existing || normalized.importance * normalized.source_confidence > existing.importance * existing.source_confidence) {
			bestEdgeByPrerequisite.set(edge.prerequisite_concept_id, normalized);
		}
	}

	const allAssessments = [...bestEdgeByPrerequisite.values()].map((edge) =>
		assessmentFor(edge, stateById.get(edge.prerequisite_concept_id), thresholds));
	const allActive = allAssessments.filter((item) => item.status !== "satisfied");
	const requiredActive = allActive
		.filter((item) => item.edge.relation === "required")
		.sort((a, b) => priority(b) - priority(a));
	const supportingActive = allActive
		.filter((item) => item.edge.relation !== "required")
		.sort((a, b) => priority(b) - priority(a));
	// The display budget must never hide a required blocker behind supporting
	// concepts. Decisions are made from every required prerequisite; the budget
	// only limits what is surfaced as the active teaching plan.
	const active = [
		...requiredActive.slice(0, maxActivePrerequisites),
		...supportingActive.slice(0, Math.max(0, maxActivePrerequisites - requiredActive.length)),
	];
	const satisfied = allAssessments.filter((item) => item.status === "satisfied");
	const assessments = [...active, ...satisfied];

	const repair = requiredActive.find((item) => item.recommended_action === "repair");
	const teach = requiredActive.find((item) => item.recommended_action === "teach");
	const diagnose = requiredActive.find((item) => item.recommended_action === "diagnose");
	if (repair) {
		return {
			target_concept_id: targetConceptId,
			is_atomic: false,
			action: "repair",
			reason: `先修复前置误区 ${repair.prerequisite_concept_id}，再回到原问题。`,
			assessments,
		};
	}
	if (teach) {
		return {
			target_concept_id: targetConceptId,
			is_atomic: false,
			action: "teach",
			reason: `先补足必要前置知识 ${teach.prerequisite_concept_id}，完成最小验证后回到原问题。`,
			assessments,
		};
	}
	if (diagnose) {
		return {
			target_concept_id: targetConceptId,
			is_atomic: false,
			action: "diagnose",
			reason: `先用一个低成本任务诊断 ${diagnose.prerequisite_concept_id}，不要只问学生“会不会”。`,
			assessments,
		};
	}
	return {
		target_concept_id: targetConceptId,
		is_atomic: false,
		action: "proceed",
		reason: "必要前置知识均有足够证据，可以直接继续原问题。",
		assessments,
	};
}
