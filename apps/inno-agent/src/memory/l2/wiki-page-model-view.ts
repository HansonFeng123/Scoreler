import { isMap, parseDocument } from "yaml";

import type { ConfidenceLevel, WikiPageStatus } from "./types.js";

const STORAGE_FIELDS = ["source_ids", "status", "confidence", "contested", "contradictions"] as const;

interface FrontmatterParts {
	prefix: string;
	body: string;
	suffix: string;
}

export interface WikiPageStorageMetadata {
	sourceIds: string[];
	status: WikiPageStatus;
	confidence: ConfidenceLevel;
	contested?: boolean;
	contradictions?: string[];
}

function splitFrontmatter(content: string): FrontmatterParts | null {
	const match = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/);
	if (!match) return null;
	return {
		prefix: match[1],
		body: match[2],
		suffix: `${match[3]}${content.slice(match[0].length)}`,
	};
}

function parseBody(body: string) {
	const document = parseDocument(body, { keepSourceTokens: true });
	if (document.errors.length > 0 || !isMap(document.contents)) return null;
	return document;
}

function keyName(key: unknown): string {
	if (key && typeof key === "object" && "value" in key) return String((key as { value: unknown }).value);
	return String(key ?? "");
}

function pairRanges(body: string, fields: ReadonlySet<string>): Array<{ start: number; end: number }> {
	const document = parseBody(body);
	if (!document || !isMap(document.contents)) return [];
	const items = document.contents.items;
	const ranges: Array<{ start: number; end: number }> = [];
	for (let index = 0; index < items.length; index += 1) {
		const pair = items[index];
		if (!fields.has(keyName(pair.key))) continue;
		const start = pair.key && "range" in pair.key && pair.key.range ? pair.key.range[0] : null;
		const next = items[index + 1]?.key;
		const end = next && "range" in next && next.range ? next.range[0] : body.length;
		if (typeof start === "number") ranges.push({ start, end });
	}
	return ranges;
}

function replaceFrontmatterBody(content: string, transform: (body: string) => string): string {
	const parts = splitFrontmatter(content);
	if (!parts) return content;
	return `${parts.prefix}${transform(parts.body)}${parts.suffix}`;
}

function removeFields(content: string, fieldNames: readonly string[]): string {
	return replaceFrontmatterBody(content, (body) => {
		const ranges = pairRanges(body, new Set(fieldNames));
		if (ranges.length === 0) return body;
		let result = body;
		for (const range of ranges.sort((a, b) => b.start - a.start)) {
			result = `${result.slice(0, range.start)}${result.slice(range.end)}`;
		}
		return result.replace(/^\s*\r?\n/, "").replace(/\r?\n\s*$/, "");
	});
}

function rawFrontmatter(content: string): Record<string, unknown> | null {
	const parts = splitFrontmatter(content);
	if (!parts) return null;
	const document = parseBody(parts.body);
	if (!document) return null;
	const value = document.toJS() as unknown;
	return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function stringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function insertFields(content: string, lines: string[]): string {
	return replaceFrontmatterBody(content, (body) => `${body.trimEnd()}${body.trim() ? "\n" : ""}${lines.join("\n")}`);
}

function serializedArray(values: readonly string[]): string {
	return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
}

function rewriteField(content: string, fieldName: string, line: string): string {
	return replaceFrontmatterBody(content, (body) => {
		const ranges = pairRanges(body, new Set([fieldName]));
		if (ranges.length === 0) {
			// A malformed sibling key can make the YAML AST unavailable even when
			// this top-level field is intact. Keep the reference ingest boundary's
			// line-level replacement semantics so normalization does not append a
			// duplicate date/source field and amplify the original model error.
			const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const topLevel = new RegExp(`(^|\\n)${escaped}[ \\t]*:[^\\r\\n]*`, "i");
			if (topLevel.test(body)) return body.replace(topLevel, (_match, prefix: string) => `${prefix}${line}`);
			return `${body.trimEnd()}${body.trim() ? "\n" : ""}${line}`;
		}
		const range = ranges[0];
		const original = body.slice(range.start, range.end);
		const ending = original.endsWith("\r\n") ? "\r\n" : original.endsWith("\n") ? "\n" : "";
		return `${body.slice(0, range.start)}${line}${ending}${body.slice(range.end)}`;
	});
}

export function readWikiFrontmatterArray(content: string, fieldName: string): string[] {
	return stringArray(rawFrontmatter(content)?.[fieldName]);
}

export function writeWikiFrontmatterArray(content: string, fieldName: string, values: readonly string[]): string {
	return rewriteField(content, fieldName, `${fieldName}: ${serializedArray(values)}`);
}

export function setWikiFrontmatterScalar(content: string, fieldName: string, value: string): string {
	return rewriteField(content, fieldName, `${fieldName}: ${value}`);
}

export function mergeWikiFrontmatterArrays(
	incomingContent: string,
	existingContent: string | null,
	fields: readonly string[],
): string {
	if (!existingContent) return incomingContent;
	let result = incomingContent;
	for (const field of fields) {
		const existing = readWikiFrontmatterArray(existingContent, field);
		if (existing.length === 0) continue;
		const incoming = readWikiFrontmatterArray(result, field);
		const seen = new Set<string>();
		const merged = [...existing, ...incoming].filter((value) => {
			const key = value.toLowerCase();
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
		if (merged.length === incoming.length && merged.every((value, index) => value === incoming[index])) continue;
		result = writeWikiFrontmatterArray(result, field, merged);
	}
	return result;
}

export function stripWikiPageStorageMetadata(content: string): string {
	return removeFields(content, STORAGE_FIELDS);
}

export function readWikiPageStorageMetadata(content: string): WikiPageStorageMetadata {
	const raw = rawFrontmatter(content) ?? {};
	return {
		sourceIds: stringArray(raw.source_ids),
		status: raw.status === "reviewed" || raw.status === "outdated" ? raw.status : "draft",
		confidence: raw.confidence === "low" || raw.confidence === "high" ? raw.confidence : "medium",
		...(typeof raw.contested === "boolean" && { contested: raw.contested }),
		...(stringArray(raw.contradictions).length > 0 && { contradictions: stringArray(raw.contradictions) }),
	};
}

export function applyWikiPageStorageMetadata(content: string, metadata: WikiPageStorageMetadata): string {
	const modelVisible = stripWikiPageStorageMetadata(content);
	const lines = [
		`source_ids: ${serializedArray(metadata.sourceIds)}`,
		`status: ${metadata.status}`,
		`confidence: ${metadata.confidence}`,
	];
	if (metadata.contested !== undefined) lines.push(`contested: ${metadata.contested}`);
	if (metadata.contradictions?.length) lines.push(`contradictions: ${serializedArray(metadata.contradictions)}`);
	return insertFields(modelVisible, lines);
}

export function unionWikiPageStorageMetadata(
	existing: WikiPageStorageMetadata,
	incoming: WikiPageStorageMetadata,
): WikiPageStorageMetadata {
	const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
	return {
		sourceIds: unique([...existing.sourceIds, ...incoming.sourceIds]),
		status: existing.status,
		confidence: existing.confidence,
		...(existing.contested || incoming.contested ? { contested: true } : {}),
		...(unique([...(existing.contradictions ?? []), ...(incoming.contradictions ?? [])]).length > 0
			? { contradictions: unique([...(existing.contradictions ?? []), ...(incoming.contradictions ?? [])]) }
			: {}),
	};
}
