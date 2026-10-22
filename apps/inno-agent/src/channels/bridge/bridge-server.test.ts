import { describe, expect, it } from "vitest";
import type { ChannelRegistry } from "../channel.js";
import type { PersonalChannelDispatcher } from "../personal-dispatcher.js";
import { handleBridgeMessage, type BridgeServerOptions } from "./bridge-server.js";

/**
 * Auth tests for the bridge message endpoint (issue #162: the bearer token
 * comparison must be constant-time and reject prefix/near-miss tokens).
 */

function makeOpts(): BridgeServerOptions {
	return {
		token: "secret-token",
		// Auth runs before registry/dispatcher are touched, so the cheapest
		// stubs that prove "auth passed" are enough: an unregistered channel
		// surfaces as 400, distinct from the 401 auth failure.
		channelRegistry: { get: () => undefined } as unknown as ChannelRegistry,
		dispatcher: { handle: async () => {} } as unknown as PersonalChannelDispatcher,
	};
}

const VALID_BODY = { channel: "qq", messageId: "m1", text: "hi" };

describe("handleBridgeMessage auth", () => {
	it("rejects a missing Authorization header", () => {
		expect(handleBridgeMessage(makeOpts(), undefined, VALID_BODY).status).toBe(401);
	});

	it("rejects a wrong token", () => {
		expect(handleBridgeMessage(makeOpts(), "Bearer wrong-token", VALID_BODY).status).toBe(401);
	});

	it("rejects prefix and extended near-miss tokens", () => {
		expect(handleBridgeMessage(makeOpts(), "Bearer secret-toke", VALID_BODY).status).toBe(401);
		expect(handleBridgeMessage(makeOpts(), "Bearer secret-tokenX", VALID_BODY).status).toBe(401);
	});

	it("rejects a non-Bearer scheme", () => {
		expect(handleBridgeMessage(makeOpts(), "secret-token", VALID_BODY).status).toBe(401);
	});

	it("accepts the exact token (falls through to channel validation)", () => {
		const result = handleBridgeMessage(makeOpts(), "Bearer secret-token", VALID_BODY);
		// 400 "not registered" proves the request passed authentication.
		expect(result.status).toBe(400);
		expect(result.body.error).toContain("not registered");
	});
});
