import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGracefulShutdownHandler } from "./process-fallback.js";

function setup(shuttingDown = false, exitTimeoutMs?: number) {
	const state = { shuttingDown };
	const clients = [{ close: vi.fn() }, { close: vi.fn() }];
	const server = { close: vi.fn<(callback: () => void) => void>() };
	const wss = { clients, close: vi.fn<(callback: () => void) => void>() };
	const exit = vi.fn<(code: number) => void>();
	const shutdown = createGracefulShutdownHandler({ server, wss, exit, exitTimeoutMs }, state);
	return { state, clients, server, wss, exit, shutdown };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
});

describe("graceful shutdown handler", () => {
	it("closes every terminal client with 1001 before closing either server", () => {
		const { state, clients, server, wss, exit, shutdown } = setup();

		shutdown();

		expect(state.shuttingDown).toBe(true);
		for (const ws of clients) {
			expect(ws.close).toHaveBeenCalledExactlyOnceWith(1001, "Server shutting down");
			expect(ws.close.mock.invocationCallOrder[0]).toBeLessThan(server.close.mock.invocationCallOrder[0]);
		}
		expect(server.close).toHaveBeenCalledExactlyOnceWith(expect.any(Function));
		expect(wss.close).toHaveBeenCalledExactlyOnceWith(expect.any(Function));
		expect(server.close.mock.invocationCallOrder[0]).toBeLessThan(wss.close.mock.invocationCallOrder[0]);
		expect(exit).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(1);
	});

	it("exits immediately on a second call without repeating cleanup", () => {
		const { clients, server, wss, exit, shutdown } = setup();

		shutdown();
		shutdown();

		expect(exit).toHaveBeenCalledExactlyOnceWith(0);
		for (const ws of clients) expect(ws.close).toHaveBeenCalledTimes(1);
		expect(server.close).toHaveBeenCalledTimes(1);
		expect(wss.close).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(1);
	});

	it("forces exit at eight seconds even when close callbacks never finish", async () => {
		const { exit, shutdown } = setup();

		shutdown();
		await vi.advanceTimersByTimeAsync(7_999);
		expect(exit).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(exit).toHaveBeenCalledExactlyOnceWith(0);
	});

	it.each(["HTTP", "WebSocket"])("waits for both close callbacks when %s finishes first", async (first) => {
		const { server, wss, exit, shutdown } = setup();

		shutdown();
		const callbacks = [server.close.mock.calls[0][0], wss.close.mock.calls[0][0]];
		if (first === "WebSocket") callbacks.reverse();
		callbacks[0]();
		await vi.advanceTimersByTimeAsync(0);
		expect(exit).not.toHaveBeenCalled();
		callbacks[1]();
		await vi.advanceTimersByTimeAsync(0);
		expect(exit).toHaveBeenCalledExactlyOnceWith(0);
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(8_000);
		expect(exit).toHaveBeenCalledTimes(1);
	});

	it("uses an injected exit timeout", async () => {
		const { exit, shutdown } = setup(false, 50);

		shutdown();
		await vi.advanceTimersByTimeAsync(49);
		expect(exit).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(exit).toHaveBeenCalledExactlyOnceWith(0);
	});

	it("exits without cleanup when the shared shutdown state is already claimed", () => {
		const { clients, server, wss, exit, shutdown } = setup(true);

		shutdown();

		expect(exit).toHaveBeenCalledExactlyOnceWith(0);
		for (const ws of clients) expect(ws.close).not.toHaveBeenCalled();
		expect(server.close).not.toHaveBeenCalled();
		expect(wss.close).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("continues cleanup if one client or server close throws", async () => {
		const { clients, server, wss, exit, shutdown } = setup();
		clients[0].close.mockImplementation(() => { throw new Error("client close failed"); });
		server.close.mockImplementation(() => { throw new Error("server close failed"); });
		wss.close.mockImplementation((callback) => callback());

		shutdown();
		await vi.advanceTimersByTimeAsync(0);

		expect(clients[1].close).toHaveBeenCalledExactlyOnceWith(1001, "Server shutting down");
		expect(wss.close).toHaveBeenCalledTimes(1);
		expect(exit).toHaveBeenCalledExactlyOnceWith(0);
		expect(vi.getTimerCount()).toBe(0);
	});
});
