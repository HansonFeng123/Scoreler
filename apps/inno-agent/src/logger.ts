import pino from "pino";
// pino-caller is a CJS module; at runtime its default export is the wrapper
// function, but TypeScript's CJS→ESM interop for this package doesn't expose
// callable signatures on the default. Cast through unknown as a workaround.
import _pinoCaller from "pino-caller";
const pinoCaller = _pinoCaller as unknown as (logger: pino.Logger) => pino.Logger;
import { existsSync, mkdirSync, createWriteStream } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { Writable } from "node:stream";

/**
 * Resolve the log directory from INNO_DATA_DIR env var.
 * Falls back to ~/.inno-agent/data/log.
 */
function getLogDir(): string {
  const dataDir = process.env.INNO_DATA_DIR;
  if (dataDir) return join(dataDir, "log");
  return join(homedir(), ".inno-agent", "data", "log");
}

/**
 * Writable stream that lazily creates the log directory and file on the
 * first write call, and rotates to a new file each day.
 *
 * - Directory and file are NOT created at process startup — they only
 *   come into existence when the first log line is actually written.
 * - Each write checks whether the current date matches the active file's
 *   date; if the day has changed the old stream is closed and a new file
 *   named `server-YYYY-MM-DD.log` is opened.
 */
class DailyRotateStream extends Writable {
  private fileStream: ReturnType<typeof createWriteStream> | null = null;
  /** The date string (YYYY-MM-DD) currently associated with fileStream. */
  private currentDate = "";

  _write(
    chunk: unknown,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    const today = new Date().toISOString().slice(0, 10); // "2026-06-09"

    // Rotate when the day changes (or on first write).
    if (!this.fileStream || this.currentDate !== today) {
      if (this.fileStream) {
        this.fileStream.end();
      }

      const dir = getLogDir();
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      this.currentDate = today;
      this.fileStream = createWriteStream(join(dir, `server-${today}.log`), { flags: "a" });
    }

    this.fileStream.write(chunk, encoding, callback as (error?: Error | null) => void);
  }

  _final(callback: (error?: Error | null) => void): void {
    if (this.fileStream) {
      this.fileStream.end(callback);
    } else {
      callback();
    }
  }
}

/**
 * Shared Pino logger instance for HTTP request handling.
 *
 * Wrapped with {@link pinoCaller} to automatically record the TS source
 * location (file path + line number) for every log entry. Log lines are
 * written to `<INNO_DATA_DIR>/log/server-YYYY-MM-DD.log` with daily
 * rotation. The directory and file are created lazily on the first
 * `.info` / `.warn` / `.error` call.
 */
const rawLogger = pino(
  {
    level: process.env.LOG_LEVEL ?? "info",
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  new DailyRotateStream(),
);

const logger = pinoCaller(rawLogger);

export { logger };
