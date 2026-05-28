/**
 * Append a usage entry to a JSONL file.
 *
 * Creates the parent directory if it doesn't exist.
 * Errors are caught and logged — never crashes the host process.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { UsageEntry } from "./parse-usage";

/**
 * Append a single UsageEntry as a JSON line to the given file.
 *
 * @param entry - The usage record to persist
 * @param filePath - Absolute path to the JSONL file
 */
export function appendUsageEntry(entry: UsageEntry, filePath: string): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
  } catch {
    // Directory may already exist — ignore
  }

  try {
    appendFileSync(filePath, JSON.stringify(entry) + "\n");
  } catch (err) {
    console.error("[usage-tracker] failed to write:", err);
  }
}
