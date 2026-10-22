/**
 * Observability extension + prompt observer for Inno Agent.
 *
 * Two observation layers:
 * 1. Extension layer (pi.on)  — session lifecycle, model changes, compaction
 * 2. Prompt observer (session.subscribe) — turn execution, tool calls with
 *    args/results, message lifecycle, auto-retry (covered in pi-runner.ts)
 *
 * All handlers are wrapped in try-catch — observability must never affect
 * the agent loop.
 */
import type { ExtensionAPI, ExtensionFactory } from "@earendil-works/pi-coding-agent";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { logger } from "../logger.js";

// ---------------------------------------------------------------------------
// Child logger — also exported so pi-runner.ts can use it for auto_retry events
// ---------------------------------------------------------------------------
export const obsLogger = logger.child({ module: "observability" });

// ---------------------------------------------------------------------------
// Safe handler wrapper
// ---------------------------------------------------------------------------
function safeHandler<E>(
  eventName: string,
  handler: (event: E) => void,
): (event: E) => void {
  return (event) => {
    try {
      handler(event);
    } catch (err) {
      obsLogger.error({ err, eventName }, "observability handler error");
    }
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_FIELD_LENGTH = 300;

/** Truncate a string to MAX_FIELD_LENGTH, appending a trailer if cut. */
function truncate(s: string): string {
  if (s.length <= MAX_FIELD_LENGTH) return s;
  return s.slice(0, MAX_FIELD_LENGTH) + `...[truncated ${s.length - MAX_FIELD_LENGTH} chars]`;
}

/** Safely stringify any value, truncating the result. */
function safeStringify(v: unknown): string {
  try {
    if (typeof v === "string") return truncate(v);
    return truncate(JSON.stringify(v));
  } catch {
    return "[unserializable]";
  }
}

/** Extract a one-line summary from tool args (e.g. bash command, file path). */
function summarizeArgs(toolName: string, args: unknown): string {
  if (args == null) return "";
  try {
    const a = args as Record<string, unknown>;
    switch (toolName) {
      case "bash":
        return typeof a.command === "string" ? a.command : safeStringify(args);
      case "read":
        return typeof a.path === "string" ? a.path : typeof a.file_path === "string" ? a.file_path : safeStringify(args);
      case "write":
        return typeof a.path === "string" ? a.path : typeof a.file_path === "string" ? a.file_path : safeStringify(args);
      case "edit":
        return typeof a.path === "string" ? a.path : typeof a.file_path === "string" ? a.file_path : safeStringify(args);
      case "grep":
        return typeof a.pattern === "string" ? `pattern="${a.pattern}"` : safeStringify(args);
      case "find":
        return typeof a.pattern === "string" ? `pattern="${a.pattern}"` : safeStringify(args);
      case "ls":
        return typeof a.path === "string" ? a.path : safeStringify(args);
      default:
        return safeStringify(args);
    }
  } catch {
    return "";
  }
}

/** Extract a one-line summary from tool result. */
function summarizeResult(result: unknown): string {
  if (result == null) return "";
  try {
    const r = result as Record<string, unknown>;
    // Tool results usually have content array or details object
    if (Array.isArray(r.content)) {
      const texts = r.content
        .filter((c: unknown) => (c as Record<string, unknown>)?.type === "text")
        .map((c: unknown) => (c as Record<string, string>).text);
      return truncate(texts.join(" "));
    }
    if (typeof r.details === "object" && r.details != null) {
      const d = r.details as Record<string, unknown>;
      // bash tool: { exitCode, output, ... }
      if (typeof d.exitCode === "number") {
        return `exit=${d.exitCode}`;
      }
      return safeStringify(r.details);
    }
    return safeStringify(result);
  } catch {
    return "";
  }
}

/** Extract usage/cost from an AgentMessage (assistant role). */
function extractUsage(m: unknown): Record<string, unknown> | null {
  const msg = m as Record<string, unknown> | null | undefined;
  if (!msg || msg.role !== "assistant") return null;
  const usage = msg.usage as Record<string, number | Record<string, number>> | undefined;
  if (!usage) return null;
  const cost = usage.cost as Record<string, number> | undefined;
  return {
    inputTokens: usage.input,
    outputTokens: usage.output,
    cacheReadTokens: usage.cacheRead,
    cacheWriteTokens: usage.cacheWrite,
    totalTokens: usage.totalTokens,
    totalCost: cost?.total,
  };
}

// ---------------------------------------------------------------------------
// Duration tracking for prompt observer
// ---------------------------------------------------------------------------
const turnStartTimes = new Map<number, number>();
const toolStartTimes = new Map<string, number>();

function clearTracking(): void {
  turnStartTimes.clear();
  toolStartTimes.clear();
}

// ---------------------------------------------------------------------------
// 1. Extension factory — session-level & model-level lifecycle
// ---------------------------------------------------------------------------
export function createObservabilityExtension(): ExtensionFactory {
  return async (pi: ExtensionAPI) => {
    // ---- Session ----------------------------------------------------------

    pi.on(
      "session_start",
      safeHandler("session_start", (event) => {
        clearTracking();
        obsLogger.info({
          event: "session_start",
          reason: event.reason,
          previousSessionFile: event.previousSessionFile ?? undefined,
        });
      }),
    );

    pi.on(
      "session_shutdown",
      safeHandler("session_shutdown", (event) => {
        clearTracking();
        obsLogger.info({
          event: "session_shutdown",
          reason: event.reason,
        });
      }),
    );

    // ---- Compaction -------------------------------------------------------

    pi.on(
      "session_before_compact",
      safeHandler("session_before_compact", (event) => {
        obsLogger.info({
          event: "session_before_compact",
          entryCount: event.branchEntries?.length ?? 0,
          hasCustomInstructions: Boolean(event.customInstructions),
        });
      }),
    );

    pi.on(
      "session_compact",
      safeHandler("session_compact", (event) => {
        obsLogger.info({
          event: "session_compact",
          fromExtension: event.fromExtension,
        });
      }),
    );

    // ---- Run settlement ---------------------------------------------------

    pi.on(
      "agent_settled",
      safeHandler("agent_settled", (event) => {
        // Fired once the run has fully settled (no pending retry, compaction,
        // or queued continuation). `aborted` (pi ≥1.1) distinguishes a
        // cancelled run from a finished one — agent_end alone cannot.
        obsLogger.info({
          event: "agent_settled",
          aborted: event.aborted,
        });
      }),
    );

    // ---- Model / thinking level -------------------------------------------

    pi.on(
      "model_select",
      safeHandler("model_select", (event) => {
        obsLogger.info({
          event: "model_select",
          provider: event.model?.provider,
          modelId: event.model?.id,
          source: event.source,
          previousModelId: event.previousModel?.id,
        });
      }),
    );

    pi.on(
      "thinking_level_select",
      safeHandler("thinking_level_select", (event) => {
        obsLogger.info({
          event: "thinking_level_select",
          level: event.level,
          previousLevel: event.previousLevel,
        });
      }),
    );
  };
}

// ---------------------------------------------------------------------------
// 2. Prompt observer — per-prompt execution events via session.subscribe()
//    Captures tool call details (args + results) and full turn lifecycle.
// ---------------------------------------------------------------------------

export interface PromptObserverOptions {
  /** Timestamp (ms) when the prompt started, used for elapsedMs in retries. */
  promptStartTime: number;
}

export function createPromptObserver(
  opts: PromptObserverOptions,
): (event: AgentSessionEvent) => void {
  const { promptStartTime } = opts;

  return (event: AgentSessionEvent) => {
    try {
      switch (event.type) {
        // ---- Agent / Turn boundaries --------------------------------------

        case "agent_start":
          obsLogger.info({
            event: "agent_start",
            promptElapsedMs: Date.now() - promptStartTime,
          });
          break;

        case "agent_end":
          obsLogger.info({
            event: "agent_end",
            messageCount: event.messages?.length ?? 0,
            willRetry: event.willRetry,
            promptElapsedMs: Date.now() - promptStartTime,
          });
          break;

        case "turn_start":
          obsLogger.info({
            event: "turn_start",
          });
          break;

        case "turn_end": {
          const msg = event.message as unknown as Record<string, unknown> | undefined;
          const usage = extractUsage(msg);
          obsLogger.info({
            event: "turn_end",
            role: msg?.role,
            model: msg?.model,
            stopReason: msg?.stopReason,
            toolResultsCount: event.toolResults?.length ?? 0,
            ...(usage ?? {}),
          });
          break;
        }

        // ---- Messages -----------------------------------------------------

        case "message_start": {
          const m = event.message as unknown as Record<string, unknown> | undefined;
          const logObj: Record<string, unknown> = {
            event: "message_start",
            role: m?.role,
          };
          if (m?.role === "assistant") {
            logObj.provider = m.provider;
            logObj.model = m.model;
          } else if (m?.role === "toolResult") {
            logObj.toolName = m.toolName;
          }
          obsLogger.info(logObj);
          break;
        }

        case "message_end": {
          const m = event.message as unknown as Record<string, unknown> | undefined;
          if (m?.role === "assistant") {
            const usage = extractUsage(m);
            obsLogger.info({
              event: "message_end",
              role: "assistant",
              provider: m.provider,
              model: m.model,
              stopReason: m.stopReason,
              ...(usage ?? {}),
              errorMessage: m.errorMessage || undefined,
            });
          } else {
            obsLogger.info({
              event: "message_end",
              role: m?.role ?? "unknown",
              toolName: m?.toolName ?? undefined,
              isError: m?.isError ?? undefined,
            });
          }
          break;
        }

        // ---- Tool execution (the key details!) ----------------------------

        case "tool_execution_start": {
          const argsSummary = summarizeArgs(event.toolName, event.args);
          toolStartTimes.set(event.toolCallId, Date.now());
          obsLogger.info({
            event: "tool_execution_start",
            toolName: event.toolName,
            toolCallId: event.toolCallId,
            args: argsSummary || undefined,
          });
          break;
        }

        case "tool_execution_end": {
          const elapsed = toolStartTimes.get(event.toolCallId);
          toolStartTimes.delete(event.toolCallId);
          const resultSummary = summarizeResult(event.result);
          obsLogger.info({
            event: "tool_execution_end",
            toolName: event.toolName,
            toolCallId: event.toolCallId,
            isError: event.isError,
            durationMs: elapsed != null ? Date.now() - elapsed : undefined,
            result: resultSummary || undefined,
          });
          break;
        }

        // ---- Compaction ---------------------------------------------------

        case "compaction_start":
          obsLogger.info({
            event: "compaction_start",
            reason: event.reason,
          });
          break;

        case "compaction_end":
          obsLogger.info({
            event: "compaction_end",
            reason: event.reason,
            aborted: event.aborted,
            willRetry: event.willRetry,
            errorMessage: event.errorMessage ?? undefined,
          });
          break;

        // ---- Other events (not explicitly handled) ------------------------

        default:
          break;
      }
    } catch (err) {
      obsLogger.error({ err, eventType: event.type }, "prompt observer error");
    }
  };
}
