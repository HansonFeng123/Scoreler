import type { SmartInputRule } from "../../../types/settings.js";

/**
 * Pure keyword-matching rules for smart input bubbles. Keywords match
 * literally (no regex metacharacters), including when a keyword touches other
 * text. A word preceded by a demonstrative (这/该/张/份) is flagged
 * high-confidence.
 */

export interface KwRange {
	start: number;
	end: number;
	word: string;
	/** High-confidence demonstrative reference — rendered with a solid underline. */
	hi: boolean;
	rule: SmartInputRule;
	/** Agent keywords use the skill picker instead of the file fill menu. */
	kind?: "file" | "agent";
}

export interface SlotRange {
	start: number;
	end: number;
	slotId: number;
}

export const PUA_BASE = 0xE000;

/** `{PUA char}` plus invisible NBSP caret padding — the atomic bubble token. */
export const TOKEN_RE = /\{([\uE000-\uF8FF])\}\u00A0*/g;

export function slotChar(id: number): string {
	return String.fromCharCode(PUA_BASE + id);
}

export function normalizeAgentCommand(value: string | { name: string }): string {
	const raw = typeof value === "string" ? value : value.name;
	return raw.trim().replace(/^\/+/, "");
}

export function agentRule(command: string): SmartInputRule {
	return {
		id: `smart-agent-${command}`,
		isPreset: true,
		keyword: `/${command}`,
		extensions: [],
		allExtensions: true,
		excludeExtensions: [],
		enabled: true,
	};
}

// tokenRegexFor runs on every sync for every slot; RegExp compilation is
// wasted work compared to reusing one instance per slot id.
const tokenRegexCache = new Map<number, RegExp>();

export function tokenRegexFor(id: number): RegExp {
	let re = tokenRegexCache.get(id);
	if (!re) {
		re = new RegExp(`\\{${slotChar(id)}\\}\\u00A0*`);
		tokenRegexCache.set(id, re);
	}
	return re;
}

export function tokenIdFromMatch(char: string): number {
	return char.codePointAt(0)! - PUA_BASE;
}

const DEMONSTRATIVE = /[这该张份]$/;

const AGENT_KEYWORD_RULE_BASE: Omit<SmartInputRule, "keyword"> = {
	id: "smart-agent-keyword",
	isPreset: true,
	extensions: [],
	allExtensions: true,
	excludeExtensions: [],
	enabled: true,
};

function isLatinKeyword(keyword: string): boolean {
	return /^[a-z0-9]+$/i.test(keyword);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function* matchKeyword(value: string, keyword: string): Generator<{ start: number; end: number; word: string }> {
	if (!keyword) return;
	const re = new RegExp(escapeRegExp(keyword), isLatinKeyword(keyword) ? "gi" : "g");
	let match: RegExpExecArray | null;
	while ((match = re.exec(value))) {
		yield { start: match.index, end: match.index + match[0].length, word: match[0] };
		if (match.index === re.lastIndex) re.lastIndex++;
	}
}

function isInsideSlashCommand(value: string, start: number): boolean {
	// The slash palette owns `/skill:...`; do not turn its `skill` prefix into
	// a second, nested keyword bubble while the user is filtering commands.
	return start > 0 && value[start - 1] === "/";
}

/**
 * Scan the composer text for bubble tokens (kept as slot ranges) and enabled
 * keyword occurrences (kept as keyword ranges). Keyword hits inside tokens
 * are skipped, and overlapping keyword hits keep the longest match so a
 * custom "文件夹" keyword does not render alongside the system "文件" match.
 * Ranges are sorted by start offset.
 */
export function analyzeKeywords(
	value: string,
	rules: SmartInputRule[],
	slotIds: Set<number>,
	agentKeywords: string[] = [],
): { kws: KwRange[]; slots: SlotRange[] } {
	const slots: SlotRange[] = [];
	TOKEN_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = TOKEN_RE.exec(value))) {
		const id = tokenIdFromMatch(match[1]);
		if (slotIds.has(id)) {
			slots.push({ start: match.index, end: match.index + match[0].length, slotId: id });
		}
	}
	const inSlot = (index: number) => slots.some((range) => index >= range.start && index < range.end);

	const candidates: KwRange[] = [];
	for (const rule of rules) {
		if (!rule.enabled || !rule.keyword) continue;
		for (const hit of matchKeyword(value, rule.keyword)) {
			if (inSlot(hit.start)) continue;
			const before = value.slice(Math.max(0, hit.start - 1), hit.start);
			candidates.push({ ...hit, hi: DEMONSTRATIVE.test(before), rule });
		}
	}
	for (const keyword of agentKeywords) {
		if (!keyword) continue;
		for (const hit of matchKeyword(value, keyword)) {
			if (inSlot(hit.start) || isInsideSlashCommand(value, hit.start)) continue;
			candidates.push({
				...hit,
				hi: false,
				kind: "agent",
				rule: { ...AGENT_KEYWORD_RULE_BASE, keyword },
			});
		}
	}
	// Rendered ranges cannot overlap: the mirror would otherwise append the
	// shared text twice (for example, "文件" + "文件夹" → "文件文件夹").
	// Prefer the longest keyword first; for equal-length duplicates, a system
	// preset remains the deterministic winner.
	const prioritized = [...candidates].sort((a, b) =>
		(b.end - b.start) - (a.end - a.start)
		|| Number(b.rule.isPreset === true) - Number(a.rule.isPreset === true)
		|| a.start - b.start,
	);
	const kws: KwRange[] = [];
	for (const candidate of prioritized) {
		if (kws.some((range) => candidate.start < range.end && range.start < candidate.end)) continue;
		kws.push(candidate);
	}
	kws.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
	slots.sort((a, b) => a.start - b.start);
	return { kws, slots };
}

/** Lifecycle of one bound file inside a slot, from the send pipeline's view. */
export type BoundFileState =
	| "workspace"   // already on the server — ships instantly
	| "local"       // OS file staged, uploads at send time
	| "uploading"   // upload in flight — cannot ship this turn
	| "failed";     // upload failed — stays retryable

export interface OutgoingFile {
	uid: number;
	name: string;
	/** Workspace-relative path (upload target for local files). */
	path: string;
	state: BoundFileState;
	/** Present for local files awaiting upload. */
	file?: File;
}

export interface OutgoingSlot {
	word: string;
	files: OutgoingFile[];
}

export interface BuildOutgoingResult {
	/** Visible text with every token replaced back by its plain word. */
	visibleText: string;
	/** Bindings whose files are already on the server. */
	readyBindings: Array<{ word: string; wordIndex: number; files: Array<{ uid: number; name: string; path: string }> }>;
	/** Local files still needing an upload, grouped per binding. */
	pendingFiles: Array<{ word: string; wordIndex: number; file: { uid: number; name: string; path: string; file: File } }>;
	/** Upload-in-progress or failed files that will not ship with the message. */
	skippedCount: number;
}

/**
 * Turn the composer state into the outgoing payload pieces: the visible text
 * (tokens → words) plus per-slot binding drafts. `wordIndex` is computed
 * against the final visible text so the message renderer can split on the
 * exact occurrence the user bound.
 */
export function buildOutgoing(value: string, slots: Map<number, OutgoingSlot>): BuildOutgoingResult {
	const tokenMatches: Array<{ start: number; end: number; id: number }> = [];
	TOKEN_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = TOKEN_RE.exec(value))) {
		tokenMatches.push({ start: match.index, end: match.index + match[0].length, id: tokenIdFromMatch(match[1]) });
	}

	const countOccurrences = (haystack: string, needle: string): number => {
		if (!needle) return 0;
		let count = 0;
		let index = haystack.indexOf(needle);
		while (index !== -1) {
			count++;
			index = haystack.indexOf(needle, index + needle.length);
		}
		return count;
	};

	let visible = "";
	let cursor = 0;
	const placed: Array<{ slot: OutgoingSlot; wordIndex: number }> = [];
	for (const { start, end, id } of tokenMatches) {
		const slot = slots.get(id);
		visible += value.slice(cursor, start);
		cursor = end;
		if (!slot) continue;
		// Occurrences of this word in the visible text produced so far — this
		// token's own restored word is not in the buffer yet.
		placed.push({ slot, wordIndex: countOccurrences(visible, slot.word) });
		visible += slot.word;
	}
	visible += value.slice(cursor);

	const readyBindings: BuildOutgoingResult["readyBindings"] = [];
	const pendingFiles: BuildOutgoingResult["pendingFiles"] = [];
	let skippedCount = 0;
	for (const { slot, wordIndex } of placed) {
		const ready = slot.files.filter((file) => file.state === "workspace");
		if (ready.length > 0) {
			readyBindings.push({
				word: slot.word,
				wordIndex,
				files: ready.map((file) => ({ uid: file.uid, name: file.name, path: file.path })),
			});
		}
		for (const file of slot.files) {
			if (file.state === "local" && file.file) {
				pendingFiles.push({ word: slot.word, wordIndex, file: { uid: file.uid, name: file.name, path: file.path, file: file.file } });
			} else if (file.state === "uploading" || file.state === "failed") {
				skippedCount++;
			}
		}
	}
	return { visibleText: visible, readyBindings, pendingFiles, skippedCount };
}
