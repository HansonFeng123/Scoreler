import { describe, expect, it, vi } from "vitest";
import { createTaskQueue, QueueTaskCancelledError } from "./task-queue.js";

function gate() {
	let release!: () => void;
	const promise = new Promise<void>(resolve => { release = resolve; });
	return { promise, release };
}

describe("session task queue", () => {
	it("cancels waiting work promptly and never runs it later", async () => {
		const enqueue = createTaskQueue(), blocker = gate(), aborter = new AbortController();
		const running = enqueue(() => blocker.promise);
		const mutation = vi.fn(async () => "unexpected");
		const queued = enqueue(mutation, { signal: aborter.signal });
		const rejected = expect(queued).rejects.toBeInstanceOf(QueueTaskCancelledError);
		aborter.abort();
		await rejected;
		blocker.release();
		await running;
		expect(await enqueue(async () => "next")).toBe("next");
		expect(mutation).not.toHaveBeenCalled();
	});

	it("finishes an operation already running when its queue wait timeout expires", async () => {
		const enqueue = createTaskQueue(), blocker = gate(), started = gate(), aborter = new AbortController();
		const running = enqueue(async () => { started.release(); await blocker.promise; return "saved"; }, { signal: aborter.signal });
		await started.promise;
		aborter.abort();
		blocker.release();
		await expect(running).resolves.toBe("saved");
	});

	it("continues after a failed task and skips work cancelled before enqueue", async () => {
		const enqueue = createTaskQueue(), aborter = new AbortController();
		aborter.abort();
		const mutation = vi.fn(async () => "unexpected");
		await expect(enqueue(mutation, { signal: aborter.signal })).rejects.toBeInstanceOf(QueueTaskCancelledError);
		await expect(enqueue(async () => { throw new Error("failed"); })).rejects.toThrow("failed");
		expect(await enqueue(async () => "next")).toBe("next");
		expect(mutation).not.toHaveBeenCalled();
	});
});
