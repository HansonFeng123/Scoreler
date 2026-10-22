import { appendJsonl, readJsonlTail } from "../storage/file-store.js";

export interface ChannelRun {
	runId: string;
	channel: string;
	messageId: string;
	status: "success" | "error";
	startedAt: string;
	finishedAt: string;
	durationMs: number;
	error?: string;
}

/** The run log is rolled to a timestamped archive once it exceeds this size. */
const RUN_LOG_MAX_BYTES = 10 * 1024 * 1024;
/** list() only shows recent runs, so it reads just the tail of the file. */
const RUN_LOG_TAIL_BYTES = 1024 * 1024;

let runCounter = 0;

export function generateRunId(): string {
	return `chrun_${Date.now()}_${++runCounter}`;
}

export class ChannelRunLog {
	constructor(private filePath: string) {}

	append(run: ChannelRun): void {
		appendJsonl(this.filePath, run, { maxBytes: RUN_LOG_MAX_BYTES });
	}

	list(limit = 100): ChannelRun[] {
		const all = readJsonlTail<ChannelRun>(this.filePath, RUN_LOG_TAIL_BYTES);
		return all.slice(-limit);
	}
}
