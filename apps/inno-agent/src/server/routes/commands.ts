import type { IncomingMessage as HttpReq, ServerResponse } from "node:http";
import { listSlashCommands } from "../../agent/pi-runner.js";
import { json } from "../http-helpers.js";

/**
 * /api/commands route domain. Exposes the slash commands the agent session
 * can dispatch or expand (extension commands, prompt templates, skills) so
 * the web composer can offer Codex-style autocomplete. PI's builtin TUI
 * commands are not listed — the web UI surfaces those as app-level actions.
 */
export async function handleCommandsRoutes(
	req: HttpReq,
	res: ServerResponse,
	method: string,
	url: string,
): Promise<boolean> {
	if (method === "GET" && url === "/api/commands") {
		json(res, 200, { commands: listSlashCommands() });
		return true;
	}
	return false;
}
