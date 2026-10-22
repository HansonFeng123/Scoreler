/**
 * Parse the compact command form kept in a sent user message. Agent bubbles
 * are atomic while editing, but the outgoing prompt still contains the slash
 * command so the backend can dispatch it.
 */
export interface AgentCommandMessage {
	command: string;
	args: string;
}

const AGENT_COMMAND_MESSAGE_RE = /^\/(\S+?)(?:\s+([\s\S]+))?$/;

export function parseAgentCommandMessage(text: string): AgentCommandMessage | null {
	const match = AGENT_COMMAND_MESSAGE_RE.exec(text.trim());
	if (!match) return null;
	const command = match[1].replace(/^\/+/, "");
	if (!command) return null;
	return { command, args: (match[2] ?? "").trim() };
}
