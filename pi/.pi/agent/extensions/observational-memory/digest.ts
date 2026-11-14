/**
 * Digest builders: turn stored observations into (a) a system-prompt section
 * injected at session start for continuity, and (b) report lines for the
 * /memory command widget.
 */

import type { ObservationEntry } from "./observe";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Format a unix-ms timestamp as "MMM d HH:MM" in UTC (deterministic across host TZs). */
export function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${hh}:${mm}`;
}

/** Render one observation as a single compact line. */
export function formatEntryLine(entry: ObservationEntry): string {
  let line = `• [${formatTimestamp(entry.ts)}] ${entry.kind}: ${entry.text}`;
  if (entry.tools !== undefined && entry.tools.length > 0) {
    line += ` [tools: ${entry.tools.join(", ")}]`;
  }
  if (entry.files !== undefined && entry.files.length > 0) {
    line += ` [files: ${entry.files.join(", ")}]`;
  }
  if (entry.errors !== undefined && entry.errors.length > 0) {
    line += ` [errors: ${entry.errors.join(" | ")}]`;
  }
  return line;
}

const SECTION_HEADER = [
  "Compact observations from past sessions in this directory,",
  "recorded automatically at each turn. They are lossy heuristic",
  "summaries — not ground truth. Use them for continuity and context",
  "about recent work, decisions, and errors; verify specifics against",
  "the codebase before acting on them.",
].join("\n");

/** Maximum rendered characters for the injected section (oldest lines dropped to fit). */
export const SECTION_MAX_CHARS = 3500;

/**
 * Build the system-prompt section content for past observations.
 *
 * @param entries - Chronologically ordered observations (oldest first, newest last)
 * @returns Section text, or null when there is nothing worth injecting
 */
export function buildMemorySection(entries: ObservationEntry[]): string | null {
  if (entries.length === 0) return null;

  const lines: string[] = [];
  for (const entry of entries) {
    lines.push(formatEntryLine(entry));
  }

  // Cap total size — drop oldest lines until the section fits.
  while (
    lines.length > 0 &&
    SECTION_HEADER.length + 1 + lines.join("\n").length > SECTION_MAX_CHARS
  ) {
    lines.shift();
  }

  if (lines.length === 0) return null;

  return `${SECTION_HEADER}\n\n${lines.join("\n")}`;
}

/**
 * Build report lines for the /memory command widget.
 *
 * @param entries - Chronologically ordered observations, newest last
 * @returns Lines suitable for ctx.ui.setWidget
 */
export function buildMemoryReport(entries: ObservationEntry[], cwd: string): string[] {
  const lines: string[] = [];
  lines.push(`Observational Memory — ${cwd}`);
  lines.push("");

  if (entries.length === 0) {
    lines.push("No observations recorded for this project yet.");
    return lines;
  }

  lines.push(`${entries.length} observation${entries.length > 1 ? "s" : ""} (oldest first):`);
  lines.push("");
  for (const entry of entries) {
    lines.push(formatEntryLine(entry));
  }
  return lines;
}
