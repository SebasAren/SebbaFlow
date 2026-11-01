/**
 * In-process subagent runner using the pi SDK.
 *
 * Creates an AgentSession with restricted tools, a custom system prompt,
 * and a cheap model — then collects output via event subscriptions.
 * Replaces the previous subprocess-based approach (spawning `pi --mode rpc`).
 *
 * Manages:
 * - Tool restriction (via caller-provided session factory)
 * - Usage tracking
 * - Loop detection and tool call limits
 * - Budget steering via session.steer()
 * - Timeout and abort signal handling
 * - Fallback model retry
 */

import type { AgentSession, AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { argsSignature, detectLoop } from "./loop-detection.js";
import { getModel, getFallbackModel, shouldUseFallback } from "./model.js";
import type { SubagentResult } from "./types.js";

/** Maximum number of recent tool calls kept in the rolling activity window. */
const RECENT_CALLS_WINDOW = 5;

/**
 * Grace buffer added to maxToolCalls before hard-abort.
 * When the subagent hits maxToolCalls, we DON'T abort immediately — we give it
 * this many extra calls to either produce a text summary or get aborted.
 */
const TOOL_CALL_GRACE_BUFFER = 5;

/** Build a short "toolName: detail" line from a tool_execution_start event. */
function formatRecentCall(toolName: string, args: Record<string, unknown> | undefined): string {
  if (!args) return toolName;
  let detail = "";
  if (typeof args.query === "string") detail = args.query.slice(0, 60);
  else if (typeof args.path === "string") detail = args.path;
  else if (typeof args.command === "string") detail = args.command.slice(0, 50);
  else if (typeof args.pattern === "string") detail = args.pattern.slice(0, 50);
  return detail ? `${toolName}: ${detail}` : toolName;
}

/** Default number of retries with the same model before giving up or switching to fallback. */
const DEFAULT_MAX_RETRIES = 3;

/**
 * Base delay in ms before retrying with the same model.
 * Uses exponential backoff: base * 2^attempt (with jitter ±500ms).
 */
const RETRY_BASE_DELAY_MS = 2_000;

/** Maximum jitter added/subtracted from the delay to prevent thundering herd. */
const RETRY_JITTER_MS = 500;

/** Calculate retry delay with exponential backoff and random jitter. */
function getRetryDelay(attempt: number): number {
  const base = RETRY_BASE_DELAY_MS * 2 ** attempt;
  const jitter = Math.random() * RETRY_JITTER_MS * 2 - RETRY_JITTER_MS;
  return Math.max(RETRY_BASE_DELAY_MS, Math.round(base + jitter));
}

/** Minimal shape of the assistant message payload in a turn_end event. */
interface SdkTurnEndMessage {
  role: "assistant";
  content?: Array<{ type: string; text?: string }>;
  model?: string;
  errorMessage?: string;
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    cost?: { total?: number };
    totalTokens?: number;
  };
}

/** Info about a tool call passed to the onToolCall callback. */
export interface ToolCallInfo {
  /** Name of the tool that was called. */
  toolName: string;
  /** Human-readable summary of the arguments (truncated to ~100 chars). */
  argsSummary: string;
  /** Wall-clock duration of the tool call in milliseconds (from start to completion). */
  durationMs: number;
  /** Whether the tool call completed without error (from tool_execution_end.isError). */
  success: boolean;
}

/** Options for {@link runSubagent}. */
export interface RunSubagentOptions {
  /** Working directory for the subagent */
  cwd: string;
  /** The prompt/query to send to the subagent */
  query: string;
  /** System prompt content */
  systemPrompt: string;
  /**
   * Factory that creates an AgentSession for this subagent run.
   * The caller provides this because different subagents need different
   * tools and resource loader configurations.
   *
   * @param systemPrompt - The system prompt to inject
   * @param cwd - Working directory
   * @param modelName - Model name to use (e.g. from CHEAP_MODEL or FALLBACK_MODEL).
   *   When undefined, the factory should use its default resolution logic.
   */
  createSession: (systemPrompt: string, cwd: string, modelName?: string) => Promise<AgentSession>;
  /** Timeout in milliseconds (default: 120_000) */
  timeoutMs?: number;
  /** Abort signal */
  signal?: AbortSignal;
  /**
   * Callback for streaming updates. Fires whenever the subagent emits new
   * assistant text or starts a new tool call.
   */
  onUpdate?: (update: { text: string; recentCalls?: string[] }) => void;
  /**
   * Callback for each tool call executed by the subagent.
   * Fires at tool_execution_end with accurate wall-clock duration and
   * per-call success status (from isError). Safe to throw in — the
   * callback is wrapped in try/catch and errors are swallowed.
   */
  onToolCall?: (info: ToolCallInfo) => void;
  /** Enable loop detection for tool calls (default: false) */
  loopDetection?: boolean;
  /** Maximum number of tool calls before stopping (default: Infinity) */
  maxToolCalls?: number;
  /** Debug label for console.log messages (omit to suppress logs) */
  debugLabel?: string;
  /** Override the default subagent model (falls back to CHEAP_MODEL env var) */
  model?: string;
  /** Override the fallback model (falls back to FALLBACK_MODEL env var) */
  fallbackModel?: string;
  /**
   * Maximum number of retries with the same model on transient failure
   * before switching to the fallback model or giving up (default: 3).
   * Can also be overridden via SUBAGENT_MAX_RETRIES env var.
   * Set to 0 to disable same-model retries.
   */
  maxRetries?: number;
  /** @internal Override retry delay for testing. */
  _retryDelayMs?: number;
}

/** Default timeout: 2 minutes */
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Run a subagent in-process and collect its output.
 *
 * Handles system prompt injection, loop detection, tool call limits,
 * timeout, and abort signals. Streams a rolling window of recent tool
 * calls through `onUpdate` so the caller can render a live activity
 * ticker in the main agent UI.
 *
 * Retry strategy:
 * 1. Run with primary model.
 * 2. On transient failure, retry up to `maxRetries` times — reusing the
 *    same session so the LLM sees the conversation history from the
 *    failed attempt (tool calls, partial results, etc.).
 * 3. If all same-model retries fail and a `fallbackModel` is configured,
 *    try once with a fresh session on the fallback model.
 */
export async function runSubagent(options: RunSubagentOptions): Promise<SubagentResult> {
  const model = options.model || getModel();
  const fallbackModel = options.fallbackModel || getFallbackModel();
  const envMaxRetries = process.env.SUBAGENT_MAX_RETRIES
    ? Math.max(0, parseInt(process.env.SUBAGENT_MAX_RETRIES, 10))
    : undefined;
  const maxRetries = options.maxRetries ?? envMaxRetries ?? DEFAULT_MAX_RETRIES;

  const log = (msg: string) => {
    if (options.debugLabel) console.log(`[${options.debugLabel}] ${msg}`);
  };

  const isTransientFailure = (result: SubagentResult): boolean =>
    (result.exitCode !== 0 || !!result.errorMessage) &&
    shouldUseFallback(result.errorMessage || result.stderr);

  // Phase 1: Create session once and try primary model (with retries)
  // Reusing the session across retries preserves conversation history,
  // so on retry the LLM sees previous tool calls and partial results.
  const modelName = options.model || getModel();
  const session = await options.createSession(options.systemPrompt, options.cwd, modelName);

  let result = await runSingleAttempt(options, session, false);

  for (let attempt = 1; attempt <= maxRetries && isTransientFailure(result); attempt++) {
    log(`primary model failed (attempt ${attempt}/${maxRetries}), retrying on same session...`);
    if (options.onUpdate)
      options.onUpdate({
        text: `[Retrying (${attempt}/${maxRetries}) after transient error...]`,
      });

    await delay(options._retryDelayMs ?? getRetryDelay(attempt - 1));
    result = await runSingleAttempt(options, session, false);
  }

  // Dispose the primary session now that all retries are exhausted
  try {
    session.dispose();
  } catch {
    /* ignore */
  }

  // Phase 2: If primary model still failing and fallback is available, try it
  if (fallbackModel && fallbackModel !== model && isTransientFailure(result)) {
    log(
      `primary model still failing after ${maxRetries} retries, switching to fallback: ${fallbackModel}`,
    );
    if (options.onUpdate)
      options.onUpdate({ text: `[Switching to fallback model: ${fallbackModel}...]` });

    // Fallback creates its own session (different model) — dispose after use
    result = await runSingleAttempt({ ...options, model: fallbackModel }, undefined, true);

    if (!result.errorMessage) {
      result.model = result.model || fallbackModel;
    }
    return result;
  }

  return result;
}

/** Small delay helper. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a single attempt with a given (or newly created) session.
 *
 * @param options - Subagent options (query, timeout, tools config, etc.)
 * @param existingSession - Reuse an existing session (for retries). When provided,
 *   the session is NOT disposed after use — the caller is responsible for cleanup.
 *   When undefined, a new session is created via options.createSession and disposed
 *   after the attempt.
 * @param disposeSession - Whether to dispose the session in the finally block.
 *   Always true when existingSession is undefined (we created it).
 *   Set to false when the caller wants to reuse the session for retries.
 */
async function runSingleAttempt(
  options: RunSubagentOptions,
  existingSession?: AgentSession,
  disposeSession = existingSession === undefined,
): Promise<SubagentResult> {
  const {
    cwd,
    query,
    systemPrompt,
    createSession,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
    onUpdate,
    onToolCall,
    loopDetection = false,
    maxToolCalls = Infinity,
    debugLabel,
  } = options;

  const recentCalls: string[] = [];
  const allCalls: string[] = [];
  let lastWarnSignature: string | null = null;
  let stoppedEarly = false;
  let timedOut = false;
  let aborted = false;

  const result: SubagentResult = {
    exitCode: 0,
    output: "",
    stderr: "",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      contextTokens: 0,
      turns: 0,
    },
  };

  const emitUpdate = () => {
    try {
      onUpdate?.({
        text: result.output || "(running...)",
        recentCalls: recentCalls.length > 0 ? [...recentCalls] : undefined,
      });
    } catch {
      // onUpdate may throw if the tool has been cancelled — ignore
    }
  };

  const log = (msg: string) => {
    if (debugLabel) console.log(`[${debugLabel}] ${msg}`);
  };

  // Use existing session (retry) or create a new one
  const modelName = options.model || getModel();
  const session = existingSession ?? (await createSession(systemPrompt, cwd, modelName));

  try {
    const toolHistory: Array<{ name: string; argsSignature: string }> = [];
    const pendingToolCalls: Array<{
      toolName: string;
      argsSummary: string;
      startTime: number;
    }> = [];

    // Set up event subscription
    const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
      // Track tool calls for loop detection, limits, and live activity display
      if (event.type === "tool_execution_start") {
        if (loopDetection || maxToolCalls < Infinity) {
          toolHistory.push({
            name: event.toolName,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            argsSignature: argsSignature(event.args || {}),
          });
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const callLine = formatRecentCall(event.toolName, event.args);
        allCalls.push(callLine);
        recentCalls.push(callLine);
        if (recentCalls.length > RECENT_CALLS_WINDOW) recentCalls.shift();
        emitUpdate();

        // Track timing for onToolCall callback
        if (onToolCall) {
          let argsSummary = callLine;
          // Safe UTF-8 truncation: iterate over code points, not UTF-16 code units
          const codePoints = [...argsSummary];
          if (codePoints.length > 100) {
            argsSummary = codePoints.slice(0, 97).join("") + "...";
          }
          pendingToolCalls.push({
            toolName: event.toolName,
            argsSummary,
            startTime: Date.now(),
          });
        }

        // Budget limit with grace period
        if (toolHistory.length > maxToolCalls + TOOL_CALL_GRACE_BUFFER) {
          stoppedEarly = true;
          result.output += `\n\n[Stopped: exceeded ${maxToolCalls + TOOL_CALL_GRACE_BUFFER} tool calls (budget was ${maxToolCalls})]`;
          emitUpdate();
          void session.abort();
          return;
        } else if (toolHistory.length > maxToolCalls && !stoppedEarly) {
          stoppedEarly = true;
          result.output += `\n\n[Budget exhausted (${maxToolCalls} calls). Writing summary with remaining turns...]`;
          emitUpdate();
          void session.steer(
            `[BUDGET EXHAUSTED] You have used ${maxToolCalls} tool calls. ` +
              `Stop calling tools NOW and write your summary with ## Files Retrieved, ## Key Code, ## Summary sections. ` +
              `You have a few remaining turns to produce output before being terminated.`,
          );
        }

        // Pattern-based loop detection
        if (loopDetection) {
          const loopResult = detectLoop(toolHistory);
          if (loopResult) {
            if (loopResult.severity === "warn") {
              const currentSig = toolHistory[toolHistory.length - 1].argsSignature;
              if (currentSig !== lastWarnSignature) {
                lastWarnSignature = currentSig;
                void session.steer(
                  `[LOOP WARNING] ${loopResult.message}. ` +
                    `Do NOT repeat this exact call again. ` +
                    `Try a different file, different search terms, or write your summary.`,
                );
              }
            } else {
              // Kill-level: abort immediately
              stoppedEarly = true;
              result.output += `\n\n[Stopped: ${loopResult.message}]`;
              emitUpdate();
              void session.abort();
              return;
            }
          }
        }
      }

      // Handle tool_execution_end — fire onToolCall with accurate per-tool timing
      if (event.type === "tool_execution_end") {
        if (onToolCall && pendingToolCalls.length > 0) {
          const pending = pendingToolCalls.shift()!;
          try {
            onToolCall({
              toolName: event.toolName,
              argsSummary: pending.argsSummary,
              durationMs: Date.now() - pending.startTime,
              success: !event.isError,
            });
          } catch {
            // Best-effort: swallow errors from onToolCall to avoid crashing the subagent
          }
        }
      }

      // Handle turn_end — extract usage and model info
      if (event.type === "turn_end") {
        const msg = event.message as SdkTurnEndMessage;
        if (msg.role === "assistant") {
          result.usage.turns++;
          if (!result.model && msg.model) result.model = msg.model;
          if (msg.errorMessage) result.errorMessage = msg.errorMessage;

          // Extract usage from the message if available
          const usage = msg.usage;
          if (usage) {
            result.usage.input += usage.input || 0;
            result.usage.output += usage.output || 0;
            result.usage.cacheRead += usage.cacheRead || 0;
            result.usage.cacheWrite += usage.cacheWrite || 0;
            result.usage.cost += usage.cost?.total || 0;
            result.usage.contextTokens = usage.totalTokens || 0;
          }

          // Extract text content from the message
          if (msg.content) {
            for (const part of msg.content) {
              if (part.type === "text") {
                result.output += part.text;
              }
            }
          }
          emitUpdate();
        }
      }
    });

    // Timeout handling — raced against session.prompt() to guarantee we never hang
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<void>((resolve) => {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        log(`timeout after ${timeoutMs}ms`);
        void session.abort();
        resolve();
      }, timeoutMs);
    });

    // Abort signal handling
    let abortHandler: (() => void) | undefined;
    if (signal) {
      if (signal.aborted) {
        aborted = true;
        void session.abort();
      } else {
        abortHandler = () => {
          aborted = true;
          void session.abort();
        };
        signal.addEventListener("abort", abortHandler, { once: true });
      }
    }

    log(`prompting subagent (cwd: ${cwd})`);

    try {
      // Race prompt against timeout so we never hang indefinitely.
      // session.abort() inside the timeout handler SHOULD cause prompt() to
      // reject, but some SDK states may not propagate the rejection — the race
      // guarantees we always continue after the timeout.
      await Promise.race([session.prompt(query), timeoutPromise]);
    } catch (e: any) {
      // session.prompt() may throw if aborted — that's expected
      if (!aborted && !timedOut && !stoppedEarly) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        log(`prompt error: ${e?.message || e}`);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        result.stderr += e?.message || String(e);
      }
    }

    // Clear timeout
    if (timeoutTimer) clearTimeout(timeoutTimer);

    // Wait for the agent to finish processing, but with a short timeout
    // to avoid hanging if abort didn't fully clean up the agent's internal state.
    try {
      await Promise.race([
        session.agent.waitForIdle(),
        new Promise<void>((resolve) => setTimeout(resolve, 5000)),
      ]);
    } catch {
      /* ignore */
    }

    // Cleanup listeners
    unsubscribe();
    if (abortHandler && signal) {
      signal.removeEventListener("abort", abortHandler);
    }

    // Flush remaining pending tool calls on early exit (abort/timeout/budget)
    if (onToolCall && pendingToolCalls.length > 0) {
      const now = Date.now();
      for (const pending of pendingToolCalls) {
        try {
          onToolCall({
            toolName: pending.toolName,
            argsSummary: pending.argsSummary,
            durationMs: now - pending.startTime,
            success: false,
          });
        } catch {
          // Best-effort
        }
      }
      pendingToolCalls.length = 0;
    }

    if (aborted) {
      throw new Error("Subagent was aborted");
    }

    if (timedOut) {
      result.errorMessage = `Subagent timed out after ${timeoutMs}ms`;
    }

    // Fallback: synthesize output if the model never produced text
    if (!result.output.trim() && !result.errorMessage) {
      if (allCalls.length > 0) {
        const numbered = allCalls.map((c, i) => `${i + 1}. ${c}`).join("\n");
        result.output =
          `## Activity\n` +
          `The subagent ran ${allCalls.length} tool call${allCalls.length === 1 ? "" : "s"} ` +
          `but exited without producing a text summary.\n\n` +
          `${numbered}\n\n` +
          `## Summary\n` +
          `(No summary was produced. Consider re-running with a more specific query or a different model.)`;
      } else {
        result.output = `## Summary\n(Subagent exited without producing any output or tool calls.)`;
      }
    }

    return result;
  } finally {
    if (disposeSession) {
      try {
        session.dispose();
      } catch {
        /* ignore */
      }
    }
  }
}
