import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadEvents, loadProfile, saveProfile } from "./profile-store.js";
import { recordEventAndUpdateProfile } from "./profile-store.js";
import { buildContextPack } from "./context-pack.js";
import { patchProfile, updateProfile } from "./profile-updater.js";
import { createLearningEvent } from "./types.js";
import { createLearningEvidenceEvent } from "./evidence.js";
import {
	applyDerivedKnowledgeState,
	applyEvidenceToLinkedMisconception,
	projectLearnerKnowledge,
} from "./state-engine.js";
import { loadPrerequisiteEdges } from "./prerequisite-store.js";
import { evaluateTeachingEntry, formatTeachingEntryDecision } from "./teaching-entry-gate.js";
import { logger } from "../../logger.js";

// ============================================================================
// TypeBox Schemas for complex types
// ============================================================================

const LearningGoalSchema = Type.Object({
	goal_id: Type.String({ description: "Unique goal identifier" }),
	title: Type.String({ description: "Goal title" }),
	type: StringEnum(["skill", "concept", "project", "exam", "habit"] as const),
	priority: Type.Number({ description: "Priority 0-1, higher is more important", minimum: 0, maximum: 1 }),
	status: StringEnum(["active", "paused", "completed", "archived"] as const),
	success_criteria: Type.Array(Type.String(), { description: "Measurable success criteria" }),
	source: StringEnum(["user_declared", "agent_inferred", "imported"] as const),
	updated_at: Type.String({ description: "ISO 8601 timestamp" }),
});

const KnowledgeStateSchema = Type.Object({
	concept_id: Type.String({ description: "Unique concept identifier, e.g. python.list_comprehension" }),
	concept_name: Type.String({ description: "Human-readable concept name" }),
	domain: Type.String({ description: "Knowledge domain, e.g. programming.python" }),
	mastery: Type.Number({ description: "Mastery level 0-1", minimum: 0, maximum: 1 }),
	confidence: Type.Number({ description: "Confidence in mastery estimate 0-1", minimum: 0, maximum: 1 }),
	stability: Type.Number({ description: "Knowledge stability 0-1", minimum: 0, maximum: 1 }),
	estimate_confidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
	stability_days: Type.Optional(Type.Number({ minimum: 0.25 })),
	retrievability: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
	state_label: Type.Optional(StringEnum(["unknown", "learning", "fragile", "review_due", "stable", "misconception"] as const)),
	last_evidence_at: Type.Optional(Type.String()),
	last_successful_retrieval_at: Type.Optional(Type.String()),
	last_result: Type.Optional(StringEnum(["correct", "partial", "incorrect", "unknown"] as const)),
	exposure_count: Type.Optional(Type.Integer({ minimum: 0 })),
	retrieval_count: Type.Optional(Type.Integer({ minimum: 0 })),
	lapse_count: Type.Optional(Type.Integer({ minimum: 0 })),
	successful_transfer_count: Type.Optional(Type.Integer({ minimum: 0 })),
	last_practiced_at: Type.Optional(Type.String({ description: "ISO 8601 timestamp" })),
	review_due_at: Type.Optional(Type.String({ description: "ISO 8601 timestamp for next review" })),
	evidence_ids: Type.Array(Type.String(), { description: "IDs of supporting learning events" }),
	diagnosis: Type.String({ description: "Current diagnosis of learner state on this concept" }),
	next_actions: Type.Array(Type.String(), { description: "Recommended next learning actions" }),
});

const MisconceptionSchema = Type.Object({
	misconception_id: Type.String({ description: "Unique misconception identifier" }),
	concept_id: Type.String({ description: "Related concept ID" }),
	description: Type.String({ description: "Description of the misconception" }),
	status: StringEnum(["active", "repairing", "resolved", "stale"] as const),
	severity: Type.Number({ description: "Severity 0-1", minimum: 0, maximum: 1 }),
	confidence: Type.Number({ description: "Confidence in this diagnosis 0-1", minimum: 0, maximum: 1 }),
	first_seen_at: Type.String({ description: "ISO 8601 timestamp" }),
	last_seen_at: Type.String({ description: "ISO 8601 timestamp" }),
	evidence_ids: Type.Array(Type.String(), { description: "IDs of supporting learning events" }),
	repair_strategy: Type.String({ description: "Strategy to fix this misconception" }),
});

const PreferencesSchema = Type.Object({
	explanation_style: Type.Optional(Type.Array(Type.String(), { description: "e.g. example_first, code_first, theory_first" })),
	practice_style: Type.Optional(Type.Array(Type.String(), { description: "e.g. small_steps, immediate_feedback" })),
	feedback_tone: Type.Optional(Type.Array(Type.String(), { description: "e.g. direct, encouraging, socratic" })),
	avoid: Type.Optional(Type.Array(Type.String(), { description: "Things to avoid in teaching" })),
});

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Create the L1 learner tools.
 * The dataDir and learnerId are captured in closure. When `isEnabled` is
 * provided and returns false, every tool short-circuits to a disabled notice
 * so the profile is neither read nor mutated.
 */
export function createLearnerTools(
	dataDir: string,
	learnerId: string,
	isEnabled?: () => boolean,
	l2DataDir?: string,
	isL2Enabled?: () => boolean,
): ToolDefinition[] {
	const L1_DISABLED_TEXT = "L1 学习者画像已在设置中关闭，当前不读取也不更新学习者画像。";
	const disabledResult = () => ({
		content: [{ type: "text" as const, text: L1_DISABLED_TEXT }],
		details: { disabled: true } as Record<string, unknown>,
	});

	const getLearnerContextTool = defineTool({
		name: "get_learner_context",
		label: "Get Learner Context",
		description:
			"读取当前学习者上下文包，包含活跃目标、相关概念掌握度、活跃误区和教学提示。在开始新对话或需要了解学习者状态时调用。",
		parameters: Type.Object({}),
		async execute() {
			if (isEnabled && !isEnabled()) return disabledResult();
			const profile = loadProfile(dataDir);
			const pack = buildContextPack(profile, loadEvents(dataDir));
			return {
				content: [{ type: "text" as const, text: JSON.stringify(pack, null, 2) }],
				details: {},
			};
		},
	});

	const recordLearningEventTool = defineTool({
		name: "record_learning_event",
		label: "Record Learning Event",
		description:
			"记录一个结构化的学习事件，并自动把确定性信号合入 L1 学习者画像。当观察到学习者声明/停止/切换目标、完成练习、接受讲解、自我评估、表达偏好、接收反馈或达到里程碑时调用。",
		parameters: Type.Object({
			event_type: StringEnum([
				"goal_declared",
				"exercise_attempt",
				"concept_explained",
				"self_assessed",
				"preference_stated",
				"feedback_received",
				"milestone_reached",
			] as const, { description: "Type of learning event" }),
			context: Type.Object({
				goal_id: Type.Optional(Type.String({ description: "Related goal ID" })),
				concept_ids: Type.Optional(Type.Array(Type.String(), { description: "Related concept IDs" })),
				session_id: Type.Optional(Type.String({ description: "Current session ID" })),
			}),
				payload: Type.Record(Type.String(), Type.Unknown(), {
					description:
						"Event-specific data. For stopping a goal, include goal_description/action/reason such as { goal_description: '不再学习 Rust', action: 'archived' }. For switching goals, include previous_goal and goal.",
				}),
			derived_signals: Type.Optional(
				Type.Object({
					misconception_candidates: Type.Optional(Type.Array(Type.String(), { description: "Observed learner misconceptions or error patterns, e.g. ['thinks Rust ownership means the variable is destroyed after borrow']" })),
					affect: Type.Optional(Type.String({ description: "Detected affect, e.g. frustrated, confident" })),
					preference_candidates: Type.Optional(Type.Array(Type.String(), { description: "Observed learner preferences, e.g. ['prefers code-first explanations', '避免长篇理论']" })),
				}),
			),
		}),
		async execute(_toolCallId, params) {
			try {
				if (isEnabled && !isEnabled()) return disabledResult();
				const event = createLearningEvent(
					learnerId,
					params.event_type,
					params.context,
					params.payload as Record<string, unknown>,
					params.derived_signals,
				);
				const profile = recordEventAndUpdateProfile(dataDir, event);
				return {
					content: [
						{
							type: "text" as const,
							text: `学习事件已记录并同步画像: ${event.event_id} (${event.event_type})，当前画像版本 ${profile.version}`,
						},
					],
					details: { event_id: event.event_id, profile_version: profile.version },
				};
			} catch (err) {
				logger.warn({ err, params }, "record_learning_event tool failed");
				throw err;
			}
		},
		});

	const recordLearningEvidenceTool = defineTool({
		name: "record_learning_evidence",
		label: "Record Learning Evidence",
		description:
			"记录学生实际表现形成的结构化证据。用于诊断题、独立回忆、应用或迁移后的结果；讲解完成本身只能记录 exposure，不能当作掌握。不要用它猜测学生会不会。",
		parameters: Type.Object({
			concept_id: Type.String({ description: "Stable concept ID, e.g. physics.force_decomposition" }),
			kind: StringEnum([
				"exposure",
				"recognition",
				"guided_recall",
				"free_recall",
				"application",
				"transfer",
				"self_report",
				"manual_override",
			] as const),
			result: StringEnum(["correct", "partial", "incorrect", "unknown"] as const),
			score: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
			hint_level: Type.Optional(Type.Integer({ minimum: 0, maximum: 3, description: "0 无提示；3 表示答案已揭示" })),
			delay_seconds: Type.Optional(Type.Number({ minimum: 0 })),
			transfer_distance: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
			learner_confidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
			evaluator: StringEnum(["deterministic", "rubric", "model", "teacher", "self"] as const),
			evaluator_confidence: Type.Number({ minimum: 0, maximum: 1 }),
			session_id: Type.Optional(Type.String()),
			misconception_id: Type.Optional(Type.String({
				description: "修复检查所针对的已知误区 ID；仅在 assess_learning_prerequisites 返回该 ID 时填写。",
			})),
			dedupe_key: Type.Optional(Type.String({ description: "Stable key for retry-safe writes" })),
			metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
		}),
		async execute(_toolCallId, params) {
			try {
				if (isEnabled && !isEnabled()) return disabledResult();
				if (params.dedupe_key) {
					const duplicate = loadEvents(dataDir).find((event) => event.dedupe_key === params.dedupe_key);
					if (duplicate) {
						return {
							content: [{ type: "text" as const, text: `学习证据已存在，跳过重复写入: ${duplicate.event_id}` }],
							details: { event_id: duplicate.event_id, duplicate: true },
						};
					}
				}
				const event = createLearningEvidenceEvent(learnerId, {
					...params,
					hint_level: (params.hint_level ?? 0) as 0 | 1 | 2 | 3,
				});
				const profile = recordEventAndUpdateProfile(dataDir, event);
				let profileChanged = event.evidence
					? applyEvidenceToLinkedMisconception(profile, event.evidence)
					: false;
				const state = projectLearnerKnowledge(profile, loadEvents(dataDir))
					.find((item) => item.concept_id === params.concept_id);
				if (state) profileChanged = applyDerivedKnowledgeState(profile, state) || profileChanged;
				if (profileChanged) saveProfile(dataDir, profile);
				return {
					content: [{
						type: "text" as const,
						text: `学习证据已记录: ${event.evidence?.evidence_id}；当前状态 ${state?.state_label ?? "unknown"}。`,
					}],
					details: { event_id: event.event_id, evidence_id: event.evidence?.evidence_id, state },
				};
			} catch (err) {
				logger.warn({ err, params }, "record_learning_evidence tool failed");
				throw err;
			}
		},
	});

	const assessLearningPrerequisitesTool = defineTool({
		name: "assess_learning_prerequisites",
		label: "Assess Learning Prerequisites",
		description:
			"在正式讲解学习问题前评估必要前置知识。先识别当前任务所需的最小前置集合；L2 显式关系会自动读取，缺失时可提交少量低置信模型推断。若目标已是基础原子概念，设置 is_atomic=true 并直接教学。",
		parameters: Type.Object({
			target_concept_id: Type.String(),
			task_scope: Type.Optional(Type.String({ description: "当前题型、难度和讲解目标" })),
			mode: StringEnum(["learning", "direct_task", "urgent"] as const),
			is_atomic: Type.Boolean({ description: "目标是否已达到本次教学无需继续追溯的原子概念边界" }),
			skip_diagnosis: Type.Optional(Type.Boolean()),
			prerequisites: Type.Optional(Type.Array(Type.Object({
				concept_id: Type.String(),
				relation: Type.Optional(StringEnum(["required", "supporting"] as const)),
				required_level: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
				importance: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
				source: Type.Optional(StringEnum(["curated", "teacher", "imported", "model_inferred"] as const)),
				source_confidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
				rationale: Type.Optional(Type.String()),
				scope: Type.Optional(Type.String()),
			}))),
		}),
		async execute(_toolCallId, params) {
			try {
				if (isEnabled && !isEnabled()) return disabledResult();
				const stored = !isL2Enabled || isL2Enabled()
					? loadPrerequisiteEdges(l2DataDir, params.target_concept_id, { scope: params.task_scope })
					: [];
				const inferred = (params.prerequisites ?? []).map((item) => ({
					target_concept_id: params.target_concept_id,
					prerequisite_concept_id: item.concept_id,
					relation: item.relation ?? "required" as const,
					required_level: item.required_level ?? 0.65,
					importance: item.importance ?? 0.8,
					source: item.source ?? "model_inferred" as const,
					source_confidence: item.source_confidence ?? 0.45,
					rationale: item.rationale ?? "模型根据当前题目推断的候选前置知识。",
					scope: item.scope ?? params.task_scope,
				}));
				const profile = loadProfile(dataDir);
				const states = projectLearnerKnowledge(profile, loadEvents(dataDir));
				const decision = evaluateTeachingEntry({
					target_concept_id: params.target_concept_id,
					task_scope: params.task_scope,
					mode: params.mode,
					is_atomic: params.is_atomic,
					skip_diagnosis: params.skip_diagnosis,
					prerequisites: [...stored, ...inferred],
				}, states);
				return {
					content: [{ type: "text" as const, text: formatTeachingEntryDecision(decision) }],
					details: { decision },
				};
			} catch (err) {
				logger.warn({ err, params }, "assess_learning_prerequisites tool failed");
				throw err;
			}
		},
	});

	const patchLearnerProfileTool = defineTool({
		name: "patch_learner_profile",
		label: "Patch Learner Profile",
		description:
			"低成本局部更新 L1 学习者画像。用于在一次学习互动后调整某个概念的掌握度/诊断/复习时间，追加偏好或画像摘要；不需要提交完整知识状态对象。",
		parameters: Type.Object({
			concept_id: Type.Optional(Type.String({ description: "Concept ID to create or patch, e.g. rust.ownership" })),
			concept_name: Type.Optional(Type.String({ description: "Human-readable concept name" })),
			domain: Type.Optional(Type.String({ description: "Knowledge domain, e.g. programming.rust" })),
			mastery_delta: Type.Optional(Type.Number({ description: "Small mastery adjustment, e.g. 0.03 or -0.02" })),
			mastery: Type.Optional(Type.Number({ description: "Absolute mastery 0-1", minimum: 0, maximum: 1 })),
			confidence: Type.Optional(Type.Number({ description: "Confidence 0-1", minimum: 0, maximum: 1 })),
			stability_delta: Type.Optional(Type.Number({ description: "Knowledge stability adjustment" })),
			diagnosis: Type.Optional(Type.String({ description: "Updated diagnosis for this concept" })),
			next_actions_append: Type.Optional(Type.Array(Type.String(), { description: "Next actions to append" })),
			evidence_ids_append: Type.Optional(Type.Array(Type.String(), { description: "Supporting event IDs to append" })),
			last_practiced_at: Type.Optional(Type.String({ description: "ISO 8601 timestamp" })),
			review_due_at: Type.Optional(Type.String({ description: "ISO 8601 timestamp" })),
			preferences_append: Type.Optional(PreferencesSchema),
			profile_summary_append: Type.Optional(Type.String({ description: "One concise sentence to append to profile summary" })),
		}),
		async execute(_toolCallId, params) {
			try {
				if (isEnabled && !isEnabled()) return disabledResult();
				const updated = patchProfile(dataDir, params);
				return {
					content: [
						{
							type: "text" as const,
							text: `学习者画像已局部更新至版本 ${updated.version}`,
						},
					],
					details: { version: updated.version },
				};
			} catch (err) {
				logger.warn({ err, params }, "patch_learner_profile tool failed");
				throw err;
			}
		},
	});

	const updateLearnerProfileTool = defineTool({
		name: "update_learner_profile",
		label: "Update Learner Profile",
		description:
			"更新学习者画像的特定字段。可以更新目标、知识状态、误区、偏好和画像摘要。数组字段按 ID 合并（已存在则替换，不存在则新增）。",
		parameters: Type.Object({
			goals: Type.Optional(Type.Array(LearningGoalSchema)),
			knowledge_states: Type.Optional(Type.Array(KnowledgeStateSchema)),
			misconceptions: Type.Optional(Type.Array(MisconceptionSchema)),
			preferences: Type.Optional(PreferencesSchema),
			profile_summary: Type.Optional(Type.String({ description: "Updated profile summary text" })),
		}),
		async execute(_toolCallId, params) {
			try {
				if (isEnabled && !isEnabled()) return disabledResult();
				const updated = updateProfile(dataDir, params);
				return {
					content: [
						{
							type: "text" as const,
							text: `学习者画像已更新至版本 ${updated.version}`,
						},
					],
					details: { version: updated.version },
				};
			} catch (err) {
				logger.warn({ err, params }, "update_learner_profile tool failed");
				throw err;
			}
		},
	});

	const reviewLearnerProfileTool = defineTool({
		name: "review_learner_profile",
		label: "Review Learner Profile",
		description:
			"展示完整的学习者画像，供用户查看、修正或删除。当用户请求查看自己的学习状态时调用。",
		parameters: Type.Object({}),
		async execute() {
			if (isEnabled && !isEnabled()) return disabledResult();
			const profile = loadProfile(dataDir);
			const summary = [
				`学习者 ID: ${profile.learner_id}`,
				`版本: ${profile.version}`,
				`更新时间: ${profile.updated_at}`,
				``,
				`## 学习目标 (${profile.goals.length})`,
				...profile.goals.map(
					(g) => `- [${g.status}] ${g.title} (优先级: ${g.priority}, 类型: ${g.type})`,
				),
				``,
				`## 知识状态 (${profile.knowledge_states.length})`,
				...profile.knowledge_states.map(
					(ks) =>
						`- ${ks.concept_name} (${ks.concept_id}): 掌握度 ${ks.mastery.toFixed(2)}, 置信度 ${ks.confidence.toFixed(2)}\n  诊断: ${ks.diagnosis}`,
				),
				``,
				`## 误区 (${profile.misconceptions.length})`,
				...profile.misconceptions.map(
					(m) => `- [${m.status}] ${m.description} (严重度: ${m.severity.toFixed(2)})`,
				),
				``,
				`## 偏好`,
				`- 讲解风格: ${profile.preferences.explanation_style.join(", ") || "未设定"}`,
				`- 练习风格: ${profile.preferences.practice_style.join(", ") || "未设定"}`,
				`- 反馈语气: ${profile.preferences.feedback_tone.join(", ") || "未设定"}`,
				`- 避免: ${profile.preferences.avoid.join(", ") || "未设定"}`,
				``,
				`## 画像摘要`,
				profile.profile_summary || "暂无摘要",
			];

			return {
				content: [{ type: "text" as const, text: summary.join("\n") }],
				details: {},
			};
		},
	});

	return [
		getLearnerContextTool,
		recordLearningEventTool,
		recordLearningEvidenceTool,
		assessLearningPrerequisitesTool,
		patchLearnerProfileTool,
		updateLearnerProfileTool,
		reviewLearnerProfileTool,
	];
}
