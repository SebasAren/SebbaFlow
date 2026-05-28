import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { UsageEntry } from "./parse-usage";

// Mock fs before importing the module under test
const mockReadFileSync = mock<() => string>(() => "");

mock.module("node:fs", () => ({
  readFileSync: mockReadFileSync,
}));

import { readUsageEntries } from "./read-usage";

const makeEntry = (overrides: Partial<UsageEntry> = {}): UsageEntry => ({
  ts: 1700000000000,
  project: "/home/user/project",
  model: "claude-sonnet-4-20250514",
  input: 1000,
  output: 500,
  cacheRead: 200,
  cacheWrite: 100,
  cost: 0.015,
  ...overrides,
});

const toJsonl = (entries: UsageEntry[]): string =>
  entries.map((e) => JSON.stringify(e)).join("\n") + "\n";

describe("readUsageEntries", () => {
  beforeEach(() => {
    mockReadFileSync.mockReset();
    mockReadFileSync.mockReturnValue("");
  });

  it("returns all entries when no filters specified", () => {
    const entries = [makeEntry({ ts: 1000 }), makeEntry({ ts: 2000 })];
    mockReadFileSync.mockReturnValue(toJsonl(entries));

    const result = readUsageEntries("/tmp/usage.jsonl");

    expect(result).toHaveLength(2);
    expect(result[0].ts).toBe(1000);
    expect(result[1].ts).toBe(2000);
  });

  it("excludes entries older than since timestamp", () => {
    const entries = [makeEntry({ ts: 1000 }), makeEntry({ ts: 5000 }), makeEntry({ ts: 10000 })];
    mockReadFileSync.mockReturnValue(toJsonl(entries));

    const result = readUsageEntries("/tmp/usage.jsonl", { since: 3000 });

    expect(result).toHaveLength(2);
    expect(result.map((e) => e.ts)).toEqual([5000, 10000]);
  });

  it("filters by project (cwd prefix match)", () => {
    const entries = [
      makeEntry({ project: "/home/user/project-a" }),
      makeEntry({ project: "/home/user/project-b" }),
      makeEntry({ project: "/home/user/project-a/sub" }),
    ];
    mockReadFileSync.mockReturnValue(toJsonl(entries));

    const result = readUsageEntries("/tmp/usage.jsonl", {
      project: "/home/user/project-a",
    });

    expect(result).toHaveLength(2);
    expect(result[0].project).toBe("/home/user/project-a");
    expect(result[1].project).toBe("/home/user/project-a/sub");
  });

  it("applies combined time and project filters", () => {
    const entries = [
      makeEntry({ ts: 1000, project: "/home/user/project-a" }),
      makeEntry({ ts: 5000, project: "/home/user/project-b" }),
      makeEntry({ ts: 10000, project: "/home/user/project-a" }),
    ];
    mockReadFileSync.mockReturnValue(toJsonl(entries));

    const result = readUsageEntries("/tmp/usage.jsonl", {
      since: 3000,
      project: "/home/user/project-a",
    });

    expect(result).toHaveLength(1);
    expect(result[0].ts).toBe(10000);
  });

  it("skips malformed lines", () => {
    const lines = [
      JSON.stringify(makeEntry()),
      "not valid json",
      JSON.stringify(makeEntry({ ts: 2000 })),
      "",
    ];
    mockReadFileSync.mockReturnValue(lines.join("\n") + "\n");

    const result = readUsageEntries("/tmp/usage.jsonl");

    expect(result).toHaveLength(2);
  });

  it("returns empty array for empty file", () => {
    mockReadFileSync.mockReturnValue("");

    const result = readUsageEntries("/tmp/usage.jsonl");

    expect(result).toEqual([]);
  });

  it("returns empty array when file does not exist", () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT: no such file or directory");
    });

    const result = readUsageEntries("/tmp/usage.jsonl");

    expect(result).toEqual([]);
  });
});
