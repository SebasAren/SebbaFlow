import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { ObservationEntry } from "./observe";

// Mock fs before importing the module under test
const mockReadFileSync = mock<() => string>(() => "");
const mockAppendFileSync = mock<() => void>(() => {});
const mockMkdirSync = mock<() => void>(() => {});

mock.module("node:fs", () => ({
  readFileSync: mockReadFileSync,
  appendFileSync: mockAppendFileSync,
  mkdirSync: mockMkdirSync,
}));

import { appendObservation, readObservations } from "./store";

const makeEntry = (overrides: Partial<ObservationEntry> = {}): ObservationEntry => ({
  ts: 1700000000000,
  cwd: "/home/user/project",
  sessionId: "session-1",
  kind: "user",
  text: "fix the login bug",
  ...overrides,
});

const toJsonl = (entries: ObservationEntry[]): string =>
  entries.map((e) => JSON.stringify(e)).join("\n") + "\n";

describe("appendObservation", () => {
  beforeEach(() => {
    mockMkdirSync.mockClear();
    mockAppendFileSync.mockClear();
  });

  it("creates the parent directory and appends a JSON line", () => {
    const entry = makeEntry();
    appendObservation(entry, "/tmp/dir/observations.jsonl");

    expect(mockMkdirSync).toHaveBeenCalledWith("/tmp/dir", { recursive: true });
    expect(mockAppendFileSync).toHaveBeenCalledTimes(1);
    const [path, written] = mockAppendFileSync.mock.calls[0] as [string, string];
    expect(path).toBe("/tmp/dir/observations.jsonl");
    expect(JSON.parse(written)).toEqual(entry);
    expect(written.endsWith("\n")).toBe(true);
  });

  it("never throws when writing fails", () => {
    mockAppendFileSync.mockImplementation(() => {
      throw new Error("disk full");
    });
    expect(() => appendObservation(makeEntry(), "/tmp/x.jsonl")).not.toThrow();
  });
});

describe("readObservations", () => {
  beforeEach(() => {
    mockReadFileSync.mockReset();
    mockReadFileSync.mockReturnValue("");
  });

  it("returns all entries when no filters specified", () => {
    mockReadFileSync.mockReturnValue(toJsonl([makeEntry({ ts: 1000 }), makeEntry({ ts: 2000 })]));

    const result = readObservations("/tmp/observations.jsonl");

    expect(result).toHaveLength(2);
    expect(result.map((e) => e.ts)).toEqual([1000, 2000]);
  });

  it("returns [] for a missing file", () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    expect(readObservations("/tmp/missing.jsonl")).toEqual([]);
  });

  it("skips malformed and structurally invalid lines", () => {
    mockReadFileSync.mockReturnValue(
      [
        "{ not json",
        JSON.stringify({ ts: "nope", cwd: "/x", sessionId: "s", kind: "user", text: "t" }),
        JSON.stringify(makeEntry({ ts: 1000 })),
        "",
        JSON.stringify({ ts: 2000 }),
      ].join("\n") + "\n",
    );

    const result = readObservations("/tmp/observations.jsonl");
    expect(result).toHaveLength(1);
    expect(result[0].ts).toBe(1000);
  });

  it("filters by cwd", () => {
    mockReadFileSync.mockReturnValue(
      toJsonl([
        makeEntry({ cwd: "/home/user/a" }),
        makeEntry({ cwd: "/home/user/b" }),
        makeEntry({ cwd: "/home/user/a" }),
      ]),
    );

    const result = readObservations("/tmp/observations.jsonl", { cwd: "/home/user/a" });
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.cwd === "/home/user/a")).toBe(true);
  });

  it("excludes entries from the given session", () => {
    mockReadFileSync.mockReturnValue(
      toJsonl([makeEntry({ sessionId: "live" }), makeEntry({ sessionId: "past" })]),
    );

    const result = readObservations("/tmp/observations.jsonl", { excludeSessionId: "live" });
    expect(result).toHaveLength(1);
    expect(result[0].sessionId).toBe("past");
  });

  it("limits to the newest entries (kept in chronological order)", () => {
    mockReadFileSync.mockReturnValue(toJsonl([1, 2, 3, 4, 5].map((n) => makeEntry({ ts: n }))));

    const result = readObservations("/tmp/observations.jsonl", { limit: 2 });
    expect(result.map((e) => e.ts)).toEqual([4, 5]);
  });
});
