/**
 * Pure extraction of observation entries from session events.
 *
 * Observations are lossy heuristic records: what the user asked for, what the
 * assistant concluded, which files were touched, and what failed. No model
 * calls — everything is derived from event payloads alone.
 */

/** A single observation recorded to JSONL. */
export interface ObservationEntry {
  /** Unix epoch milliseconds. */
  ts: number;
  cwd: string;
  sessionId: string;
  kind: "user" | "assistant";
  /** Gist of the user request or assistant answer. */
  text: string;
  /** Unique tool names used in the assistant turn. */
  tools?: string[];
  /** File paths touched by edit/write tool calls. */
  files?: string[];
  /** Error gists from failed tool results. */
  errors?: string[];
}

/** Identity stamped onto every observation from one session. */
export interface ObserveContext {
  cwd: string;
  sessionId: string;
}

/** Local interface for the assistant message payload in a turn_end event. */
export interface AssistantTurnMessage {
  role: string;
  model?: string;
  timestamp?: number;
  content?: ContentBlock[];
}

/** Local interface for a tool result message in a turn_end event. */
export interface ToolResultLike {
  toolName?: string;
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
}

type ContentBlock =
  | { type: "text"; text?: string }
  | { type: "toolCall"; name?: string; arguments?: unknown }
  | { type: string };

const USER_GIST_LIMIT = 200;
const ASSISTANT_GIST_LIMIT = 300;
const ERROR_GIST_LIMIT = 160;
const MAX_TOOLS = 8;
const MAX_FILES = 8;
const MAX_ERRORS = 3;
const FILE_TOOLS = new Set(["edit", "write", "multiedit"]);

/** Collapse whitespace and truncate with an ellipsis. */
export function gist(text: string, maxLen: number): string {
  const collapsed = text.trim().replace(/\s+/g, " ");
  if (collapsed.length <= maxLen) return collapsed;
  return collapsed.slice(0, maxLen - 1) + "…";
}

/**
 * Extract a user observation from raw input text.
 *
 * Returns null for slash commands and empty input — those are UI actions,
 * not requests worth remembering.
 */
export function userObservation(text: string, ctx: ObserveContext): ObservationEntry | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("/")) return null;
  return {
    ts: Date.now(),
    cwd: ctx.cwd,
    sessionId: ctx.sessionId,
    kind: "user",
    text: gist(trimmed, USER_GIST_LIMIT),
  };
}

/**
 * Extract an assistant observation from a turn_end message and its tool results.
 *
 * Returns null for intermediate read-only turns (no text, no errors, no files
 * touched) — they carry no signal worth recalling.
 */
export function assistantObservation(
  message: AssistantTurnMessage,
  toolResults: ToolResultLike[],
  ctx: ObserveContext,
): ObservationEntry | null {
  const content = message.content ?? [];
  const textParts: string[] = [];
  const tools: string[] = [];
  const files: string[] = [];

  for (const block of content) {
    if (block.type === "text" && typeof (block as { text?: string }).text === "string") {
      textParts.push((block as { text: string }).text);
    } else if (block.type === "toolCall") {
      const name = (block as { name?: string }).name;
      if (typeof name === "string" && !tools.includes(name) && tools.length < MAX_TOOLS) {
        tools.push(name);
      }
      if (typeof name === "string" && FILE_TOOLS.has(name)) {
        const file = extractFilePath((block as { arguments?: unknown }).arguments);
        if (file && !files.includes(file) && files.length < MAX_FILES) files.push(file);
      }
    }
  }

  const errors: string[] = [];
  for (const result of toolResults) {
    if (!result.isError) continue;
    const detail = (result.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join(" ");
    const label = `${result.toolName ?? "tool"}: ${gist(detail || "failed", ERROR_GIST_LIMIT)}`;
    if (errors.length < MAX_ERRORS) errors.push(label);
  }

  const text = gist(textParts.join(" "), ASSISTANT_GIST_LIMIT);
  if (!text && errors.length === 0 && files.length === 0) return null;

  const entry: ObservationEntry = {
    ts: message.timestamp ?? Date.now(),
    cwd: ctx.cwd,
    sessionId: ctx.sessionId,
    kind: "assistant",
    text,
  };
  if (tools.length > 0) entry.tools = tools;
  if (files.length > 0) entry.files = files;
  if (errors.length > 0) entry.errors = errors;
  return entry;
}

/** Pull a file path out of edit/write tool arguments. */
function extractFilePath(args: unknown): string | null {
  if (typeof args !== "object" || args === null) return null;
  const record = args as Record<string, unknown>;
  for (const key of ["file_path", "path", "filePath"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}
