import { statSync } from "node:fs";
import { readJsonl, appendJsonl, writeJsonl } from "../storage/file-store.js";

interface DedupeEntry {
	key: string;
	seenAt: string;
	expiresAt: string;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * dedupe.jsonl is compacted (rewritten with live entries only) once it
 * exceeds this size. Rotation is unsafe here — it would drop live entries
 * and re-admit duplicates — so growth is bounded by compaction instead.
 */
const DEFAULT_MAX_BYTES = 1024 * 1024;

export class DedupeStore {
	private seen = new Map<string, number>();

	constructor(
		private filePath: string,
		private ttlMs = DEFAULT_TTL_MS,
		private maxBytes = DEFAULT_MAX_BYTES,
	) {
		const now = Date.now();
		let total = 0;
		for (const entry of readJsonl<DedupeEntry>(filePath)) {
			total++;
			const expires = new Date(entry.expiresAt).getTime();
			if (expires > now) {
				this.seen.set(entry.key, expires);
			}
		}
		// Boot-time compaction: if the file held expired or duplicate-key lines,
		// rewrite it with live entries only so it doesn't grow across restarts.
		if (total > this.seen.size) this.compact();
	}

	isDuplicate(channel: string, messageId: string): boolean {
		const key = `${channel}:${messageId}`;
		const expires = this.seen.get(key);
		if (expires && expires > Date.now()) return true;
		return false;
	}

	mark(channel: string, messageId: string): void {
		const key = `${channel}:${messageId}`;
		const now = new Date();
		const expiresAt = new Date(now.getTime() + this.ttlMs);
		this.seen.set(key, expiresAt.getTime());
		appendJsonl(this.filePath, {
			key,
			seenAt: now.toISOString(),
			expiresAt: expiresAt.toISOString(),
		});
		// Long-running processes never reboot, so bound the file here too.
		if (statSync(this.filePath).size > this.maxBytes) this.compact();
	}

	cleanup(): void {
		const now = Date.now();
		for (const [key, expires] of this.seen) {
			if (expires <= now) this.seen.delete(key);
		}
	}

	/** Rewrite the log with live entries only (atomic via writeJsonl). */
	private compact(): void {
		const now = Date.now();
		const live: DedupeEntry[] = [];
		for (const [key, expires] of this.seen) {
			if (expires <= now) {
				this.seen.delete(key);
				continue;
			}
			live.push({
				key,
				seenAt: new Date(now).toISOString(),
				expiresAt: new Date(expires).toISOString(),
			});
		}
		writeJsonl(this.filePath, live);
	}
}
