import { describe, it, expect } from "bun:test";
import { buildMemoryReport, buildMemorySection, formatEntryLine, formatTimestamp } from "./digest";
import type { ObservationEntry } from "./observe";

// 2026-11-02T21:16:00.000Z
const TS = Date.UTC(2026, 10, 2, 21, 16, 0);

const makeEntry = (overrides: Partial<ObservationEntry> = {}): ObservationEntry => ({
  ts: TS,
  cwd: "/home/user/project",
  sessionId: "session-1",
  kind: "user",
  text: "fix the login bug",
  ...overrides,
});

describe("formatTimestamp", () => {
  it("formats as 'MMM d HH:MM' in UTC", () => {
    expect(formatTimestamp(TS)).toBe("Nov 2 21:16");
  });

  it("zero-pads hours and minutes", () => {
    expect(formatTimestamp(Date.UTC(2026, 0, 9, 5, 7, 0))).toBe("Jan 9 05:07");
  });
});

describe("formatEntryLine", () => {
  it("renders kind and text with a timestamp", () => {
    expect(formatEntryLine(makeEntry())).toBe("• [Nov 2 21:16] user: fix the login bug");
  });

  it("appends tools, files, and errors suffixes when present", () => {
    const line = formatEntryLine(
      makeEntry({
        kind: "assistant",
        text: "deployed the fix",
        tools: ["edit", "bash"],
        files: ["/src/auth.ts"],
        errors: ["bash: exit 1"],
      }),
    );
    expect(line).toBe(
      "• [Nov 2 21:16] assistant: deployed the fix [tools: edit, bash] [files: /src/auth.ts] [errors: bash: exit 1]",
    );
  });
});

describe("buildMemorySection", () => {
  it("returns null when there are no entries", () => {
    expect(buildMemorySection([])).toBeNull();
  });

  it("wraps entry lines after a header", () => {
    const section = buildMemorySection([
      makeEntry(),
      makeEntry({ kind: "assistant", text: "done" }),
    ])!;
    expect(section).toContain("lossy heuristic");
    expect(section).toContain("• [Nov 2 21:16] user: fix the login bug");
    expect(section).toContain("• [Nov 2 21:16] assistant: done");
  });

  it("drops oldest lines to stay under the character cap", () => {
    const entries = [1, 2, 3, 4, 5, 6].map((n) =>
      makeEntry({ ts: TS + n * 60_000, text: "y".repeat(900) }),
    );
    const section = buildMemorySection(entries)!;

    expect(section.length).toBeLessThanOrEqual(3500);
    // Newest entry survives, oldest is dropped to fit
    expect(section).toContain(formatTimestamp(TS + 6 * 60_000));
    expect(section).not.toContain(formatTimestamp(TS + 1 * 60_000));
  });
});

describe("buildMemoryReport", () => {
  it("renders an empty state when there are no entries", () => {
    const lines = buildMemoryReport([], "/home/user/project");
    expect(lines[0]).toBe("Observational Memory — /home/user/project");
    expect(lines).toContain("No observations recorded for this project yet.");
  });

  it("lists entries oldest first with a count", () => {
    const lines = buildMemoryReport(
      [makeEntry({ text: "first" }), makeEntry({ ts: TS + 1, text: "second" })],
      "/home/user/project",
    );
    expect(lines).toContain("2 observations (oldest first):");
    const firstIdx = lines.findIndex((l) => l.includes("first"));
    const secondIdx = lines.findIndex((l) => l.includes("second"));
    expect(firstIdx).toBeGreaterThan(-1);
    expect(firstIdx).toBeLessThan(secondIdx);
  });
});
