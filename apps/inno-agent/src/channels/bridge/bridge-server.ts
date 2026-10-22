import type { BridgeMessageBody, BridgeMessageResponse } from "./types.js";
import type { IncomingMessage, ChannelName } from "../types.js";
import type { PersonalChannelDispatcher } from "../personal-dispatcher.js";
import type { ChannelRegistry } from "../channel.js";
import { timingSafeEqual } from "node:crypto";
import { logger } from "../../logger.js";

const VALID_BRIDGE_CHANNELS = new Set<string>(["qq", "wechat"]);

export interface BridgeServerOptions {
	token: string;
	channelRegistry: ChannelRegistry;
	dispatcher: PersonalChannelDispatcher;
}

/** Constant-time bearer-token check (the token guards message injection). */
function bearerTokenMatches(authHeader: string | undefined, token: string): boolean {
	if (!authHeader) return false;
	const expected = Buffer.from(`Bearer ${token}`, "utf-8");
	const actual = Buffer.from(authHeader, "utf-8");
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function handleBridgeMessage(
	opts: BridgeServerOptions,
	authHeader: string | undefined,
	body: unknown,
): { status: number; body: BridgeMessageResponse } {
	if (!bearerTokenMatches(authHeader, opts.token)) {
		return { status: 401, body: { ok: false, error: "Unauthorized" } };
	}

	const msg = body as BridgeMessageBody;
	if (!msg.channel || !msg.messageId || !msg.text) {
		return { status: 400, body: { ok: false, error: "Missing required fields: channel, messageId, text" } };
	}

	if (!VALID_BRIDGE_CHANNELS.has(msg.channel)) {
		return { status: 400, body: { ok: false, error: `Invalid bridge channel: ${msg.channel}` } };
	}

	const channel = opts.channelRegistry.get(msg.channel);
	if (!channel) {
		return { status: 400, body: { ok: false, error: `Channel ${msg.channel} not registered` } };
	}

	const incoming: IncomingMessage = {
		channel: msg.channel as ChannelName,
		messageId: msg.messageId,
		chatId: msg.chatId,
		userId: msg.userId,
		text: msg.text,
		attachments: msg.attachments,
		raw: msg.raw ?? msg,
	};

	opts.dispatcher.handle(channel, incoming).catch((err) => {
		logger.error({ err }, `bridge dispatch error for ${msg.channel}/${msg.messageId}`);
	});

	return { status: 200, body: { ok: true } };
}
