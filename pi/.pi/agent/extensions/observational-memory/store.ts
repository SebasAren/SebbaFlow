/**
 * JSONL persistence for observation entries.
 *
 * Follows the usage-tracker storage conventions: one JSON object per line at
 * ~/.config/pi/observations.jsonl, corrupt lines silently skipped, errors
 * caught and logged — never crashes the host process.
 */

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ObservationEntry } from "./observe";

/** Options for filtering observations on read. */
export interface ReadObservationsOptions {
  /** Only include entries whose cwd matches exactly. */
  cwd?: string;
  /** Exclude entries recorded by this session (avoids self-recall). */
  excludeSessionId?: string;
  /** Return at most this many entries (newest last). */
  limit?: number;
}

/**
 * Append a single ObservationEntry as a JSON line to the given file.
 *
 * Creates the parent directory if needed. Errors are caught and logged.
 */
export function appendObservation(entry: ObservationEntry, filePath: string): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
  } catch {
    // Directory may already exist — ignore
  }

  try {
    appendFileSync(filePath, JSON.stringify(entry) + "\n");
  } catch (err) {
    console.error("[observational-memory] failed to write:", err);
  }
}

/**
 * Read and filter observation entries from a JSONL file.
 *
 * @param filePath - Absolute path to the JSONL file
 * @param options - Optional filters (cwd, excludeSessionId, limit)
 * @returns Array of matching entries in chronological order
 */
export function readObservations(
  filePath: string,
  options: ReadObservationsOptions = {},
): ObservationEntry[] {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  if (!content.trim()) return [];

  const entries: ObservationEntry[] = [];

  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      // Runtime validation — skip structurally invalid entries
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        typeof (parsed as Record<string, unknown>).ts !== "number" ||
        typeof (parsed as Record<string, unknown>).cwd !== "string" ||
        typeof (parsed as Record<string, unknown>).sessionId !== "string" ||
        ((parsed as Record<string, unknown>).kind !== "user" &&
          (parsed as Record<string, unknown>).kind !== "assistant") ||
        typeof (parsed as Record<string, unknown>).text !== "string"
      ) {
        continue;
      }
      entries.push(parsed as ObservationEntry);
    } catch {
      // Skip malformed lines
    }
  }

  let filtered = entries;
  if (options.cwd !== undefined) filtered = filtered.filter((e) => e.cwd === options.cwd);
  if (options.excludeSessionId !== undefined) {
    filtered = filtered.filter((e) => e.sessionId !== options.excludeSessionId);
  }
  if (options.limit !== undefined && filtered.length > options.limit) {
    filtered = filtered.slice(filtered.length - options.limit);
  }
  return filtered;
}
