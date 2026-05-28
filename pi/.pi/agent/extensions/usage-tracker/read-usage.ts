/**
 * Read usage entries from a JSONL file with optional filters.
 */

import { readFileSync } from "node:fs";
import type { UsageEntry } from "./parse-usage";

/** Options for filtering usage entries. */
export interface ReadUsageOptions {
  /** Only include entries with ts >= since. */
  since?: number;
  /** Only include entries whose project starts with this prefix. */
  project?: string;
}

/**
 * Read and filter usage entries from a JSONL file.
 *
 * @param filePath - Absolute path to the JSONL file
 * @param options - Optional filters (since, project)
 * @returns Array of matching UsageEntry objects
 */
export function readUsageEntries(filePath: string, options: ReadUsageOptions = {}): UsageEntry[] {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  if (!content.trim()) return [];

  const entries: UsageEntry[] = [];

  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      // Runtime validation — skip structurally invalid entries
      if (typeof parsed.ts !== "number" || typeof parsed.model !== "string") continue;
      const entry = parsed as UsageEntry;

      if (options.since !== undefined && entry.ts < options.since) continue;
      if (options.project !== undefined && !entry.project.startsWith(options.project)) continue;

      entries.push(entry);
    } catch {
      // Skip malformed lines
    }
  }

  return entries;
}
