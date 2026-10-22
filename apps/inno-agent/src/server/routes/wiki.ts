import type { IncomingMessage as HttpReq, ServerResponse } from "node:http";
import { existsSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { logger } from "../../logger.js";
import { getL2Memory } from "../../memory/l2/l2-memory.js";
import { readManifest, removeWikiPathFromManifest } from "../../memory/l2/manifest-store.js";
import { buildWikiGraph } from "../../memory/l2/wiki-graph.js";
import { parseFrontmatter, rebuildIndex } from "../../memory/l2/wiki-maintainer.js";
import type { WikiIngestReview } from "../../memory/l2/wiki-generator.js";
import { ensureDir, readJsonl, readText, writeText } from "../../storage/file-store.js";
import { safeJoinReal } from "../file-helpers.js";
import { json, readBody, UPLOAD_MAX_BODY_BYTES } from "../http-helpers.js";
import { listWikiPagePaths } from "../../memory/l2/wiki-page-files.js";

export interface WikiRouteContext {
	l2DataDir: string;
}

// ---------------------------------------------------------------------------
// Helpers moved verbatim from server.ts (P2 route split). The two wiki
// listing helpers closed over server.ts's module-level l2DataDir; they take
// it as an explicit parameter instead.
// ---------------------------------------------------------------------------

function manifestSourceIdByWikiPath(l2DataDir: string): Map<string, string> {
	const map = new Map<string, string>();
	for (const entry of readManifest(l2DataDir)) {
		for (const wikiPath of entry.wikiPages) {
			map.set(wikiPath, entry.id);
		}
	}
	return map;
}

function sanitizeUploadName(name: string): string {
	const cleaned = name
		.replace(/[/\\?%*:|"<>]/g, "-")
		.replace(/\s+/g, " ")
		.trim();
	return cleaned || "upload";
}

function uploadExtension(fileName: string, mimeType: string): string {
	const ext = extname(fileName);
	if (ext) return ext;
	if (mimeType === "application/pdf") return ".pdf";
	if (mimeType.includes("wordprocessingml")) return ".docx";
	if (mimeType.includes("spreadsheetml")) return ".xlsx";
	if (mimeType.includes("presentationml")) return ".pptx";
	if (mimeType === "text/markdown") return ".md";
	if (mimeType.startsWith("image/")) return `.${mimeType.slice("image/".length).replace("jpeg", "jpg")}`;
	if (mimeType.startsWith("text/")) return ".txt";
	return ".bin";
}

/**
 * /api/wiki/* and /api/l2/raw/upload route domain. Returns true when the
 * request was handled. Extracted verbatim from server.ts during the P2 route
 * split — behavior unchanged. (The L2 upload route previously sat ~170 lines
 * below the wiki routes; exact-path matching makes the reordering inert.)
 */
export async function handleWikiRoutes(
	req: HttpReq,
	res: ServerResponse,
	method: string,
	url: string,
	ctx: WikiRouteContext,
): Promise<boolean> {
	const { l2DataDir } = ctx;

	// --- Wiki API ---
	if (method === "GET" && url === "/api/wiki/pages") {
		try {
			const sourceIds = manifestSourceIdByWikiPath(l2DataDir);
			const pages: unknown[] = [];
			for (const wikiPath of listWikiPagePaths(l2DataDir)) {
				const fullPath = join(l2DataDir, wikiPath);
				if (existsSync(fullPath)) {
					const content = readText(fullPath);
					const { frontmatter, body } = parseFrontmatter(content);
					pages.push({
						path: wikiPath,
						frontmatter,
						bodyPreview: body.slice(0, 200),
						sourceId: sourceIds.get(wikiPath) ?? "",
					});
				}
			}
			json(res, 200, pages);
		} catch (err) {
			logger.warn({ err }, "failed to list wiki pages");
			json(res, 200, []);
		}
		return true;
	}

	if (method === "GET" && url.startsWith("/api/wiki/page?")) {
		const params = new URL(url, "http://localhost").searchParams;
		const path = params.get("path");
		if (!path) {
			json(res, 400, { error: "Missing path parameter" });
			return true;
		}
		const fullPath = safeJoinReal(l2DataDir, path);
		if (!fullPath) {
			json(res, 400, { error: "Invalid wiki path" });
			return true;
		}
		if (!existsSync(fullPath)) {
			json(res, 404, { error: "Wiki page not found" });
			return true;
		}
		const content = readText(fullPath);
		json(res, 200, { path, content });
		return true;
	}

	if (method === "PUT" && url === "/api/wiki/page") {
		const body = (await readBody(req)) as Record<string, unknown>;
		const path = body.path as string | undefined;
		const content = body.content as string | undefined;
		if (!path || content === undefined) {
			json(res, 400, { error: "Missing path or content" });
			return true;
		}
		const fullPath = safeJoinReal(l2DataDir, path);
		if (!fullPath) {
			json(res, 400, { error: "Invalid wiki path" });
			return true;
		}
		writeText(fullPath, content);
		await getL2Memory(l2DataDir).indexPageByPath(path);
		try {
			rebuildIndex(l2DataDir, readManifest(l2DataDir));
		} catch (err) {
			logger.warn({ err, path }, "failed to rebuild wiki index after page update");
		}
		json(res, 200, { path, saved: true });
		return true;
	}

	if (method === "DELETE" && url.startsWith("/api/wiki/page?")) {
		const params = new URL(url, "http://localhost").searchParams;
		const path = params.get("path");
		if (!path) {
			json(res, 400, { error: "Missing path parameter" });
			return true;
		}
		const fullPath = safeJoinReal(l2DataDir, path);
		if (!fullPath) {
			json(res, 400, { error: "Invalid wiki path" });
			return true;
		}
		if (!existsSync(fullPath)) {
			json(res, 404, { error: "Wiki page not found" });
			return true;
		}
		try {
			rmSync(fullPath);
			removeWikiPathFromManifest(l2DataDir, path);
			await getL2Memory(l2DataDir).removePage(path);
			try {
				rebuildIndex(l2DataDir, readManifest(l2DataDir));
			} catch (err) {
				logger.warn({ err, path }, "failed to rebuild wiki index after page deletion");
			}
			json(res, 200, { path, deleted: true });
		} catch (err) {
			logger.warn({ err }, "failed to delete wiki page");
			json(res, 500, { error: "Failed to delete wiki page" });
		}
		return true;
	}

	if (method === "GET" && url === "/api/wiki/reviews") {
		try {
			const reviews = readJsonl<WikiIngestReview>(join(l2DataDir, "reviews.jsonl"))
				.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
			json(res, 200, reviews);
		} catch (err) {
			logger.warn({ err }, "failed to list wiki reviews");
			json(res, 200, []);
		}
		return true;
	}

	if (method === "GET" && url === "/api/wiki/graph") {
		try {
			json(res, 200, buildWikiGraph(l2DataDir));
		} catch (err) {
			logger.warn({ err }, "failed to build wiki graph");
			json(res, 200, { nodes: [], edges: [] });
		}
		return true;
	}

	if (method === "GET" && url === "/api/wiki/stats") {
		try {
			const entries = readManifest(l2DataDir);
			let totalSize = 0;
			let pageCount = 0;
			for (const wikiPath of listWikiPagePaths(l2DataDir)) {
				const fullPath = join(l2DataDir, wikiPath);
				if (existsSync(fullPath)) {
					totalSize += statSync(fullPath).size;
					pageCount++;
				}
			}
			json(res, 200, { pageCount, totalSize, entryCount: entries.length });
		} catch (err) {
			logger.warn({ err }, "failed to compute wiki stats");
			json(res, 200, { pageCount: 0, totalSize: 0, entryCount: 0 });
		}
		return true;
	}

	// --- L2 Raw Upload API ---
	if (method === "POST" && url === "/api/l2/raw/upload") {
		const body = (await readBody(req, { maxBytes: UPLOAD_MAX_BODY_BYTES })) as Record<string, unknown>;
		const fileName = typeof body.fileName === "string" ? body.fileName : "";
		const mimeType = typeof body.mimeType === "string" ? body.mimeType : "application/octet-stream";
		const dataBase64 = typeof body.dataBase64 === "string" ? body.dataBase64 : "";
		if (!fileName || !dataBase64) {
			json(res, 400, { error: "Missing fileName or dataBase64" });
			return true;
		}

		const dir = join(l2DataDir, "raw", "uploads");
		ensureDir(dir);
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
		const safeName = sanitizeUploadName(fileName);
		const ext = uploadExtension(safeName, mimeType);
		const base = basename(safeName, ext).slice(0, 80) || "upload";
		const outputName = `${timestamp}-${base}${ext}`;
		const outputPath = join(dir, outputName);
		const data = Buffer.from(dataBase64, "base64");
		writeFileSync(outputPath, data);
		const rawPath = join("raw", "uploads", outputName);
		json(res, 201, {
			fileName,
			mimeType,
			size: data.length,
			rawPath,
		});
		return true;
	}

	return false;
}
