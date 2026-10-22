import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { randomUUID, createHash } from "node:crypto";
import { basename, join, isAbsolute, resolve } from "node:path";
import { unlinkSync } from "node:fs";

import type { ManifestEntry, RawSourceType } from "./types.js";
import { saveRaw, saveRawFile } from "./raw-store.js";
import { convertToExtracted } from "./source-converter.js";
import { findManifestByHash, findManifestBySourceIdentity, upsertManifest } from "./manifest-store.js";
import {
	createSourcePage,
	getSourcePagePath,
	updateIndexAfterIngest,
	appendLog,
	appendDeterministicIngestLog,
	ensureL2Directories,
	readMaintenanceContext,
} from "./wiki-maintainer.js";
import { queryWikiHybridDetailed } from "./wiki-query.js";
import { summarizeContent } from "./summarizer.js";
import { generateRichWikiPages } from "./wiki-generator.js";
import { maintainLinkedWikiPages } from "./wiki-linker.js";
import { fileExists, readText } from "../../storage/file-store.js";
import { parseDocument, DocumentParseError } from "./document-parser.js";
import { getL2Memory, type L2Memory } from "./l2-memory.js";
import { formatL2LintReport, runL2Lint } from "./l2-lint.js";
import { logger } from "../../logger.js";

// PI may dispatch several archive tool calls from one turn concurrently.
const archiveQueueTails = new Map<string, Promise<void>>();

function enqueueArchive<T>(l2DataDir: string, task: () => Promise<T>): Promise<T> {
	const queueKey = resolve(l2DataDir);
	const previous = archiveQueueTails.get(queueKey) ?? Promise.resolve();
	const run = previous.then(task, task);
	const tail = run.then(
		() => undefined,
		() => undefined,
	);
	archiveQueueTails.set(queueKey, tail);

	return run.finally(() => {
		if (archiveQueueTails.get(queueKey) === tail) archiveQueueTails.delete(queueKey);
	});
}

function throwIfAborted(signal?: AbortSignal): void {
	if (!signal?.aborted) return;
	throw signal.reason instanceof Error ? signal.reason : new Error("L2 archive cancelled");
}

function uniquePaths(paths: string[]): string[] {
	return [...new Set(paths.filter(Boolean))];
}

/**
 * Create L2 Wiki memory tools for the Inno Agent.
 * When `isEnabled` is provided and returns false, the archive/query tools
 * short-circuit to a disabled notice without touching the knowledge base.
 * `l2Memory` keeps the retrieval index in sync; defaults to the per-dir
 * singleton so callers that don't pass one still get index maintenance.
 * `getActiveWorkspaceDir` resolves relative file paths for the current
 * session; server callers must keep this dynamic because sessions can switch
 * workspaces without recreating the extension.
 */
export function createL2Tools(
	l2DataDir: string,
	isEnabled?: () => boolean,
	l2Memory: L2Memory = getL2Memory(l2DataDir),
	getActiveWorkspaceDir?: () => string,
): ToolDefinition[] {
	const l2DisabledResult = () => ({
		content: [{ type: "text" as const, text: "L2 Wiki 知识库已在设置中关闭，当前不归档也不检索知识库内容。" }],
		details: { disabled: true },
	});

	// ---- Tool 1: l2_archive ----
	const archiveTool = defineTool({
		name: "l2_archive",
		label: "归档到 L2 Wiki",
		description:
			"将学习资料归档到 L2 Wiki 知识库。用户说「归档」「保存到知识库」「帮我记下来」或上传资料要求学习/总结时调用。" +
			"支持文本(text)、Markdown(markdown)、对话片段(conversation)、PDF(pdf)、Word 文档(word)、图片(image)。" +
			"文本类内容传 content 参数；文件类内容传 filePath 参数。",
		parameters: Type.Object({
			title: Type.String({ description: "资料标题" }),
			content: Type.Optional(Type.String({ description: "要归档的文本内容（与 filePath 二选一）" })),
			filePath: Type.Optional(Type.String({ description: "要归档的文件路径（PDF/Word/Image），与 content 二选一" })),
			sourceIdentity: Type.Optional(Type.String({ description: "原资料的稳定相对路径；默认从 filePath 文件名推导" })),
			folderContext: Type.Optional(Type.String({ description: "资料所在目录的组织语义，例如 AI研究 > 论文" })),
			sourceType: StringEnum(["text", "markdown", "conversation", "pdf", "word", "image"] as const, {
				description: "资料类型：text（纯文本）、markdown、conversation（对话片段）、pdf、word、image",
			}),
			tags: Type.Optional(Type.Array(Type.String(), { description: "标签列表，如 ['python', 'async']" })),
			origin: Type.Optional(
				StringEnum(["user_upload", "conversation", "web", "research", "agent_inferred"] as const, {
					description: "来源类型，默认根据 sourceType 自动推断",
				}),
			),
			url: Type.Optional(Type.String({ description: "来源 URL（网页、论文链接等）" })),
			sessionId: Type.Optional(Type.String({ description: "关联的会话 ID" })),
			force: Type.Optional(Type.Boolean({ description: "为 true 时跳过重复检查，强制归档" })),
		}),
			async execute(_toolCallId, params, signal, onUpdate, ctx) {
				if (isEnabled && !isEnabled()) return l2DisabledResult();
				const reportProgress = (text: string, phase: string): void => {
					try {
						onUpdate?.({
							content: [{ type: "text" as const, text }],
							details: { phase },
						});
					} catch {
						// Progress reporting is best-effort and must never fail archiving.
					}
				};
				reportProgress("等待归档队列", "queued");
				return enqueueArchive(l2DataDir, async () => {
				throwIfAborted(signal);
			ensureL2Directories(l2DataDir);
			const maintenanceContext = readMaintenanceContext(l2DataDir);

			const sourceType = params.sourceType as RawSourceType;
			const isFileType = sourceType === "pdf" || sourceType === "word" || sourceType === "image";
			reportProgress("正在准备归档", "preparing");

			// Resolve content: either from params.content or by parsing a file
			let content: string;
			let resolvedFilePath: string | undefined;

			if (isFileType && params.filePath) {
				// File-based: parse with LiteParse
				const workspaceDir = getActiveWorkspaceDir?.() || process.env.INNO_WORKSPACE_DIR || process.cwd();
				resolvedFilePath = isAbsolute(params.filePath)
					? params.filePath
					: resolve(workspaceDir, params.filePath);

				let parsed;
				try {
					reportProgress("正在解析文件", "parsing");
					parsed = await parseDocument(resolvedFilePath);
					reportProgress(`已提取 ${parsed.pageCount} 页，正在生成摘要`, "parsed");
				} catch (err) {
					logger.warn({ err, filePath: resolvedFilePath }, "l2_archive: failed to parse document");
					const msg = err instanceof DocumentParseError ? err.message : String(err);
					return {
						content: [{ type: "text" as const, text: `文件解析失败: ${msg}` }],
						details: { error: err instanceof DocumentParseError ? err.code : "parse_error" },
					};
				}

					content = parsed.text;
					throwIfAborted(signal);
			} else if (params.content) {
				// Text-based: use content directly
				content = params.content;
				reportProgress("正在准备文本内容", "prepared");
			} else {
				return {
					content: [{ type: "text" as const, text: "参数错误：必须提供 content（文本内容）或 filePath（文件路径）。" }],
					details: { error: "missing_content" },
				};
			}

				const contentHash = createHash("sha256").update(content).digest("hex").slice(0, 16);
				const promptSourceIdentity = params.sourceIdentity?.trim()
					|| (resolvedFilePath ? basename(resolvedFilePath) : params.title.trim());

					// Force reprocesses a stable source record; it must not manufacture a
					// second provenance identity for the same source page.
					const existing = findManifestByHash(l2DataDir, contentHash)
						?? (params.force ? findManifestBySourceIdentity(l2DataDir, promptSourceIdentity) : undefined);
				const completedArtifactsExist = Boolean(
					existing?.rawPath
					&& fileExists(join(l2DataDir, existing.rawPath))
					&& existing.extractedPath
					&& fileExists(join(l2DataDir, existing.extractedPath))
					&& existing?.wikiPages.length
					&& existing.wikiPages.every((pagePath) => fileExists(join(l2DataDir, pagePath))),
				);
				if (!params.force && existing?.status === "indexed" && completedArtifactsExist) {
					reportProgress("内容已归档，正在返回结果", "completed");
					return {
						content: [
							{
								type: "text" as const,
								text:
									`该内容已归档，无需重复保存。\n\n` +
									`- ID: ${existing.id}\n` +
									`- 标题: ${existing.title}\n` +
									`- Wiki 页面: ${existing.wikiPages.join(", ") || "无"}\n\n` +
									`如需强制归档，请设置 force: true。`,
							},
						],
						details: { id: existing.id, duplicate: true },
					};
				}

					const retryingSameContent = existing?.contentHash === contentHash;
					const existingRawPath = retryingSameContent && existing?.rawPath && fileExists(join(l2DataDir, existing.rawPath))
					? existing.rawPath
					: undefined;
				const rawPath = existingRawPath ?? (resolvedFilePath
					? saveRawFile(l2DataDir, params.title, resolvedFilePath, sourceType)
					: saveRaw(l2DataDir, params.title, content, sourceType, params.url));

				const id = existing?.id ?? `l2src_${randomUUID().slice(0, 8)}`;
				const tags = params.tags ?? [];

				// Convert to extracted markdown
					const existingExtractedPath = retryingSameContent && existing?.extractedPath && fileExists(join(l2DataDir, existing.extractedPath))
					? existing.extractedPath
					: undefined;
				const extractedPath = existingExtractedPath
					?? convertToExtracted(l2DataDir, params.title, content, sourceType);

				// Persist the recoverable source record before model/page work begins.
				const inferredOrigin = sourceType === "conversation" ? "conversation" : "user_upload";
					const entry: ManifestEntry = {
					...existing,
					id,
				title: params.title,
				sourceType,
				rawPath,
				extractedPath,
					wikiPages: (existing?.wikiPages ?? []).filter((pagePath) => fileExists(join(l2DataDir, pagePath))),
				tags,
				contentHash,
				status: "extracted",
					source: {
						...existing?.source,
					origin: (params.origin ?? inferredOrigin) as ManifestEntry["source"]["origin"],
					identity: promptSourceIdentity,
					...(params.url && { url: params.url }),
					...(params.sessionId && { sessionId: params.sessionId }),
				},
					createdAt: existing?.createdAt ?? new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					};
				upsertManifest(l2DataDir, entry);

				let wikiPagePath = "";
				let ingestWarnings: string[] = [];
				let reviewCount = 0;
				let linkMaintenance: {
					created: string[]; updated: string[]; unchanged: string[]; contested: string[];
					pages: string[]; sourcePageBody: string;
				};
				try {
						throwIfAborted(signal);
					// Create wiki source page (with LLM summary)
					const extractedContent = readText(join(l2DataDir, extractedPath));
						const wikiContext = [
							maintenanceContext.schema && `## Schema\n${maintenanceContext.schema}`,
							maintenanceContext.index && `## Existing index\n${maintenanceContext.index}`,
					].filter(Boolean).join("\n\n");
					let summaryBody = `## 摘要\n\n${extractedContent}`;
					let generationSourceContext = extractedContent;
					const analysisCheckpointPath = join(l2DataDir, "ingest-progress", `${entry.id}-${entry.contentHash}.json`);
					if (ctx.model) {
						reportProgress("正在生成摘要", "summarizing");
						const summary = await summarizeContent(
							ctx.model,
							ctx.modelRegistry,
							params.title,
							extractedContent,
							wikiContext,
							{
								checkpointPath: analysisCheckpointPath,
								sourceIdentity: promptSourceIdentity,
								folderContext: params.folderContext?.trim(),
								overview: maintenanceContext.overview,
								purpose: maintenanceContext.purpose,
								schema: maintenanceContext.schema,
								index: maintenanceContext.index,
								signal,
							},
						);
						if (!summary) throw new Error(`Wiki analysis failed for ${entry.rawPath}`);
						summaryBody = summary.analysis;
						generationSourceContext = summary.sourceContext;
					}
					wikiPagePath = getSourcePagePath(entry, promptSourceIdentity);
					if (ctx.model) reportProgress("正在生成 Wiki 页面", "generating");
					const rich = ctx.model
						? await generateRichWikiPages(
							l2DataDir,
							entry,
							summaryBody,
							generationSourceContext,
							{
								schema: maintenanceContext.schema,
								purpose: maintenanceContext.purpose,
								index: maintenanceContext.index,
								overview: maintenanceContext.overview,
								sourceIdentity: promptSourceIdentity,
							},
							ctx.model,
							ctx.modelRegistry,
							signal,
						)
						: null;
					if (ctx.model && !rich) {
						throw new Error(`Rich wiki generation failed for ${entry.rawPath}`);
					}
					if (rich) {
						ingestWarnings = rich.warnings;
						reviewCount = rich.reviews;
					}
					reportProgress("正在保存 Wiki 页面", "writing");
					if (!rich) {
						createSourcePage(l2DataDir, entry, summaryBody, extractedPath, promptSourceIdentity);
					}
					linkMaintenance = rich
						? {
							created: rich.created,
							updated: rich.updated,
							unchanged: [],
							contested: [],
							pages: rich.pages.filter((page) => page !== wikiPagePath),
							sourcePageBody: summaryBody,
						}
						: await maintainLinkedWikiPages(
							l2DataDir,
							entry,
							wikiPagePath,
							summaryBody,
							ctx.model,
							ctx.modelRegistry,
						);
					if (!rich && linkMaintenance.sourcePageBody !== summaryBody) {
						createSourcePage(l2DataDir, entry, linkMaintenance.sourcePageBody, extractedPath, promptSourceIdentity);
					}
						throwIfAborted(signal);
						entry.wikiPages = uniquePaths([
							...entry.wikiPages,
							...(rich ? rich.pages : [wikiPagePath, ...linkMaintenance.pages]),
						]);

					// Write index/log metadata before the completeness gate.
					// Their persistence failures are warnings, never a reason to retry
					// otherwise-complete generated pages.
					if (!rich) {
						try {
							appendLog(
								l2DataDir,
								"ingest",
								params.title,
								[
									`- ID: ${id}`,
									`- 类型: ${sourceType}`,
									`- 原始文件: ${rawPath}`,
									`- 提取文本: ${extractedPath}`,
									`- Source 页面: ${wikiPagePath}`,
									`- concepts/entities: 新建 ${linkMaintenance.created.length}, 更新 ${linkMaintenance.updated.length}, 不变 ${linkMaintenance.unchanged.length}, 争议 ${linkMaintenance.contested.length}`,
									`- 维护前上下文: schema ${maintenanceContext.schema.length} chars, index ${maintenanceContext.index.length} chars, recent log ${maintenanceContext.recentLog.length} chars`,
								].join("\n"),
							);
						} catch (err) {
							logger.warn({ err, source: params.title }, "l2_archive: failed to append ingest log");
						}
				}
				reportProgress("正在更新 Wiki 索引", "indexing");
				try {
					updateIndexAfterIngest(l2DataDir, entry.wikiPages);
				} catch (err) {
					logger.warn({ err, source: params.title }, "l2_archive: deterministic index update failed");
				}
				if (rich && !rich.aggregateWrites?.some((path) => path.replaceAll("\\", "/").toLowerCase() === "wiki/log.md")) {
					try {
						appendDeterministicIngestLog(l2DataDir, promptSourceIdentity);
					} catch (err) {
						const warning = `Deterministic log update failed: ${err instanceof Error ? err.message : String(err)}`;
						ingestWarnings.push(warning);
						logger.warn({ err, source: params.title }, "l2_archive: deterministic log update failed");
					}
				}

					if (rich && (rich.hardFailures.length > 0 || rich.unrecoveredTruncatedPaths.length > 0)) {
						const reasons = [
							rich.hardFailures.length > 0 ? `${rich.hardFailures.length} wiki file write failure(s)` : "",
							rich.unrecoveredTruncatedPaths.length > 0
								? `${rich.unrecoveredTruncatedPaths.length} truncated FILE block(s) could not be repaired: ${rich.unrecoveredTruncatedPaths.join(", ")}`
								: "",
						].filter(Boolean);
						throw new Error(`Ingest incomplete: ${reasons.join("; ")}`);
					}

					entry.status = "indexed";
					entry.updatedAt = new Date().toISOString();
					upsertManifest(l2DataDir, entry);

					// Retrieval is downstream of the same completeness gate as
					// The reference flow does not index partial writes. A
					// single retrieval-index failure is non-critical after the page
				// set has passed completeness and must not make the source retry.
				reportProgress("正在同步检索索引", "retrieving");
					let retrievalIndexFailed = false;
						for (const wikiPath of entry.wikiPages) {
							try {
								await l2Memory.indexPageByPath(wikiPath);
							} catch (err) {
								retrievalIndexFailed = true;
								logger.warn({ err, wikiPath, source: params.title }, "l2_archive: retrieval index update failed");
							}
						}
						if (retrievalIndexFailed) {
							const reconciled = typeof l2Memory.reconcile === "function" && await l2Memory.reconcile();
							if (!reconciled) logger.warn({ source: params.title }, "l2_archive: retrieval index remains out of sync");
						}
					try {
						if (fileExists(analysisCheckpointPath)) unlinkSync(analysisCheckpointPath);
					} catch (err) {
						logger.warn({ err, analysisCheckpointPath }, "l2_archive: failed to clear completed ingest checkpoint");
					}

				} catch (err) {
					entry.status = "error";
					entry.updatedAt = new Date().toISOString();
					upsertManifest(l2DataDir, entry);
					throw err;
					}

				reportProgress("归档完成", "completed");
				return {
					content: [
						{
							type: "text" as const,
							text:
								`资料已归档到 L2 Wiki。\n\n` +
								`- ID: ${id}\n` +
								`- 标题: ${params.title}\n` +
								`- 原始文件: ${rawPath}\n` +
								`- Wiki 页面: ${wikiPagePath}\n` +
								`- 自动维护: 新建 ${linkMaintenance.created.length} 个概念/实体页，更新 ${linkMaintenance.updated.length} 个\n` +
								`- 标签: ${tags.join(", ") || "无"}\n\n` +
								`Wiki 索引已更新。` +
								(reviewCount > 0 ? `\n- 待审阅事项: ${reviewCount} 个` : "") +
								(ingestWarnings.length > 0
									? `\n\n归档完成，但有 ${ingestWarnings.length} 条警告：\n${ingestWarnings.map((warning) => `- ${warning}`).join("\n")}`
									: ""),
						},
					],
					details: {
						id,
						rawPath,
						wikiPagePath,
						linkedPages: linkMaintenance.pages,
						reviewCount,
						warnings: ingestWarnings,
					},
				};
			});
		},
	});

	// ---- Tool 2: l2_query ----
	const queryTool = defineTool({
		name: "l2_query",
		label: "查询 L2 Wiki",
		description:
			"查询 L2 Wiki 知识库。当需要回答与已归档学习资料相关的问题时调用。" +
			"先读取索引，再定位和读取相关页面，综合回答。" +
			"参数 query 可省略或留空字符串，此时返回 Wiki 索引概览（用于查看有哪些内容）。",
		parameters: Type.Object({
			query: Type.Optional(
				Type.String({
					default: "",
					description:
						"查询关键词或问题，如「Python async」「上次读的论文」。留空或省略则返回 Wiki 索引概览。",
				}),
			),
		}),
		async execute(_toolCallId, params) {
			if (isEnabled && !isEnabled()) return l2DisabledResult();
			ensureL2Directories(l2DataDir);
			const query = params.query ?? "";
			const result = await queryWikiHybridDetailed(l2Memory, query);
			appendLog(l2DataDir, "query", query, "- L2 query executed through l2_query.");
			return {
				content: [{ type: "text" as const, text: result.text }],
				details: { disabled: false, mode: result.mode, hits: result.hits },
			};
		},
	});

	// ---- Tool 3: l2_lint ----
	const lintTool = defineTool({
		name: "l2_lint",
		label: "检查 L2 Wiki",
		description: "只读检查 L2 Wiki 的 frontmatter、双链、来源追溯、manifest 和 index 一致性。不会修改或自动修复文件。",
		parameters: Type.Object({}),
		async execute() {
			if (isEnabled && !isEnabled()) return l2DisabledResult();
			const report = runL2Lint(l2DataDir);
			return {
				content: [{ type: "text" as const, text: formatL2LintReport(report) }],
				details: { disabled: false, ...report },
			};
		},
	});

	return [archiveTool, queryTool, lintTool];
}
