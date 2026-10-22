import {
	resolvePrerequisites,
	type PrerequisiteEdge,
	type PrerequisiteResolution,
} from "./prerequisite-resolver.js";
import type { DerivedKnowledgeState } from "./types.js";

export type TeachingRequestMode = "learning" | "direct_task" | "urgent";

export interface TeachingEntryRequest {
	target_concept_id: string;
	task_scope?: string;
	mode: TeachingRequestMode;
	is_atomic: boolean;
	skip_diagnosis?: boolean;
	prerequisites: PrerequisiteEdge[];
}

export interface TeachingEntryDecision extends PrerequisiteResolution {
	task_scope?: string;
	diagnostics_allowed: boolean;
}

export function evaluateTeachingEntry(
	request: TeachingEntryRequest,
	states: DerivedKnowledgeState[],
): TeachingEntryDecision {
	const diagnosticsAllowed = request.mode === "learning" && request.skip_diagnosis !== true;
	if (!diagnosticsAllowed) {
		return {
			target_concept_id: request.target_concept_id,
			task_scope: request.task_scope,
			is_atomic: request.is_atomic,
			diagnostics_allowed: false,
			action: "direct",
			reason: request.mode === "learning"
				? "学习者选择跳过诊断，本轮直接回应当前问题。"
				: "当前请求不是主动教学模式，不插入前置知识诊断。",
			assessments: [],
		};
	}

	const resolution = resolvePrerequisites(
		request.target_concept_id,
		request.prerequisites,
		states,
		{ isAtomic: request.is_atomic },
	);
	return {
		...resolution,
		task_scope: request.task_scope,
		diagnostics_allowed: true,
	};
}

export function formatTeachingEntryDecision(decision: TeachingEntryDecision): string {
	const lines = [
		"## 教学入口判断",
		`- 目标概念：${decision.target_concept_id}`,
		decision.task_scope ? `- 当前任务：${decision.task_scope}` : "",
		`- 决策：${decision.action}`,
		`- 原因：${decision.reason}`,
	].filter(Boolean);
	for (const item of decision.assessments.filter((assessment) => assessment.status !== "satisfied")) {
		lines.push(
			`- 前置 ${item.prerequisite_concept_id}: ${item.status}；动作 ${item.recommended_action}；${item.reason}`,
		);
	}

	const primary = decision.assessments.find((assessment) => (
		assessment.status !== "satisfied"
		&& assessment.edge.relation === "required"
		&& assessment.recommended_action === decision.action
	));
	if (decision.action === "diagnose") {
		lines.push(
			"",
			"## 下一条回复协议（必须遵守）",
			`- 本轮只诊断前置 ${primary?.prerequisite_concept_id ?? "知识"}，不得讲解或给出原题答案。`,
			"- 只提出一道能观察学生实际表现的问题，不得同时给提示、公式或答案。",
			"- 问完立即停止并等待学生回答；收到回答后再记录学习证据并恢复原题。",
		);
	} else if (decision.action === "teach") {
		lines.push(
			"",
			"## 下一条回复协议（必须遵守）",
			`- 本轮只做前置 ${primary?.prerequisite_concept_id ?? "知识"} 的最短桥接，不得讲完原题。`,
			"- 桥接后只提出一道最小检查题，不得在同一回复中揭示检查题答案。",
			"- 问完立即停止并等待学生回答；验证后再记录学习证据并恢复原题。",
		);
	} else if (decision.action === "repair") {
		const misconceptionId = primary?.misconception_ids[0];
		lines.push(
			"",
			"## 下一条回复协议（必须遵守）",
			`- 本轮只修复前置误区 ${primary?.prerequisite_concept_id ?? "知识"}，不得给出原题的完整推导、公式或结论。`,
			"- 用一个反例、对比或表征转换暴露误区，然后只提出一道学生必须作答的检查题。",
			misconceptionId
				? `- 学生回答后调用 record_learning_evidence 时必须传 misconception_id=${misconceptionId}，让验证结果更新这条误区。`
				: "- 学生回答后记录学习证据；如果能定位具体误区，必须同时传 misconception_id。",
			"- 问完立即停止并等待学生回答；验证修复后再恢复原题。",
		);
	}
	return lines.join("\n");
}
