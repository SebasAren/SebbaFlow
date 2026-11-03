import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ObservationGroup, ThreadRecord } from "./schema";
import { appendGroup, getGroupById, getGroups, getThreads, updateWatermark } from "./store";

let projectDir: string;

function makeGroup(overrides: Partial<ObservationGroup> = {}): ObservationGroup {
  return {
    id: overrides.id ?? "g1",
    threadId: overrides.threadId ?? "thread-a",
    createdAt: overrides.createdAt ?? "2026-11-03T10:00:00.000Z",
    sourceRange: overrides.sourceRange ?? { startId: "m1", endId: "m5" },
    kind: overrides.kind ?? "observation",
    items: overrides.items ?? [
      { date: "2026-11-03", type: "user-statement", severity: "user", text: "Ship it" },
    ],
    sourceGroupIds: overrides.sourceGroupIds,
  };
}

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), "om-store-"));
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

describe("appendGroup / getGroups", () => {
  it("round-trips a group", () => {
    const group = makeGroup();
    appendGroup(projectDir, group);
    expect(getGroups(projectDir)).toEqual([group]);
  });

  it("creates the project directory on first write", () => {
    const dir = join(projectDir, "new-project");
    appendGroup(dir, makeGroup());
    expect(existsSync(dir)).toBe(true);
    expect(getGroups(dir)).toHaveLength(1);
  });

  it("returns empty for a missing directory", () => {
    expect(getGroups(join(projectDir, "never-created"))).toEqual([]);
  });

  it("returns groups oldest first", () => {
    appendGroup(projectDir, makeGroup({ id: "first" }));
    appendGroup(projectDir, makeGroup({ id: "second" }));
    const groups = getGroups(projectDir);
    expect(groups.map((g) => g.id)).toEqual(["first", "second"]);
  });

  it("skips corrupt lines silently", () => {
    appendGroup(projectDir, makeGroup({ id: "good-1" }));
    const groupsFile = join(projectDir, "groups.jsonl");
    const raw = readFileSync(groupsFile, "utf-8");
    writeFileSync(groupsFile, `${raw}not json at all\n{"id":"broken","threadId":\n`);
    appendGroup(projectDir, makeGroup({ id: "good-2" }));
    const ids = getGroups(projectDir).map((g) => g.id);
    expect(ids).toEqual(["good-1", "good-2"]);
  });

  it("limit returns the newest N in chronological order", () => {
    for (const id of ["a", "b", "c", "d"]) appendGroup(projectDir, makeGroup({ id }));
    const groups = getGroups(projectDir, { limit: 2 });
    expect(groups.map((g) => g.id)).toEqual(["c", "d"]);
  });

  it("filters by threadId", () => {
    appendGroup(projectDir, makeGroup({ id: "a", threadId: "t1" }));
    appendGroup(projectDir, makeGroup({ id: "b", threadId: "t2" }));
    appendGroup(projectDir, makeGroup({ id: "c", threadId: "t1" }));
    const groups = getGroups(projectDir, { threadId: "t1" });
    expect(groups.map((g) => g.id)).toEqual(["a", "c"]);
  });

  it("filters by kind", () => {
    appendGroup(projectDir, makeGroup({ id: "obs", kind: "observation" }));
    appendGroup(projectDir, makeGroup({ id: "ref", kind: "reflection" }));
    expect(getGroups(projectDir, { kind: "reflection" }).map((g) => g.id)).toEqual(["ref"]);
  });

  it("never throws on an unwritable project path", () => {
    // A file where a directory is needed → mkdir must fail, append must not throw.
    const blocker = join(projectDir, "blocker");
    writeFileSync(blocker, "i am a file");
    expect(() => appendGroup(join(blocker, "sub"), makeGroup())).not.toThrow();
  });
});

describe("getGroupById", () => {
  it("finds a group by id", () => {
    appendGroup(projectDir, makeGroup({ id: "target" }));
    appendGroup(projectDir, makeGroup({ id: "other" }));
    expect(getGroupById(projectDir, "target")?.id).toBe("target");
  });

  it("returns undefined for unknown ids and empty stores", () => {
    expect(getGroupById(projectDir, "nope")).toBeUndefined();
    expect(getGroupById(join(projectDir, "missing"), "nope")).toBeUndefined();
  });
});

describe("watermarks", () => {
  it("round-trips a thread record", () => {
    const record: ThreadRecord = { threadId: "t1", lastObservedAt: "2026-11-03T09:00:00.000Z" };
    updateWatermark(projectDir, record);
    expect(getThreads(projectDir)).toEqual({ t1: record });
  });

  it("latest record wins per thread", () => {
    updateWatermark(projectDir, { threadId: "t1", lastObservedAt: "2026-11-03T09:00:00.000Z" });
    updateWatermark(projectDir, { threadId: "t2", lastObservedAt: "2026-11-03T09:30:00.000Z" });
    updateWatermark(projectDir, { threadId: "t1", lastObservedAt: "2026-11-03T10:00:00.000Z" });
    const threads = getThreads(projectDir);
    expect(threads.t1?.lastObservedAt).toBe("2026-11-03T10:00:00.000Z");
    expect(threads.t2?.lastObservedAt).toBe("2026-11-03T09:30:00.000Z");
  });

  it("skips corrupt lines in threads.jsonl", () => {
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "threads.jsonl"), 'garbage\n{"threadId":"t9"}\n');
    updateWatermark(projectDir, { threadId: "t1", lastObservedAt: "2026-11-03T10:00:00.000Z" });
    const threads = getThreads(projectDir);
    expect(Object.keys(threads)).toEqual(["t1"]);
  });

  it("never throws on an unwritable path", () => {
    const blocker = join(projectDir, "blocker");
    writeFileSync(blocker, "i am a file");
    expect(() =>
      updateWatermark(join(blocker, "sub"), { threadId: "t1", lastObservedAt: "x" }),
    ).not.toThrow();
  });
});
