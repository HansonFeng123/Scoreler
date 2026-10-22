import { statSync } from "node:fs";
import { logger } from "../logger.js";
import { resolveContainedPath } from "../utils/path-safety.js";
import { normalizeWorkspaceRelativePath } from "./file-helpers.js";

/**
 * Structured chat attachments (便捷输入 / plain file attachments).
 *
 * The web composer sends bindings (keyword bubbles with explicitly bound
 * workspace files) and loose attachments (plainly attached files) alongside
 * the untouched user prompt. The chat routes validate every path against the
 * session workspace before the turn starts; the agent later receives the
 * validated list as an appended context block while the persisted session
 * keeps the user's original text verbatim.
 */

export type AttachmentFileKind = "pdf" | "doc" | "xls" | "ppt" | "image" | "file";

export interface AttachmentRef {
	/** Workspace-relative path using forward slashes. */
	path: string;
	kind: AttachmentFileKind;
	source: "workspace" | "upload";
}

export interface AttachmentBinding {
	/** The literal keyword the user converted into a bubble. */
	word: string;
	/** Occurrence index of `word` in the visible message text (0-based). */
	wordIndex: number;
	files: AttachmentRef[];
}

export interface ChatAttachments {
	bindings: AttachmentBinding[];
	loose: AttachmentRef[];
}

/** Hard caps so a malformed client cannot smuggle in unbounded payloads. */
const MAX_BINDINGS = 32;
const MAX_FILES_PER_BINDING = 16;
const MAX_LOOSE = 64;

function parseRef(raw: unknown): AttachmentRef | null {
	if (!raw || typeof raw !== "object") return null;
	const record = raw as Record<string, unknown>;
	if (typeof record.path !== "string") return null;
	const path = normalizeWorkspaceRelativePath(record.path);
	if (!path) return null;
	const kind = typeof record.kind === "string" ? record.kind : "file";
	const source = record.source === "upload" ? "upload" : "workspace";
	return {
		path,
		kind: (["pdf", "doc", "xls", "ppt", "image", "file"] as const).includes(kind as AttachmentFileKind)
			? (kind as AttachmentFileKind)
			: "file",
		source,
	};
}

/**
 * Shape-validate the request-body `attachments` field. Returns null for
 * anything that is not a well-formed attachments object — a broken payload
 * degrades to "no attachments" rather than failing the whole turn.
 */
export function parseChatAttachments(raw: unknown): ChatAttachments | null {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
	const record = raw as Record<string, unknown>;
	const bindingsRaw = Array.isArray(record.bindings) ? record.bindings : [];
	const looseRaw = Array.isArray(record.loose) ? record.loose : [];

	const bindings: AttachmentBinding[] = [];
	for (const entry of bindingsRaw.slice(0, MAX_BINDINGS)) {
		if (!entry || typeof entry !== "object") continue;
		const binding = entry as Record<string, unknown>;
		if (typeof binding.word !== "string" || !binding.word.trim()) continue;
		const files = (Array.isArray(binding.files) ? binding.files : [])
			.slice(0, MAX_FILES_PER_BINDING)
			.map(parseRef)
			.filter((file): file is AttachmentRef => file !== null);
		if (files.length === 0) continue;
		const wordIndex = typeof binding.wordIndex === "number" && Number.isInteger(binding.wordIndex) && binding.wordIndex >= 0
			? binding.wordIndex
			: 0;
		bindings.push({ word: binding.word.trim(), wordIndex, files });
	}

	const loose = looseRaw
		.slice(0, MAX_LOOSE)
		.map(parseRef)
		.filter((file): file is AttachmentRef => file !== null);

	if (bindings.length === 0 && loose.length === 0) return null;
	return { bindings, loose };
}

/**
 * Validate every referenced path against the session workspace root: the path
 * must resolve inside it and point at an existing regular file. Invalid refs
 * are dropped (fail-closed) and logged; the remaining structure keeps its
 * order and grouping intact.
 */
export function validateChatAttachments(
	attachments: ChatAttachments,
	workspaceRoot: string,
): ChatAttachments {
	const isUsable = (path: string): boolean => {
		const resolved = resolveContainedPath(workspaceRoot, path);
		if (!resolved) return false;
		try {
			return statSync(resolved).isFile();
		} catch {
			return false;
		}
	};

	const bindings = attachments.bindings
		.map((binding) => {
			const files = binding.files
				.map((file) => {
					const path = normalizeWorkspaceRelativePath(file.path);
					if (isUsable(path)) return { ...file, path };
					logger.warn({ path: file.path, word: binding.word }, "chat attachment binding dropped: file missing or outside workspace");
					return null;
				})
				.filter((file): file is AttachmentRef => file !== null);
			return files.length > 0 ? { ...binding, files } : null;
		})
		.filter((binding): binding is AttachmentBinding => binding !== null);

	const loose = attachments.loose
		.map((file) => {
			const path = normalizeWorkspaceRelativePath(file.path);
			if (isUsable(path)) return { ...file, path };
			logger.warn({ path: file.path }, "chat loose attachment dropped: file missing or outside workspace");
			return null;
		})
		.filter((file): file is AttachmentRef => file !== null);

	return { bindings, loose };
}

/**
 * Build the context block appended to the model-visible copy of the user's
 * message. Paths are workspace-relative (the agent's cwd), so tools such as
 * `parse_document` / `ocr_image` can open them directly. Returns "" when
 * nothing survived validation.
 */
export function buildAttachmentContext(attachments: ChatAttachments): string {
	const bindingLines = attachments.bindings.map((binding) => {
		const files = binding.files.map((file) => file.path).join("、");
		return `- 第${binding.wordIndex + 1}个「${binding.word}」→ ${files}`;
	});
	const looseLines = attachments.loose.map((file) => `- ${file.path}`);
	if (bindingLines.length === 0 && looseLines.length === 0) return "";

	const sections: string[] = [];
	if (bindingLines.length > 0) {
		sections.push(`绑定关系（按关键词在用户原文中的出现位置标记；关键词后列出的文件是用户明确指向的内容）：\n${bindingLines.join("\n")}`);
	}
	if (looseLines.length > 0) {
		sections.push(`普通附件：\n${looseLines.join("\n")}`);
	}
	return `[用户本轮附带文件（路径均为当前工作区根目录下的相对路径；调用文件工具时请原样使用，不要添加工作区绝对路径、/ 或 ./ 前缀）：\n${sections.join("\n")}]`;
}
