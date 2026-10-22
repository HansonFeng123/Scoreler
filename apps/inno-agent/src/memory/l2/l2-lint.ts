import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parse as parseYaml } from "yaml";

import { fileExists, readText } from "../../storage/file-store.js";
import { readManifest } from "./manifest-store.js";
import type { WikiPageFrontmatter, WikiPageType } from "./types.js";
import { buildAliasIndex, extractOutgoingLinks } from "./wiki-links.js";
import { parseFrontmatter } from "./wiki-maintainer.js";
import { listWikiPagePaths } from "./wiki-page-files.js";
import { parseWikiSchemaRouting, validateWikiPageRouting, type WikiSchemaRouting } from "./wiki-schema-routing.js";

const REQUIRED_FIELDS = ["title", "created", "type", "tags", "sources", "source_ids", "updated", "status", "confidence"] as const;
const BUILT_IN_TYPES = new Set<WikiPageType>(["source-summary", "source", "entity", "concept", "query", "comparison", "synthesis", "analysis"]);
const VALID_STATUSES = new Set(["draft", "reviewed", "outdated"]);
const VALID_CONFIDENCE = new Set(["low", "medium", "high"]);

export type L2LintSeverity = "error" | "warning";
export type L2LintCode =
	| "missing_frontmatter"
	| "invalid_frontmatter"
	| "missing_required_field"
	| "invalid_field_value"
	| "missing_provenance"
	| "dangling_link"
	| "unknown_source_id"
	| "missing_source_file"
	| "manifest_page_missing"
	| "index_missing_page"
	| "index_stale_page"
	| "incomplete_archive";

export interface L2LintFinding {
	code: L2LintCode;
	severity: L2LintSeverity;
	path: string;
	message: string;
}

export interface L2LintReport {
	pagesChecked: number;
	sourcesChecked: number;
	errors: number;
	warnings: number;
	findings: L2LintFinding[];
}

interface PageRecord {
	path: string;
	title: string;
	body: string;
	frontmatter: WikiPageFrontmatter | null;
	rawFrontmatter: Record<string, unknown> | null;
}

function normalizePath(value: string): string {
	return value.replace(/\\/g, "/");
}

function fileExistsWithin(root: string, relativePath: string): boolean {
	const absoluteRoot = resolve(root);
	const target = resolve(absoluteRoot, relativePath);
	const fromRoot = relative(absoluteRoot, target);
	if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) return false;
	return fileExists(target);
}

function finding(code: L2LintCode, severity: L2LintSeverity, path: string, message: string): L2LintFinding {
	return { code, severity, path: normalizePath(path), message };
}

function wikiPagePaths(l2DataDir: string): string[] {
	return listWikiPagePaths(l2DataDir);
}

function readPage(l2DataDir: string, path: string, findings: L2LintFinding[], routing: WikiSchemaRouting): PageRecord {
	const content = readText(join(l2DataDir, path));
	const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) {
		findings.push(finding("missing_frontmatter", "error", path, "Page has no complete YAML frontmatter block."));
		return {
			path,
			title: basename(path, extname(path)),
			body: content,
			frontmatter: null,
			rawFrontmatter: null,
		};
	}

	let rawFrontmatter: Record<string, unknown> | null = null;
	try {
		const parsed = parseYaml(match[1]) as unknown;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("frontmatter must be a mapping");
		rawFrontmatter = parsed as Record<string, unknown>;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		findings.push(finding("invalid_frontmatter", "error", path, `YAML frontmatter cannot be parsed: ${message}`));
		return {
			path,
			title: basename(path, extname(path)),
			body: match[2],
			frontmatter: null,
			rawFrontmatter: null,
		};
	}

	for (const field of REQUIRED_FIELDS) {
		if (!(field in rawFrontmatter)) {
			findings.push(finding("missing_required_field", "error", path, `Frontmatter is missing required field: ${field}.`));
		}
	}

	const { frontmatter, body } = parseFrontmatter(content);
	if (frontmatter) {
		if (!BUILT_IN_TYPES.has(frontmatter.type) && !routing.typeDirs[frontmatter.type]) {
			findings.push(finding("invalid_field_value", "error", path, `Unknown page type: ${String(frontmatter.type)}.`));
		}
		const routingIssue = validateWikiPageRouting(path, content, routing);
		if (routingIssue) findings.push(finding("invalid_field_value", "error", path, routingIssue.message));
		if (!VALID_STATUSES.has(frontmatter.status)) {
			findings.push(finding("invalid_field_value", "error", path, `Unknown page status: ${String(frontmatter.status)}.`));
		}
		if (!VALID_CONFIDENCE.has(frontmatter.confidence)) {
			findings.push(finding("invalid_field_value", "error", path, `Unknown confidence: ${String(frontmatter.confidence)}.`));
		}
		if (frontmatter.type !== "analysis" && frontmatter.source_ids.length === 0) {
			findings.push(finding("missing_provenance", "warning", path, "Knowledge page has no source_ids provenance."));
		}
	}

	return {
		path,
		title: frontmatter?.title || basename(path, extname(path)),
		body,
		frontmatter,
		rawFrontmatter,
	};
}

function indexedWikiPaths(l2DataDir: string): Set<string> {
	const index = readText(join(l2DataDir, "wiki", "index.md"));
	const paths = new Set<string>();
	const pattern = /`(wiki[\\/][^`]+\.md)`/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(index)) !== null) paths.add(normalizePath(match[1]));
	const wikilinkPattern = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
	while ((match = wikilinkPattern.exec(index)) !== null) paths.add(normalizePath(`wiki/${match[1]}.md`));
	return paths;
}

/** Run deterministic, read-only structural checks over one L2 Wiki root. */
export function runL2Lint(l2DataDir: string): L2LintReport {
	const findings: L2LintFinding[] = [];
	const manifest = readManifest(l2DataDir);
	const schemaPath = join(l2DataDir, "wiki", "SCHEMA.md");
	const routing = parseWikiSchemaRouting(fileExists(schemaPath) ? readText(schemaPath) : "");
	const manifestIds = new Set(manifest.map((entry) => entry.id));
	const pagePaths = wikiPagePaths(l2DataDir);
	const actualPagePaths = new Set(pagePaths.map(normalizePath));
	const pages = pagePaths.map((path) => readPage(l2DataDir, path, findings, routing));

	const alias = buildAliasIndex(pages);
	for (const page of pages) {
		for (const link of extractOutgoingLinks(page.body)) {
			if (!alias.resolve(link)) {
				findings.push(finding("dangling_link", "warning", page.path, `Wikilink does not resolve: [[${link}]].`));
			}
		}
		for (const sourceId of page.frontmatter?.source_ids ?? []) {
			if (!manifestIds.has(sourceId)) {
				findings.push(finding("unknown_source_id", "error", page.path, `source_ids references unknown manifest id: ${sourceId}.`));
			}
		}
	}

	for (const entry of manifest) {
		if (entry.status !== "indexed") {
			findings.push(finding("incomplete_archive", "warning", "manifest.jsonl", `Source ${entry.id} is ${entry.status}, not indexed.`));
		}
		for (const sourcePath of [entry.rawPath, entry.extractedPath].filter((value): value is string => Boolean(value))) {
			if (!fileExistsWithin(l2DataDir, sourcePath)) {
				findings.push(finding("missing_source_file", "error", "manifest.jsonl", `Source ${entry.id} is missing file: ${sourcePath}.`));
			}
		}
		for (const pagePath of entry.wikiPages) {
			if (!fileExistsWithin(l2DataDir, pagePath)) {
				findings.push(finding("manifest_page_missing", "error", "manifest.jsonl", `Source ${entry.id} references missing page: ${pagePath}.`));
			}
		}
	}

	const indexedPaths = indexedWikiPaths(l2DataDir);
	for (const pagePath of actualPagePaths) {
		if (!indexedPaths.has(pagePath)) {
			findings.push(finding("index_missing_page", "warning", "wiki/index.md", `Wiki page is absent from index: ${pagePath}.`));
		}
	}
	for (const pagePath of indexedPaths) {
		if (!actualPagePaths.has(pagePath)) {
			findings.push(finding("index_stale_page", "warning", "wiki/index.md", `Index references missing page: ${pagePath}.`));
		}
	}

	findings.sort((a, b) =>
		a.severity.localeCompare(b.severity) || a.path.localeCompare(b.path) || a.code.localeCompare(b.code) || a.message.localeCompare(b.message),
	);
	return {
		pagesChecked: pages.length,
		sourcesChecked: manifest.length,
		errors: findings.filter((item) => item.severity === "error").length,
		warnings: findings.filter((item) => item.severity === "warning").length,
		findings,
	};
}

export function formatL2LintReport(report: L2LintReport): string {
	const heading = `L2 Lint：检查 ${report.pagesChecked} 个页面、${report.sourcesChecked} 个来源；${report.errors} 个错误、${report.warnings} 个警告。`;
	if (report.findings.length === 0) return `${heading}\n\n未发现结构问题。`;
	return [
		heading,
		"",
		...report.findings.map((item) => `- [${item.severity}] ${item.code} · \`${item.path}\` — ${item.message}`),
	].join("\n");
}
