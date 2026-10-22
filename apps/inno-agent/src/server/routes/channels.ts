import type { IncomingMessage as HttpReq, ServerResponse } from "node:http";
import { BridgeChannel } from "../../channels/bridge/bridge-channel.js";
import { handleBridgeMessage } from "../../channels/bridge/bridge-server.js";
import type { ChannelRegistry } from "../../channels/channel.js";
import { feishuRegistrationBegin, feishuRegistrationPoll } from "../../channels/feishu/feishu-registration.js";
import type { PersonalChannelDispatcher } from "../../channels/personal-dispatcher.js";
import type { ChannelName } from "../../channels/types.js";
import { WeChatChannel } from "../../channels/wechat/wechat-channel.js";
import { saveConfig, type InnoConfig } from "../../config.js";
import { logger } from "../../logger.js";
import { json, matchRoute, readBody } from "../http-helpers.js";

/**
 * Mutable server state the channels routes touch. `config` and
 * `wechatChannel` are reassigned at runtime (QR login flows), so they are
 * accessed through getters/setters rather than captured by value.
 */
export interface ChannelsRouteContext {
	channelRegistry: ChannelRegistry;
	dataDir: string;
	configPath: string;
	getConfig: () => InnoConfig;
	setConfig: (config: InnoConfig) => void;
	getDispatcher: () => PersonalChannelDispatcher | null;
	getBridgeToken: () => string | undefined;
	reloadFeishuChannel: () => Promise<void>;
	getWechatChannel: () => WeChatChannel | null;
	setWechatChannel: (channel: WeChatChannel) => void;
}

/**
 * /api/channels* and /api/bridge/* route domain. Returns true when the
 * request was handled. Extracted verbatim from server.ts during the P2
 * route split — behavior unchanged.
 */
export async function handleChannelsRoutes(
	req: HttpReq,
	res: ServerResponse,
	method: string,
	url: string,
	ctx: ChannelsRouteContext,
): Promise<boolean> {
	const { channelRegistry } = ctx;

	if (method === "GET" && url === "/api/channels") {
		json(res, 200, channelRegistry.all().map((channel) => {
			const isBridge = channel instanceof BridgeChannel;
			return {
				name: channel.name,
				mode: isBridge ? "bridge" : "native",
				enabled: true,
				hasDefaultTarget: Boolean(channelRegistry.getDefaultTarget(channel.name)),
			};
		}));
		return true;
	}

	const defaultTargetMatch = matchRoute("POST", method, url, "/api/channels/:name/default-target");
	if (defaultTargetMatch) {
		const body = await readBody(req) as Record<string, unknown>;
		const channel = channelRegistry.get(defaultTargetMatch.name);
		const chatId = typeof body.chatId === "string" ? body.chatId.trim() : "";
		if (!channel) {
			json(res, 404, { error: "Channel not found" });
			return true;
		}
		if (!chatId) {
			json(res, 400, { error: "Missing chatId" });
			return true;
		}
		channelRegistry.setDefaultTarget({
			channel: defaultTargetMatch.name as ChannelName,
			chatId,
		});
		json(res, 200, { channel: defaultTargetMatch.name, chatId });
		return true;
	}

	const channelTestMatch = matchRoute("POST", method, url, "/api/channels/:name/test");
	if (channelTestMatch) {
		const body = await readBody(req) as Record<string, unknown>;
		const channel = channelRegistry.get(channelTestMatch.name);
		const target = channelRegistry.getDefaultTarget(channelTestMatch.name);
		const text = typeof body.text === "string" && body.text.trim()
			? body.text.trim()
			: "Inno Agent 飞书主动推送测试。";
		if (!channel) {
			json(res, 404, { error: "Channel not found" });
			return true;
		}
		if (!target) {
			json(res, 400, { error: "No default target configured" });
			return true;
		}
		await channel.push(target, text);
		json(res, 200, { channel: channelTestMatch.name, chatId: target.chatId, pushed: true });
		return true;
	}

	// Bridge message endpoint
	if (method === "POST" && url === "/api/bridge/messages") {
		const bridgeToken = ctx.getBridgeToken();
		const dispatcher = ctx.getDispatcher();
		if (!bridgeToken || !dispatcher) {
			json(res, 404, { error: "Bridge not configured" });
			return true;
		}
		const body = await readBody(req);
		const authHeader = req.headers.authorization;
		const result = handleBridgeMessage(
			{ token: bridgeToken, channelRegistry, dispatcher },
			authHeader,
			body,
		);
		json(res, result.status, result.body);
		return true;
	}

	// Channel health endpoint
	const channelHealthMatch = matchRoute("GET", method, url, "/api/channels/:name/health");
	if (channelHealthMatch) {
		const channel = channelRegistry.get(channelHealthMatch.name);
		if (!channel) {
			json(res, 404, { error: "Channel not found" });
			return true;
		}
		if (channel instanceof BridgeChannel) {
			const health = await channel.checkHealth();
			json(res, 200, health);
		} else {
			json(res, 200, { channel: channel.name, mode: "native", healthy: true, checkedAt: new Date().toISOString() });
		}
		return true;
	}

	// Feishu QR device-flow registration
	if (method === "POST" && url === "/api/channels/feishu/qr-register") {
		try {
			const result = await feishuRegistrationBegin();
			json(res, 200, {
				deviceCode: result.deviceCode,
				qrUrl: result.verificationUri,
				expiresIn: result.expiresIn,
				interval: result.interval,
			});
		} catch (err) {
			logger.error({ err }, "[feishu] QR registration begin failed");
			json(res, 502, { error: err instanceof Error ? err.message : "Failed to start Feishu registration" });
		}
		return true;
	}

	if (method === "GET" && url.startsWith("/api/channels/feishu/qr-status")) {
		const deviceCode = new URL(url, "http://localhost").searchParams.get("deviceCode");
		if (!deviceCode) {
			json(res, 400, { error: "Missing deviceCode" });
			return true;
		}
		try {
			const result = await feishuRegistrationPoll(deviceCode);
			if (result.status === "confirmed" && result.appId && result.appSecret) {
				// Save credentials to config and start channel
				const config = ctx.getConfig();
				config.feishu = { appId: result.appId, appSecret: result.appSecret };
				if (!config.channels) config.channels = {};
				config.channels.feishu = {
					enabled: true,
					personalOnly: true,
					allowedUserIds: result.openId ? [result.openId] : [],
				};
				ctx.setConfig(saveConfig(ctx.configPath, config));
				await ctx.reloadFeishuChannel();
			}
			json(res, 200, { status: result.status });
		} catch (err) {
			logger.error({ err }, "[feishu] QR registration poll failed");
			json(res, 502, { error: err instanceof Error ? err.message : "Failed to poll Feishu registration" });
		}
		return true;
	}

	// WeChat iLink QR login
	if (method === "POST" && url === "/api/channels/wechat/qr-login") {
		// Lazily create the WeChat channel if not yet instantiated
		let wechatChannel = ctx.getWechatChannel();
		if (!wechatChannel) {
			wechatChannel = new WeChatChannel(ctx.dataDir, ctx.getConfig().channels?.wechat);
			channelRegistry.register(wechatChannel);
			ctx.setWechatChannel(wechatChannel);
		}
		try {
			const qr = await wechatChannel.getClient().getQrCode();
			const raw = qr.qrcode_img_content ?? "";
			logger.info(`[wechat] QR response: qrcode=${qr.qrcode}, img_content length=${raw.length}, prefix=${raw.slice(0, 40)}`);
			let qrUrl = raw;
			if (qrUrl && !qrUrl.startsWith("data:") && !qrUrl.startsWith("http")) {
				qrUrl = `data:image/png;base64,${qrUrl}`;
			}
			json(res, 200, { qrId: qr.qrcode, qrUrl });
		} catch (err) {
			logger.error({ err }, "WeChat QR login failed");
			json(res, 500, { error: err instanceof Error ? err.message : "Failed to get QR code" });
		}
		return true;
	}

	if (method === "GET" && url.startsWith("/api/channels/wechat/qr-status")) {
		const qrId = new URL(url, "http://localhost").searchParams.get("qrId");
		if (!qrId) {
			json(res, 400, { error: "Missing qrId" });
			return true;
		}
		const wechatChannel = ctx.getWechatChannel();
		if (!wechatChannel) {
			json(res, 400, { error: "WeChat channel not initialized" });
			return true;
		}
		try {
			const status = await wechatChannel.getClient().getQrCodeStatus(qrId);
			if (status.status === "confirmed" && status.bot_token) {
				wechatChannel.getClient().confirmLogin(status);
				// Start polling if not already running
				const dispatcher = ctx.getDispatcher();
				if (!wechatChannel.isConnected && dispatcher) {
					wechatChannel.onMessage((msg) => dispatcher.handle(wechatChannel, msg));
					wechatChannel.start();
				}
			}
			json(res, 200, { status: status.status, botId: status.ilink_bot_id });
		} catch (err) {
			logger.error({ err }, "WeChat QR status check failed");
			json(res, 500, { error: err instanceof Error ? err.message : "Failed to check QR status" });
		}
		return true;
	}

	if (method === "GET" && url === "/api/channels/wechat/status") {
		const wechatChannel = ctx.getWechatChannel();
		if (!wechatChannel) {
			json(res, 200, { configured: false, connected: false });
			return true;
		}
		json(res, 200, {
			configured: true,
			connected: wechatChannel.isConnected,
			botId: wechatChannel.botId || undefined,
			loggedIn: wechatChannel.getClient().isLoggedIn,
		});
		return true;
	}

	// Channel runs log
	if (method === "GET" && url === "/api/channels/runs") {
		const dispatcher = ctx.getDispatcher();
		if (dispatcher) {
			json(res, 200, dispatcher.getRunLog().list());
		} else {
			json(res, 200, []);
		}
		return true;
	}

	return false;
}
