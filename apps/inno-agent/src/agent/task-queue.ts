export class QueueTaskCancelledError extends Error {
	constructor(message = "Queue task was cancelled before it started") {
		super(message);
		this.name = "QueueTaskCancelledError";
	}
}

/** Cancellation removes waiting work only. Once started, an operation keeps
 * its slot and reports its actual result, so callers cannot retry a session
 * mutation that is still running after a misleading cancellation response. */
export function createTaskQueue() {
	let tail: Promise<void> = Promise.resolve();
	return function enqueue<T>(task: () => Promise<T>, opts?: { signal?: AbortSignal }): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const signal = opts?.signal;
			let started = false;
			const onAbort = () => {
				if (!started) reject(new QueueTaskCancelledError());
			};
			if (signal?.aborted) {
				reject(new QueueTaskCancelledError());
				return;
			}
			signal?.addEventListener("abort", onAbort, { once: true });
			const run = tail.then(() => {
				if (signal?.aborted) throw new QueueTaskCancelledError();
				started = true;
				signal?.removeEventListener("abort", onAbort);
				return task();
			});
			tail = run.then(() => undefined, () => undefined);
			run.then(resolve, reject).finally(() => signal?.removeEventListener("abort", onAbort));
		});
	};
}
