/**
 * Showcase case exporter — core logic shared by:
 *   - the CLI: scripts/export-showcase-cases.ts (batch/publishing flow)
 *   - the backend: POST /api/sessions/:id/showcase-export (one-click flow)
 *
 * Reads a session JSONL, replays the same aggregation logic as server.ts's
 * parseSessionFile (user / assistant-turn merge / toolResult pairing),
 * sanitizes local paths and secrets, truncates bulky tool output, and writes
 * one case JSON plus an upserted index.json manifest into the out dir.
 *
 * IMPORTANT: exported cases are meant to be published. Always review the
 * output JSON before sharing — the sanitizer rewrites paths and common
 * secret shapes, but message CONTENT is preserved verbatim.
 */

import { existsSync, mkdirSync, copyFileSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { basename, dirname, extname, join, relative } from "node:path";

// --- Case spec ---------------------------------------------------------------

export interface CaseSpec {
	/** Showcase case id — becomes <id>.json and the page route. */
	id: string;
	/** Session JSONL file name inside the sessions dir. */
	sessionFile: string;
	title: string;
	titleEn: string;
	description: string;
	tags: string[];
	/** Keep only the first N user turns (and their assistant replies). */
	maxUserTurns?: number;
	/** Display name for the reconstructed workspace (defaults to the cwd basename). */
	workspaceName?: string;
	/** Workspace-relative paths excluded from the initial-file snapshot. */
	excludePaths?: string[];
}

export interface ShowcaseExportPaths {
	sessionsDir: string;
	dataDir: string;
	/** The cases dir: <id>.json, index.json and <id>/assets/ go here. */
	outDir: string;
}

export interface ShowcaseCaseIndexEntry {
	id: string;
	title: string;
	titleEn: string;
	description: string;
	tags: string[];
	recordedAt: string;
	messageCount: number;
}

/** `<file>.jsonl` → `<date>-<uuid8>`, e.g. `2026-06-05-019e9839`. */
export function deriveCaseId(sessionFile: string): string {
	return `${sessionFile.slice(0, 10)}-${sessionFile.match(/_([0-9a-f]{8})/)?.[1] ?? "session"}`;
}

// --- Sanitization ------------------------------------------------------------

export interface PathRewriteOptions {
	/** Dirs that contain `workspace-<id>` session dirs (mapped to /workspace). */
	workspaceContainers?: string[];
	/** Repo roots to redact to /inno-agent. */
	repoRoots?: string[];
}

export function buildPathRewrites(opts: PathRewriteOptions = {}): Array<[RegExp, string]> {
	const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const home = homedir(); // e.g. /Users/haohao
	const escapedHome = escapeRegExp(home);
	const rules: Array<[RegExp, string]> = [];
	// Longest first: workspace dirs inside each container, then the container.
	for (const container of opts.workspaceContainers ?? []) {
		const escaped = escapeRegExp(container);
		rules.push(
			[new RegExp(`${escaped}[\\\\/]workspace-[a-z0-9-]+`, "gi"), "/workspace"],
			[new RegExp(escaped, "gi"), "/workspace"],
		);
	}
	for (const root of opts.repoRoots ?? []) {
		rules.push([new RegExp(escapeRegExp(root), "gi"), "/inno-agent"]);
	}
	rules.push(
		// Any other absolute path under the user's home (covers runtime/data, ~/.inno-agent).
		[new RegExp(`${escapedHome}[\\\\/]\\.inno-agent`, "gi"), "~/.inno-agent"],
		[new RegExp(escapedHome, "gi"), "~"],
		// Generic fallback for other users' paths quoted in tool output.
		[/\/Users\/[^\s/"']+/g, "~"],
		// Repo-dir name remnants in paths that escaped the root rewrite above
		// (e.g. recorded under a different checkout layout).
		[/inno-agent-open/g, "inno-agent"],
	);
	// Unix owner column in `ls -la` output, mentions in paths, etc.
	const username = userInfo().username;
	if (username && username.length >= 3) {
		rules.push([new RegExp(`\\b${escapeRegExp(username)}\\b`, "g"), "learner"]);
	}
	return rules;
}

/** Exact-cwd rule: paths under the session's own workspace → /workspace. */
function workspaceCwdRewrite(cwd: string): [RegExp, string] {
	return [new RegExp(cwd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "/workspace"];
}

const SECRET_PATTERNS: Array<[RegExp, string]> = [
	// Common API key shapes: sk-*, tvly-*, ghp_*, xox*, Bearer tokens, etc.
	// A separator (-, _, space) after the prefix is REQUIRED — without it,
	// minified JS like `skipHtmlTags` or `a.pkLongMethod()` false-positives
	// and the [REDACTED] substitution breaks the exported page's scripts.
	[/\b(sk|pk|pat|tvly|ghp|gho|xox[bap]|Bearer)[-_ ][-_A-Za-z0-9]{8,}\b/g, "[REDACTED]"],
	[/"(apiKey|api_key|token|accessToken|refreshToken|secret)"\s*:\s*"[^"]{6,}"/g, '"$1": "[REDACTED]"'],
	[/\\"(apiKey|api_key|token|accessToken|refreshToken|secret)\\"\s*:\s*\\"[^\\"]{6,}\\"/g, '\\"$1\\": \\"[REDACTED]\\"'],
];

function sanitizeText(input: string, rewrites: Array<[RegExp, string]>): string {
	let out = input;
	for (const [pattern, replacement] of rewrites) out = out.replace(pattern, replacement);
	for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement);
	return out;
}

function sanitizeValue<T>(value: T, rewrites: Array<[RegExp, string]>): T {
	if (typeof value === "string") return sanitizeText(value, rewrites) as T;
	if (Array.isArray(value)) return value.map((v) => sanitizeValue(v, rewrites)) as T;
	if (value && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = sanitizeValue(v, rewrites);
		return out as T;
	}
	return value;
}

function truncateText(text: string, max: number): string {
	if (text.length <= max) return text;
	const kept = text.slice(0, max);
	return `${kept}\n… [已截断，原文共 ${text.length} 字符 / truncated from ${text.length} chars]`;
}

const LIMITS = {
	thinking: 4000,
	toolArgs: 1200,
	toolResult: 2000,
};

// --- Session parsing (mirrors parseSessionFile in server.ts) -----------------

interface ShowcaseToolRecord {
	toolCallId: string;
	toolName: string;
	args: unknown;
	result?: unknown;
	isError?: boolean;
}

/**
 * One ordered piece of an assistant turn, used by the showcase to synthesize
 * a live-like SSE stream (text/thinking deltas, tool start/end). `at`/`endAt`
 * are absolute ms timestamps from the session log; the replayer clamps the
 * gaps so pacing feels real without dead air.
 */
type ShowcaseStreamSegment =
	| { kind: "thinking"; text: string; at: number }
	| { kind: "text"; text: string; at: number }
	| {
			kind: "tool";
			toolCallId: string;
			toolName: string;
			args: unknown;
			result?: unknown;
			isError?: boolean;
			at: number;
			endAt: number;
	  };

interface ShowcaseMessage {
	role: "user" | "assistant";
	content: string;
	timestamp: number;
	thinking?: string;
	tools?: ShowcaseToolRecord[];
	/** Ordered blocks of this turn (assistant messages only). */
	stream?: ShowcaseStreamSegment[];
}

export function textFromContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => {
			if (!part || typeof part !== "object") return "";
			const record = part as Record<string, unknown>;
			return record.type === "text" && typeof record.text === "string" ? record.text : "";
		})
		.filter(Boolean)
		.join("\n")
		.trim();
}

function parseSessionMessages(filePath: string): ShowcaseMessage[] {
	const raw = readFileSync(filePath, "utf-8");
	const lines = raw.split("\n").filter((line) => line.trim().length > 0);
	const messages: ShowcaseMessage[] = [];

	let pendingAssistant: ShowcaseMessage | null = null;
	let pendingStream: ShowcaseStreamSegment[] = [];
	const finalizeAssistant = () => {
		if (pendingAssistant) {
			if (pendingStream.length > 0) pendingAssistant.stream = pendingStream;
			messages.push(pendingAssistant);
			pendingAssistant = null;
			pendingStream = [];
		}
	};
	const ensureAssistant = (timestamp: number): ShowcaseMessage => {
		if (!pendingAssistant) pendingAssistant = { role: "assistant", content: "", timestamp };
		return pendingAssistant;
	};

	for (const line of lines) {
		const entry = JSON.parse(line) as Record<string, unknown>;
		if (entry.type !== "message" || !entry.message || typeof entry.message !== "object") continue;
		const message = entry.message as Record<string, unknown>;
		const role = message.role;
		const ts = typeof entry.timestamp === "string" ? Date.parse(entry.timestamp) : Date.now();

		if (role === "user") {
			finalizeAssistant();
			const content = textFromContent(message.content);
			if (!content) continue;
			messages.push({ role: "user", content, timestamp: ts });
			continue;
		}

		if (role === "assistant") {
			const pending = ensureAssistant(ts);
			const content = message.content;
			if (Array.isArray(content)) {
				for (const part of content) {
					if (!part || typeof part !== "object") continue;
					const block = part as Record<string, unknown>;
					if (block.type === "text" && typeof block.text === "string") {
						pending.content = pending.content ? `${pending.content}\n${block.text}` : block.text;
						pendingStream.push({ kind: "text", text: block.text, at: ts });
					} else if (block.type === "thinking" && typeof block.thinking === "string") {
						pending.thinking = pending.thinking ? `${pending.thinking}\n${block.thinking}` : block.thinking;
						pendingStream.push({ kind: "thinking", text: block.thinking, at: ts });
					} else if (block.type === "toolCall") {
						const toolCallId = typeof block.id === "string" ? block.id : "";
						const toolName = typeof block.name === "string" ? block.name : "tool";
						pending.tools = pending.tools ?? [];
						pending.tools.push({ toolCallId, toolName, args: block.arguments });
						pendingStream.push({
							kind: "tool",
							toolCallId,
							toolName,
							args: block.arguments,
							at: ts,
							endAt: ts,
						});
					}
				}
			} else if (typeof content === "string" && content) {
				pending.content = pending.content ? `${pending.content}\n${content}` : content;
				pendingStream.push({ kind: "text", text: content, at: ts });
			}
			pending.timestamp = ts;
			if (typeof message.stopReason === "string" && message.stopReason !== "toolUse") {
				finalizeAssistant();
			}
			continue;
		}

		if (role === "toolResult") {
			const pending = ensureAssistant(ts);
			const toolCallId = typeof message.toolCallId === "string" ? message.toolCallId : "";
			const toolName = typeof message.toolName === "string" ? message.toolName : "tool";
			const result = textFromContent(message.content) || message.content;
			const isError = Boolean(message.isError);
			pending.tools = pending.tools ?? [];
			const existing = pending.tools.find((t) => t.toolCallId === toolCallId);
			if (existing) {
				existing.result = result;
				existing.isError = isError;
			} else {
				pending.tools.push({ toolCallId, toolName, args: undefined, result, isError });
			}
			const segment = pendingStream.find((s) => s.kind === "tool" && s.toolCallId === toolCallId && s.result === undefined);
			if (segment && segment.kind === "tool") {
				segment.result = result;
				segment.isError = isError;
				segment.endAt = ts;
			} else if (!existing) {
				// toolCall block missing from the log (e.g. compacted away) — still
				// stream the result so the replay stays in order.
				pendingStream.push({ kind: "tool", toolCallId, toolName, args: undefined, result, isError, at: ts, endAt: ts });
			}
			continue;
		}
	}
	finalizeAssistant();
	// Drop empty assistant turns (e.g. aborted before any content streamed).
	return messages.filter((m) =>
		m.role === "user" ? !!m.content : m.content || m.thinking || (m.tools && m.tools.length > 0),
	);
}

// --- Panel reconstruction (workspace / wiki / profile) -----------------------
// The showcase replays not just the chat but the side panels' evolution. All
// keyframes carry `atMessage` = index into the exported messages array, so
// they must be extracted from the TRIMMED but PRE-TRUNCATION message list.

interface WorkspaceInitFile {
	path: string;
	content?: string;
	asset?: string;
	size: number;
	updatedAt: string;
}

interface WorkspaceKeyframe {
	atMessage: number;
	/** Tool call that produced this file state — the mock backend reveals the
	 *  file the moment that tool's tool_end is streamed. */
	toolCallId: string;
	path: string;
	/** Inline text content. Absent for binary files, which carry `asset`. */
	content?: string;
	/** Static asset path (cases/<id>/assets/...) for binary files. */
	asset?: string;
	/** On-disk size; needed for asset keyframes (no content to measure). */
	size?: number;
	change: "created" | "modified";
}

interface WikiKeyframe {
	atMessage: number;
	toolCallId: string;
	page: { path: string; title: string; content: string };
}

interface ProfileEvent {
	atMessage: number;
	toolCallId: string;
	summary: string;
}

interface CasePanels {
	workspace: {
		workspaceId: string;
		name: string;
		initial: WorkspaceInitFile[];
		keyframes: WorkspaceKeyframe[];
	} | null;
	wiki: { keyframes: WikiKeyframe[] };
	profile: {
		firstEventAt: number | null;
		events: ProfileEvent[];
		profile: unknown | null;
	};
}

const MAX_KEYFRAME_CONTENT = 60_000;
const MAX_INLINE_TEXT_FILE = 100_000;
/** Swept HTML gets a higher inline cap: generated handouts/slides are the
 *  showcase's headline artifacts, and the product's HtmlPreview only renders
 *  inline content (srcdoc) — an asset-only HTML file would preview blank. */
const MAX_INLINE_HTML_FILE = 600_000;
const MAX_ASSET_FILE = 8 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set([
	".md", ".txt", ".json", ".jsonl", ".csv", ".tsv", ".py", ".js", ".mjs", ".ts",
	".html", ".css", ".sh", ".yaml", ".yml", ".xml", ".svg", ".tex", ".log", ".typ",
]);

export function readSessionCwd(filePath: string): { cwd: string; startedAt: number } | null {
	const raw = readFileSync(filePath, "utf-8");
	for (const line of raw.split("\n")) {
		if (!line.trim()) continue;
		const entry = JSON.parse(line) as Record<string, unknown>;
		if (entry.type === "session" && typeof entry.cwd === "string") {
			return { cwd: entry.cwd, startedAt: Date.parse(String(entry.timestamp ?? "")) || 0 };
		}
	}
	return null;
}

/** Execution window of every tool call: assistant-message ts → toolResult ts. */
interface ToolWindow {
	toolCallId: string;
	startMs: number;
	endMs: number;
}

function readToolWindows(filePath: string): ToolWindow[] {
	const raw = readFileSync(filePath, "utf-8");
	const windows = new Map<string, ToolWindow>();
	for (const line of raw.split("\n")) {
		if (!line.trim()) continue;
		const entry = JSON.parse(line) as Record<string, unknown>;
		if (entry.type !== "message") continue;
		const ts = Date.parse(String(entry.timestamp ?? "")) || 0;
		const msg = entry.message as Record<string, unknown> | undefined;
		if (!msg) continue;
		if (msg.role === "assistant" && Array.isArray(msg.content)) {
			for (const part of msg.content as Array<Record<string, unknown>>) {
				if (part?.type === "toolCall" && typeof part.id === "string" && !windows.has(part.id)) {
					windows.set(part.id, { toolCallId: part.id, startMs: ts, endMs: ts });
				}
			}
		} else if (msg.role === "toolResult" && typeof msg.toolCallId === "string") {
			const win = windows.get(msg.toolCallId);
			if (win && ts >= win.startMs) win.endMs = ts;
		}
	}
	return [...windows.values()].sort((a, b) => a.startMs - b.startMs);
}

/** Extract workspace write/edit keyframes from tool calls. */
function extractWorkspaceKeyframes(
	messages: ShowcaseMessage[],
	cwd: string,
	rewrites: Array<[RegExp, string]>,
): WorkspaceKeyframe[] {
	const keyframes: WorkspaceKeyframe[] = [];
	const virtualFs = new Map<string, string>();
	messages.forEach((message, atMessage) => {
		if (message.role !== "assistant" || !message.tools) return;
		for (const tool of message.tools) {
			if (tool.isError) continue;
			const args = tool.args as Record<string, unknown> | undefined;
			if (!args || typeof args.path !== "string") continue;
			const absPath = args.path;
			if (!absPath.startsWith(cwd)) continue;
			const relPath = absPath.slice(cwd.length).replace(/^[/\\]+/, "");
			if (!relPath) continue;

			if (tool.toolName === "write" && typeof args.content === "string") {
				const content = truncateText(sanitizeText(args.content, rewrites), MAX_KEYFRAME_CONTENT);
				keyframes.push({ atMessage, toolCallId: tool.toolCallId, path: relPath, content, change: virtualFs.has(relPath) ? "modified" : "created" });
				virtualFs.set(relPath, content);
			} else if (tool.toolName === "edit" && Array.isArray(args.edits)) {
				let prior = virtualFs.get(relPath);
				if (prior === undefined) {
					// Edit targets a file the session didn't write (e.g. a
					// pre-existing .skills file excluded from the initial
					// snapshot). Seed the virtual FS from the current on-disk
					// content so the file preview resolves during replay; the
					// recorded edits typically no longer apply (their oldText
					// is already gone), which degrades gracefully to "final
					// state shown from the first edit".
					const abs = join(cwd, relPath);
					if (!existsSync(abs) || statSync(abs).size > MAX_KEYFRAME_CONTENT) continue;
					prior = readFileSync(abs, "utf-8");
				}
				let next = prior;
				for (const edit of args.edits as Array<Record<string, unknown>>) {
					const oldText = typeof edit.oldText === "string" ? edit.oldText : "";
					const newText = typeof edit.newText === "string" ? edit.newText : "";
					if (oldText && next.includes(oldText)) next = next.replace(oldText, newText);
				}
				const content = truncateText(sanitizeText(next, rewrites), MAX_KEYFRAME_CONTENT);
				keyframes.push({ atMessage, toolCallId: tool.toolCallId, path: relPath, content, change: "modified" });
				virtualFs.set(relPath, content);
			}
		}
	});
	return keyframes;
}

/** Snapshot files that existed in the workspace BEFORE the session started. */
function collectInitialFiles(
	cwd: string,
	sessionStartMs: number,
	keyframedPaths: Set<string>,
	caseAssetsDir: string,
	caseId: string,
	rewrites: Array<[RegExp, string]>,
	excludePaths: Set<string> = new Set(),
): WorkspaceInitFile[] {
	if (!existsSync(cwd)) return [];
	const files: WorkspaceInitFile[] = [];
	const cutoff = sessionStartMs - 30_000;
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
				continue;
			}
			const stat = statSync(full);
			if (stat.mtimeMs > cutoff) continue; // created/modified during the session
			const relPath = relative(cwd, full).split("\\").join("/");
			if (keyframedPaths.has(relPath) || excludePaths.has(relPath)) continue;
			const ext = extname(entry.name).toLowerCase();
			const record: WorkspaceInitFile = {
				path: relPath,
				size: stat.size,
				updatedAt: stat.mtime.toISOString(),
			};
			if (TEXT_EXTENSIONS.has(ext) && stat.size <= MAX_INLINE_TEXT_FILE) {
				record.content = sanitizeText(readFileSync(full, "utf-8"), rewrites);
			} else if (stat.size <= MAX_ASSET_FILE) {
				const assetRel = join(caseAssetsDir, relPath);
				mkdirSync(dirname(assetRel), { recursive: true });
				copyFileSync(full, assetRel);
				record.asset = `cases/${caseId}/assets/${relPath}`;
			} else {
				continue; // too large — skip entirely
			}
			files.push(record);
		}
	};
	walk(cwd);
	return files.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Sweep files the session produced WITHOUT write/edit tool calls — typically
 * via bash (pandoc, generate.py, typst, …). The write/edit keyframe extractor
 * only sees tool args, so these files would never appear in the replayed
 * workspace. We attribute each such file to the tool call whose execution
 * window contains its creation time (birthtime, falling back to mtime), so
 * the mock backend reveals it at roughly the moment it was really produced.
 *
 * Caveat: content is read from disk NOW, i.e. the file's final state — if a
 * later session rewrote it, the replay shows the newer content (same
 * degradation as edit-keyframe seeding).
 */
function sweepGeneratedFiles(
	cwd: string,
	sessionStartMs: number,
	sessionEndMs: number,
	windows: ToolWindow[],
	toolMessageIndex: Map<string, number>,
	keyframedPaths: Set<string>,
	caseAssetsDir: string,
	caseId: string,
	rewrites: Array<[RegExp, string]>,
	excludePaths: Set<string> = new Set(),
): WorkspaceKeyframe[] {
	if (!existsSync(cwd) || sessionEndMs <= 0) return [];
	const inSession = (t: number) => t >= sessionStartMs - 30_000 && t <= sessionEndMs + 120_000;
	const swept: WorkspaceKeyframe[] = [];
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
				continue;
			}
			const relPath = relative(cwd, full).split("\\").join("/");
			if (keyframedPaths.has(relPath) || excludePaths.has(relPath)) continue;
			const stat = statSync(full);
			const createdMs = stat.birthtimeMs > 0 ? stat.birthtimeMs : stat.mtimeMs;
			const createdInSession = inSession(createdMs);
			if (!createdInSession && !inSession(stat.mtimeMs)) continue;
			const ts = createdInSession ? createdMs : stat.mtimeMs;

			// Attribute to the tool call that was running when the file appeared;
			// fall back to the most recent call that finished just before it.
			let owner = windows.find((w) => ts >= w.startMs - 1_000 && ts <= w.endMs + 4_000);
			if (!owner) {
				const prior = windows.filter((w) => w.endMs <= ts + 1_000);
				owner = prior[prior.length - 1];
			}
			if (!owner) continue;
			const atMessage = toolMessageIndex.get(owner.toolCallId);
			if (atMessage === undefined) continue; // tool call trimmed away (maxUserTurns)

			const ext = extname(entry.name).toLowerCase();
			const inlineCap = ext === ".html" || ext === ".htm" ? MAX_INLINE_HTML_FILE : MAX_INLINE_TEXT_FILE;
			const keyframe: WorkspaceKeyframe = {
				atMessage,
				toolCallId: owner.toolCallId,
				path: relPath,
				size: stat.size,
				change: createdInSession ? "created" : "modified",
			};
			if (TEXT_EXTENSIONS.has(ext) && stat.size <= inlineCap) {
				keyframe.content = truncateText(sanitizeText(readFileSync(full, "utf-8"), rewrites), inlineCap);
			} else if (stat.size <= MAX_ASSET_FILE) {
				const assetRel = join(caseAssetsDir, relPath);
				mkdirSync(dirname(assetRel), { recursive: true });
				copyFileSync(full, assetRel);
				keyframe.asset = `cases/${caseId}/assets/${relPath}`;
			} else {
				continue; // too large — skip entirely
			}
			swept.push(keyframe);
		}
	};
	walk(cwd);
	// The streaming driver auto-selects the FIRST keyframe of a tool call when
	// its tool_end lands — prefer viewer-friendly files so e.g. the generated
	// handout HTML opens instead of a build intermediate.
	const EXT_PRIORITY = [".html", ".md", ".pdf", ".pptx"];
	return swept.sort((a, b) => {
		if (a.atMessage !== b.atMessage) return a.atMessage - b.atMessage;
		if (a.toolCallId !== b.toolCallId) return a.toolCallId.localeCompare(b.toolCallId);
		const pa = EXT_PRIORITY.indexOf(extname(a.path).toLowerCase());
		const pb = EXT_PRIORITY.indexOf(extname(b.path).toLowerCase());
		return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb) || a.path.localeCompare(b.path);
	});
}

/** Wiki keyframes: each successful l2_archive call contributes one page. */
function extractWikiKeyframes(messages: ShowcaseMessage[], rewrites: Array<[RegExp, string]>): WikiKeyframe[] {
	const keyframes: WikiKeyframe[] = [];
	messages.forEach((message, atMessage) => {
		if (message.role !== "assistant" || !message.tools) return;
		for (const tool of message.tools) {
			if (tool.toolName !== "l2_archive" || tool.isError) continue;
			const args = tool.args as Record<string, unknown> | undefined;
			if (!args || typeof args.title !== "string" || typeof args.content !== "string") continue;
			const resultText = typeof tool.result === "string" ? tool.result : "";
			const pathMatch = /Wiki 页面[::]\s*(\S+\.md)/.exec(resultText);
			const slug = args.title.toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60);
			keyframes.push({
				atMessage,
				toolCallId: tool.toolCallId,
				page: {
					path: pathMatch?.[1] ?? `wiki/sources/${slug}.md`,
					title: sanitizeText(args.title, rewrites),
					content: truncateText(sanitizeText(args.content, rewrites), MAX_KEYFRAME_CONTENT),
				},
			});
		}
	});
	return keyframes;
}

/** Profile events + a sanitized snapshot of the current learner profile. */
function extractProfilePanel(
	messages: ShowcaseMessage[],
	dataDir: string,
	rewrites: Array<[RegExp, string]>,
): CasePanels["profile"] {
	const events: ProfileEvent[] = [];
	messages.forEach((message, atMessage) => {
		if (message.role !== "assistant" || !message.tools) return;
		for (const tool of message.tools) {
			if (tool.toolName !== "record_learning_event" || tool.isError) continue;
			const args = tool.args as Record<string, unknown> | undefined;
			const payload = (args?.payload ?? {}) as Record<string, unknown>;
			const topic = typeof payload.milestone === "string" ? payload.milestone
				: typeof payload.topic === "string" ? payload.topic
				: typeof args?.event_type === "string" ? args.event_type : "learning event";
			events.push({ atMessage, toolCallId: tool.toolCallId, summary: sanitizeText(topic, rewrites) });
		}
	});
	let profile: unknown | null = null;
	if (events.length > 0) {
		const profilePath = join(dataDir, "learner", "profile.json");
		if (existsSync(profilePath)) {
			const raw = JSON.parse(readFileSync(profilePath, "utf-8")) as Record<string, unknown>;
			raw.learner_id = "demo-learner";
			profile = sanitizeValue(raw, rewrites);
		}
	}
	return {
		firstEventAt: events.length > 0 ? events[0].atMessage : null,
		events,
		profile,
	};
}

// --- Export pipeline ---------------------------------------------------------

function trimToUserTurns(messages: ShowcaseMessage[], maxUserTurns: number): ShowcaseMessage[] {
	let userTurns = 0;
	for (let i = 0; i < messages.length; i++) {
		if (messages[i].role === "user") userTurns++;
		if (userTurns > maxUserTurns) return messages.slice(0, i);
	}
	return messages;
}

function polishMessages(messages: ShowcaseMessage[], rewrites: Array<[RegExp, string]>): ShowcaseMessage[] {
	return messages.map((m) => {
		const out: ShowcaseMessage = {
			role: m.role,
			content: truncateText(sanitizeText(m.content, rewrites), 20000),
			timestamp: m.timestamp,
		};
		if (m.thinking) out.thinking = truncateText(sanitizeText(m.thinking, rewrites), LIMITS.thinking);
		const polishArgs = (args: unknown): unknown => {
			const clean = sanitizeValue(args, rewrites);
			const argsJson = JSON.stringify(clean);
			if (argsJson && argsJson.length > LIMITS.toolArgs && clean && typeof clean === "object") {
				// Shrink oversized string fields inside args (usually file contents).
				for (const [k, v] of Object.entries(clean as Record<string, unknown>)) {
					if (typeof v === "string" && v.length > 2000) {
						(clean as Record<string, unknown>)[k] = truncateText(v, 2000);
					}
				}
			}
			return clean;
		};
		const polishResult = (result: unknown): unknown =>
			typeof result === "string"
				? truncateText(sanitizeText(result, rewrites), LIMITS.toolResult)
				: sanitizeValue(result, rewrites);
		if (m.tools?.length) {
			out.tools = m.tools.map((tool) => {
				const record: ShowcaseToolRecord = {
					toolCallId: tool.toolCallId,
					toolName: tool.toolName,
					args: polishArgs(tool.args),
				};
				if (tool.result !== undefined) record.result = polishResult(tool.result);
				if (tool.isError) record.isError = true;
				return record;
			});
		}
		if (m.stream?.length) {
			out.stream = m.stream.map((seg) => {
				if (seg.kind === "thinking") {
					return { kind: "thinking", text: truncateText(sanitizeText(seg.text, rewrites), LIMITS.thinking), at: seg.at };
				}
				if (seg.kind === "text") {
					return { kind: "text", text: truncateText(sanitizeText(seg.text, rewrites), 20000), at: seg.at };
				}
				const tool: ShowcaseStreamSegment = {
					kind: "tool",
					toolCallId: seg.toolCallId,
					toolName: seg.toolName,
					args: polishArgs(seg.args),
					at: seg.at,
					endAt: seg.endAt,
				};
				if (seg.result !== undefined) tool.result = polishResult(seg.result);
				if (seg.isError) tool.isError = true;
				return tool;
			});
		}
		return out;
	});
}

/**
 * Export one session into `<paths.outDir>/<spec.id>.json` (+ assets).
 * Returns the index entry, or null when the session file is missing.
 *
 * `baseRewrites` come from buildPathRewrites(); an exact-cwd rule for the
 * session's workspace is prepended automatically so absolute workspace paths
 * in messages/args collapse to /workspace even when the workspace lives
 * outside any configured container.
 */
export function exportShowcaseCase(
	spec: CaseSpec,
	paths: ShowcaseExportPaths,
	baseRewrites: Array<[RegExp, string]>,
): ShowcaseCaseIndexEntry | null {
	const sessionPath = join(paths.sessionsDir, spec.sessionFile);
	if (!existsSync(sessionPath)) return null;
	mkdirSync(paths.outDir, { recursive: true });

	const sessionInfo = readSessionCwd(sessionPath);
	const rewrites = sessionInfo ? [workspaceCwdRewrite(sessionInfo.cwd), ...baseRewrites] : baseRewrites;

	let rawMessages = parseSessionMessages(sessionPath);
	if (spec.maxUserTurns) rawMessages = trimToUserTurns(rawMessages, spec.maxUserTurns);

	// Panels first — keyframe indices must align with the trimmed message
	// list, and file contents must be captured before polishMessages
	// truncates tool args.
	let workspacePanel: CasePanels["workspace"] = null;
	if (sessionInfo) {
		const wsKeyframes = extractWorkspaceKeyframes(rawMessages, sessionInfo.cwd, rewrites);
		// Files produced via bash (generated HTML/PDF/PPTX, downloaded
		// assets, …) leave no write/edit args — sweep them from disk and
		// attribute each to the tool call running when it appeared. The
		// window ends at the last TRIMMED message: a session JSONL can keep
		// accumulating entries for weeks (reopens, model switches), which
		// would wrongly swallow files later sessions created in the same
		// workspace.
		const toolMessageIndex = new Map<string, number>();
		rawMessages.forEach((m, i) => m.tools?.forEach((t) => toolMessageIndex.set(t.toolCallId, i)));
		const lastMessageMs = rawMessages.reduce((max, m) => Math.max(max, m.timestamp || 0), 0);
		const swept = sweepGeneratedFiles(
			sessionInfo.cwd,
			sessionInfo.startedAt,
			lastMessageMs,
			readToolWindows(sessionPath),
			toolMessageIndex,
			new Set(wsKeyframes.map((k) => k.path)),
			join(paths.outDir, spec.id, "assets"),
			spec.id,
			rewrites,
			new Set(spec.excludePaths ?? []),
		);
		const keyframes = [...wsKeyframes, ...swept];
		const initial = collectInitialFiles(
			sessionInfo.cwd,
			sessionInfo.startedAt,
			new Set(keyframes.map((k) => k.path)),
			join(paths.outDir, spec.id, "assets"),
			spec.id,
			rewrites,
			new Set(spec.excludePaths ?? []),
		);
		workspacePanel = {
			workspaceId: `ws-${spec.id}`,
			name: spec.workspaceName ?? basename(sessionInfo.cwd),
			initial,
			keyframes,
		};
	}
	const wikiPanel = { keyframes: extractWikiKeyframes(rawMessages, rewrites) };
	const profilePanel = extractProfilePanel(rawMessages, paths.dataDir, rewrites);

	const messages = polishMessages(rawMessages, rewrites);

	const recordedAt = spec.sessionFile.slice(0, 10);
	const title = spec.title ||
		rawMessages.find((m) => m.role === "user")?.content.replace(/\s+/g, " ").slice(0, 40) ||
		spec.id;
	const caseDoc = {
		id: spec.id,
		title,
		titleEn: spec.titleEn,
		description: spec.description,
		tags: spec.tags,
		recordedAt,
		messageCount: messages.length,
		messages,
		panels: {
			workspace: workspacePanel,
			wiki: wikiPanel,
			profile: profilePanel,
		},
	};
	writeFileSync(join(paths.outDir, `${spec.id}.json`), JSON.stringify(caseDoc));
	return {
		id: spec.id,
		title,
		titleEn: spec.titleEn,
		description: spec.description,
		tags: spec.tags,
		recordedAt,
		messageCount: messages.length,
	};
}

/** Upsert entries into <outDir>/index.json (keyed by case id). */
export function upsertShowcaseIndex(outDir: string, entries: ShowcaseCaseIndexEntry[]): void {
	const indexPath = join(outDir, "index.json");
	const byId = new Map<string, ShowcaseCaseIndexEntry>();
	if (existsSync(indexPath)) {
		try {
			const prior = JSON.parse(readFileSync(indexPath, "utf-8")) as { cases?: ShowcaseCaseIndexEntry[] };
			for (const entry of prior.cases ?? []) {
				if (typeof entry.id === "string") byId.set(entry.id, entry);
			}
		} catch { /* unreadable index — start fresh */ }
	}
	for (const entry of entries) byId.set(entry.id, entry);
	writeFileSync(indexPath, JSON.stringify({ cases: [...byId.values()] }, null, 2));
}
