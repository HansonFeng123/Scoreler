import type { IncomingMessage as HttpReq, ServerResponse } from "node:http";
import { existsSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { wikiPathJoin } from "../../memory/l2/wiki-paths.js";
import { logger } from "../../logger.js";
import { serializeFrontmatter } from "../../memory/l2/wiki-maintainer.js";
import { ensureDir, writeText } from "../../storage/file-store.js";
import type { RunRecordStore } from "../../terminal/run-record-store.js";
import type { TerminalSessionManager } from "../../terminal/terminal-session-manager.js";
import type { WorkspaceRegistry } from "../../workspace/workspace-registry.js";
import { json, matchRoute, readBody } from "../http-helpers.js";

/**
 * Practice-lab dependencies owned by server.ts. `terminalManager` and
 * `runRecordStore` are initialized during bootstrap and shared with the
 * WebSocket terminal handler, so they are injected rather than imported.
 */
export interface PracticeRouteContext {
	workspaceRegistry: WorkspaceRegistry;
	l2DataDir: string;
	terminalManager: TerminalSessionManager;
	runRecordStore: RunRecordStore;
}

/**
 * /api/terminal/sessions* and /api/runs* route domain (Practice Lab REST
 * side; the PTY WebSocket upgrade stays in server.ts). Returns true when the
 * request was handled. Extracted verbatim from server.ts during the P2 route
 * split — behavior unchanged.
 */
export async function handlePracticeRoutes(
	req: HttpReq,
	res: ServerResponse,
	method: string,
	url: string,
	ctx: PracticeRouteContext,
): Promise<boolean> {
	const { workspaceRegistry, l2DataDir, terminalManager, runRecordStore } = ctx;

	// --- Terminal sessions ---
	if (method === "POST" && url === "/api/terminal/sessions") {
		const body = (await readBody(req)) as Record<string, unknown>;
		const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
		if (!sessionId) { json(res, 400, { error: "Missing sessionId" }); return true; }
		const requestedWs = typeof body.workspaceId === "string" && body.workspaceId.trim()
			? body.workspaceId.trim()
			: workspaceRegistry.getSessionWorkspaceId(sessionId);
		const cols = typeof body.cols === "number" ? body.cols : 100;
		const rows = typeof body.rows === "number" ? body.rows : 24;
		try {
			const ts = terminalManager.create({ sessionId, workspaceId: requestedWs, cols, rows });
			json(res, 201, { id: ts.id, sessionId: ts.sessionId, workspaceId: ts.workspaceId, cwd: ts.cwd, status: "ready" });
		} catch (err) {
			logger.error({ err }, "failed to create terminal session");
			json(res, 400, { error: err instanceof Error ? err.message : "Failed to create terminal" });
		}
		return true;
	}

	const terminalCloseMatch = matchRoute("POST", method, url, "/api/terminal/sessions/:id/close");
	if (terminalCloseMatch) {
		terminalManager.close(decodeURIComponent(terminalCloseMatch.id));
		json(res, 200, { closed: true });
		return true;
	}

	// --- Runs ---
	if (method === "GET" && url.startsWith("/api/runs?")) {
		const params = new URL(url, "http://localhost").searchParams;
		const sessionId = params.get("sessionId") ?? "";
		const limit = Math.min(Number.parseInt(params.get("limit") ?? "20", 10) || 20, 100);
		if (!sessionId) { json(res, 400, { error: "Missing sessionId" }); return true; }
		json(res, 200, runRecordStore.listForSession(sessionId, limit));
		return true;
	}

	const runDetailMatch = matchRoute("GET", method, url.split("?")[0], "/api/runs/:id");
	if (runDetailMatch) {
		const record = runRecordStore.get(decodeURIComponent(runDetailMatch.id));
		if (!record) { json(res, 404, { error: "Run not found" }); return true; }
		const params = new URL(url, "http://localhost").searchParams;
		const lines = Math.min(Number.parseInt(params.get("lines") ?? "200", 10) || 200, 2000);
		const tail = runRecordStore.getOutputTail(record, lines);
		json(res, 200, { ...record, outputTail: tail });
		return true;
	}

	const runArchiveMatch = matchRoute("POST", method, url, "/api/runs/:id/archive");
	if (runArchiveMatch) {
		const record = runRecordStore.get(decodeURIComponent(runArchiveMatch.id));
		if (!record) { json(res, 404, { error: "Run not found" }); return true; }
		const body = (await readBody(req)) as Record<string, unknown>;
		const title = typeof body.title === "string" && body.title.trim()
			? body.title.trim()
			: `Run: ${record.command.slice(0, 40)}`;
		const note = typeof body.note === "string" ? body.note.trim() : "";
		const outputTail = runRecordStore.getOutputTail(record, 500);
		const ws = workspaceRegistry.getWorkspace(record.workspaceId);

		const now = new Date().toISOString();
		const wikiRelPath = wikiPathJoin("wiki", "analysis", `run-${record.id}.md`);
		const fullPath = join(l2DataDir, wikiRelPath);
		if (existsSync(fullPath)) {
			json(res, 409, { error: "Run already archived", path: wikiRelPath });
			return true;
		}
		ensureDir(dirname(fullPath));

		const tags = ["run", "code-execution"];
		if (ws) tags.push(`workspace:${ws.name}`);
		if (record.sourceFile) {
			const ext = extname(record.sourceFile).slice(1);
			if (ext) tags.push(`lang:${ext}`);
		}
		const exitCodeText = record.exitCode === null || record.exitCode === undefined
			? "(unknown)"
			: String(record.exitCode);
		const exitStatus = record.exitCode === 0 ? "成功" : record.exitCode !== null && record.exitCode !== undefined ? "失败" : "未完成";

		const frontmatter = serializeFrontmatter({
			title,
			created: record.startedAt,
			updated: now,
			type: "analysis",
			tags,
			sources: record.sourceFile ? [record.sourceFile] : [],
			source_ids: [],
			status: "draft",
			confidence: "high",
		});

		const bodyLines = [
			`# ${title}`,
			"",
			"## 元信息",
			`- 命令: \`${record.command}\``,
			`- 工作区: ${ws?.name ?? record.workspaceId} (\`${record.cwd}\`)`,
			record.sourceFile ? `- 源文件: \`${record.sourceFile}\`` : "",
			`- 开始: ${record.startedAt}`,
			record.endedAt ? `- 结束: ${record.endedAt}` : "",
			`- 退出码: ${exitCodeText} (${exitStatus})`,
			record.signal ? `- 信号: ${record.signal}` : "",
			`- run id: ${record.id}`,
			"",
			"## 输出",
			"```",
			outputTail || "(无输出)",
			"```",
		].filter(Boolean);
		if (note) {
			bodyLines.push("", "## 备注", note);
		}

		const content = `${frontmatter}\n\n${bodyLines.join("\n")}\n`;
		writeText(fullPath, content);
		json(res, 201, { path: wikiRelPath, title, runId: record.id });
		return true;
	}

	return false;
}
