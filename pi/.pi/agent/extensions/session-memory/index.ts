/**
 * Session Memory — session_search + session_read tools for past sessions.
 *
 * Internal-only extension: registers tools only when loaded by the librarian
 * subagent session (which sets PI_LIBRARIAN_LOAD), keeping them out of the
 * main agent's context. Lets the librarian answer "what did we do/decide in
 * past sessions in this repo?" by searching and reading rendered transcripts
 * of pi session JSONL files under ~/.pi/agent/sessions/--<encoded-cwd>--/.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { resolveRealCwd } from "@pi-ext/shared";
import { Type } from "typebox";
import { join, resolve } from "node:path";
import { existsSync, readdirSync, readFileSync } from "node:fs";

/**
 * Encode a working directory into pi's session directory path
 * (mirrors the SDK's getDefaultSessionDirPath: strip leading separator,
 * replace /, \, : with "-", wrap in "--"). Does not create the directory.
 */
export function sessionDirFor(cwd: string, agentDir: string): string {
  const safePath = `--${resolve(cwd)
    .replace(/^[/\\]/, "")
    .replace(/[/\\:]/g, "-")}--`;
  return join(agentDir, "sessions", safePath);
}

/** A parsed JSONL entry from a session file (only fields we need). */
export interface SessionEntry {
  type?: string;
  id?: string;
  parentId?: string | null;
  timestamp?: string;
  /** Real v3 files envelop role/content in a nested "message" object. */
  message?: {
    role?: string;
    content?: SessionContentBlock[];
    [key: string]: unknown;
  };
  role?: string;
  content?: SessionContentBlock[];
  [key: string]: unknown;
}

export interface SessionContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  arguments?: unknown;
  [key: string]: unknown;
}

/** A rendered conversation message (user or assistant only). */
export interface RenderedMessage {
  number: number;
  role: "user" | "assistant";
  time: string;
  text: string;
}

/** Parse session JSONL lines into entries, skipping invalid lines silently. */
export function parseSessionFile(lines: string[]): SessionEntry[] {
  const entries: SessionEntry[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as SessionEntry);
    } catch {
      // Unparsable lines (partial writes, corruption) are skipped.
    }
  }
  return entries;
}

/**
 * Flatten the session tree to its main path: walk from the last entry to the
 * root via parentId (last entry wins — abandoned retries/forks are dropped).
 * Returns entries in chronological (root → leaf) order.
 */
export function flattenMainPath(entries: SessionEntry[]): SessionEntry[] {
  if (entries.length === 0) return [];
  const byId = new Map<string, SessionEntry>();
  for (const e of entries) if (e.id) byId.set(e.id, e);

  const chain: SessionEntry[] = [];
  let cur: SessionEntry | undefined = entries[entries.length - 1];
  const seen = new Set<string>();
  while (cur && !(cur.id && seen.has(cur.id))) {
    chain.push(cur);
    if (cur.id) seen.add(cur.id);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return chain.reverse();
}

/** Truncate a value for a one-line tool-call summary. */
function summarizeArg(value: unknown, maxLen = 40): string {
  const str = typeof value === "string" ? value : (JSON.stringify(value) ?? "");
  const flat = str.replace(/\s+/g, " ").trim();
  return flat.length > maxLen ? `${flat.slice(0, maxLen)}…` : flat;
}

/** Render one tool-call block as a single summary line. */
function renderToolCall(block: SessionContentBlock): string {
  const args = (block.arguments ?? {}) as Record<string, unknown>;
  const firstArg = Object.keys(args).length > 0 ? args[Object.keys(args)[0]] : undefined;
  return `→ ${block.name ?? "tool"}(${summarizeArg(firstArg)})`;
}

/** HH:MM (UTC) from an entry timestamp, or "" if absent/unparsable. */
function entryTime(timestamp?: string): string {
  if (!timestamp) return "";
  const m = /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/.exec(timestamp);
  return m ? m[1] : "";
}

/**
 * Render the conversation-only transcript of a session: flatten the tree to
 * its main path, then number user and assistant messages 1..N chronologically.
 * user and assistant messages numbered 1..N in chronological order.
 * Assistant tool calls collapse to one "→ name(arg)" line; thinking blocks
 * and toolResult messages are dropped.
 */
export function renderTranscript(entries: SessionEntry[]): RenderedMessage[] {
  const rendered: RenderedMessage[] = [];
  for (const entry of flattenMainPath(entries)) {
    if (entry.type !== "message") continue;
    const role = entry.message?.role ?? entry.role;
    if (role !== "user" && role !== "assistant") continue;
    const content = entry.message?.content ?? entry.content ?? [];

    const lines: string[] = [];
    for (const block of content) {
      if (block.type === "text" && block.text) lines.push(block.text);
      else if (block.type === "toolCall") lines.push(renderToolCall(block));
      // thinking, image, and other block types are dropped.
    }
    rendered.push({
      number: rendered.length + 1,
      role,
      time: entryTime(entry.timestamp),
      text: lines.join("\n"),
    });
  }
  return rendered;
}

/** Format a rendered message as a single display line. */
export function formatMessage(message: RenderedMessage): string {
  const time = message.time ? ` [${message.time}]` : "";
  return `${message.number}.${time} ${message.role}: ${message.text}`;
}

// ── session_search ─────────────────────────────────────────────────────────

export interface SessionSearchMatch {
  /** Session file basename (handle for session_read). */
  session: string;
  /** Session date (YYYY-MM-DD, from filename). */
  date: string;
  /** Message number, consistent with session_read numbering. */
  number: number;
  role: "user" | "assistant";
  time: string;
  excerpt: string;
}

export interface SessionSearchOptions {
  agentDir: string;
  cwd: string;
  /** Live parent session file to exclude (defaults to PI_PARENT_SESSION_FILE). */
  parentFile?: string;
}

export interface SessionSearchResult {
  text: string;
  matches: SessionSearchMatch[];
}

/** List session files for a cwd, newest first, excluding the parent session. */
function listSessionFiles(dir: string, parentFile?: string): string[] {
  if (!existsSync(dir)) return [];
  const parent = parentFile ? resolve(parentFile) : undefined;
  return readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .filter((f) => !parent || resolve(join(dir, f)) !== parent)
    .sort()
    .reverse();
}

/** Build a ≤200-char excerpt around the first regex match in a text. */
function excerptAround(text: string, re: RegExp): string {
  const m = re.exec(text);
  const start = m ? Math.max(0, m.index - 50) : 0;
  const end = Math.min(text.length, start + 200);
  return text.slice(start, end);
}

/** Search rendered transcripts of previous sessions (smart-case regex). */
export async function executeSessionSearch(
  params: { query: string; limit?: number },
  opts: SessionSearchOptions,
): Promise<SessionSearchResult> {
  const limit = params.limit ?? 20;
  const flags = /[A-Z]/.test(params.query) ? "" : "i";
  let re: RegExp;
  try {
    re = new RegExp(params.query, flags);
  } catch (err) {
    throw new Error(
      `Invalid search pattern ${JSON.stringify(params.query)}: ${(err as Error).message}`,
      { cause: err },
    );
  }

  const dir = sessionDirFor(opts.cwd, opts.agentDir);
  const files = listSessionFiles(dir, opts.parentFile ?? process.env.PI_PARENT_SESSION_FILE);

  const matches: SessionSearchMatch[] = [];
  outer: for (const file of files) {
    const raw = readFileSync(join(dir, file), "utf-8");
    const messages = renderTranscript(parseSessionFile(raw.split("\n")));
    for (const message of messages) {
      if (re.test(message.text)) {
        matches.push({
          session: file,
          date: file.slice(0, 10),
          number: message.number,
          role: message.role,
          time: message.time,
          excerpt: excerptAround(message.text, re),
        });
        if (matches.length >= limit) break outer;
      }
    }
  }

  if (matches.length === 0) {
    return { text: `No matches for ${JSON.stringify(params.query)} in past sessions.`, matches };
  }

  const lines: string[] = [];
  let currentSession = "";
  for (const m of matches) {
    if (m.session !== currentSession) {
      currentSession = m.session;
      lines.push(`${m.session} (${m.date})`);
    }
    lines.push(`  ${m.number}. [${m.time}] ${m.role}: ${m.excerpt}`);
  }
  return { text: lines.join("\n"), matches };
}

// ── session_read ──────────────────────────────────────────────────────────

export interface SessionReadResult {
  text: string;
  total: number;
  /** Message numbers included in the returned window. */
  numbers: number[];
}

/** Resolve a session handle (exact name, name prefix, or date prefix) to a file. */
function resolveSessionFile(dir: string, session: string): string {
  const files = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".jsonl"))
        .sort()
        .reverse()
    : [];
  const exact = files.find((f) => f === session || f === `${session}.jsonl`);
  if (exact) return exact;
  const prefixed = files.filter((f) => f.startsWith(session));
  if (prefixed.length === 1) return prefixed[0];
  if (prefixed.length > 1) {
    throw new Error(
      `Ambiguous session ${JSON.stringify(session)} — matches ${prefixed.length} files:\n${prefixed.join("\n")}`,
    );
  }
  throw new Error(`Session ${JSON.stringify(session)} not found in ${dir}`);
}

/** Read a numbered transcript range from a past session. */
export async function executeSessionRead(
  params: { session: string; offset?: number; limit?: number },
  opts: SessionSearchOptions,
): Promise<SessionReadResult> {
  const offset = params.offset ?? 1;
  const limit = params.limit ?? 50;
  const dir = sessionDirFor(opts.cwd, opts.agentDir);
  const file = resolveSessionFile(dir, params.session);

  const raw = readFileSync(join(dir, file), "utf-8");
  const messages = renderTranscript(parseSessionFile(raw.split("\n")));
  const window = messages.filter((m) => m.number >= offset && m.number < offset + limit);

  const date = file.slice(0, 10);
  const header = `${file} (${date}) — ${messages.length} messages, showing ${offset}-${Math.min(offset + limit - 1, messages.length)}`;
  const body =
    window.length > 0 ? window.map(formatMessage).join("\n") : "No messages in this window.";

  return {
    text: `${header}\n${body}`,
    total: messages.length,
    numbers: window.map((m) => m.number),
  };
}

const SessionSearchParams = Type.Object({
  query: Type.String({
    description:
      "Search pattern (smart-case regex: all-lowercase matches case-insensitively, any uppercase makes it case-sensitive).",
  }),
  limit: Type.Optional(
    Type.Number({
      minimum: 1,
      maximum: 100,
      description: "Maximum number of matches to return (default 20).",
    }),
  ),
});

const SessionReadParams = Type.Object({
  session: Type.String({
    description:
      "Session file basename, unique basename prefix, or unique date prefix (YYYY-MM-DD).",
  }),
  offset: Type.Optional(
    Type.Number({
      minimum: 1,
      description: "Message number to start from (1-based, default 1).",
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      minimum: 1,
      maximum: 500,
      description: "Maximum number of messages to return (default 50).",
    }),
  ),
});

export default function sessionMemoryExtension(pi: ExtensionAPI): void {
  // Internal-only extension — only registers tools when loaded by the
  // librarian subagent session (which sets PI_LIBRARIAN_LOAD).
  // The main agent skips registration, keeping these tools out of its context.
  if (parseInt(process.env.PI_LIBRARIAN_LOAD || "0", 10) < 1) return;

  pi.registerTool({
    name: "session_search",
    label: "Session Search",
    description:
      "Search past agent sessions in this working directory (previous sessions only; the current one is excluded). " +
      "Returns matches with session handle, date, message number, role, and excerpt. " +
      "Use message numbers with session_read to pull surrounding context.",
    promptSnippet: "Search past session transcripts",
    parameters: SessionSearchParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await executeSessionSearch(params, {
        agentDir: getAgentDir(),
        cwd: resolveRealCwd(ctx.cwd),
      });
      return {
        content: [{ type: "text" as const, text: result.text }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "session_read",
    label: "Session Read",
    description:
      "Read a numbered transcript range of a past session in this working directory. " +
      "Renders user and assistant messages only (tool calls collapsed to one line). " +
      "Message numbers match those reported by session_search.",
    promptSnippet: "Read past session transcript",
    parameters: SessionReadParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await executeSessionRead(params, {
        agentDir: getAgentDir(),
        cwd: resolveRealCwd(ctx.cwd),
      });
      return {
        content: [{ type: "text" as const, text: result.text }],
        details: result,
      };
    },
  });
}
