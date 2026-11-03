import { describe, it, expect } from "bun:test";
import { parseGroup, parseThreadRecord, SEVERITY_MARKERS, type ObservationGroup } from "./schema";

function validGroup(): ObservationGroup {
  return {
    id: "group-1",
    threadId: "session-abc",
    createdAt: "2026-11-03T12:00:00.000Z",
    sourceRange: { startId: "entry-1", endId: "entry-9" },
    kind: "observation",
    items: [
      {
        date: "2026-11-03",
        type: "user-statement",
        severity: "user",
        text: "Prefers bun over npm",
      },
      {
        date: "2026-11-03",
        type: "decision",
        severity: "observation",
        text: "Use JSONL for persistence",
      },
    ],
  };
}

describe("parseGroup", () => {
  it("round-trips a valid group through JSON", () => {
    const group = validGroup();
    const parsed = parseGroup(JSON.stringify(group));
    expect(parsed).toEqual(group);
  });

  it("round-trips a reflection group with sourceGroupIds", () => {
    const group: ObservationGroup = {
      ...validGroup(),
      kind: "reflection",
      sourceGroupIds: ["group-1", "group-2"],
    };
    const parsed = parseGroup(JSON.stringify(group));
    expect(parsed).toEqual(group);
  });

  it("accepts a group without sourceGroupIds on reflection kind", () => {
    const group = { ...validGroup(), kind: "reflection" };
    expect(parseGroup(JSON.stringify(group))?.kind).toBe("reflection");
  });

  it("rejects invalid JSON", () => {
    expect(parseGroup("{not json")).toBeUndefined();
  });

  it("rejects non-object JSON", () => {
    expect(parseGroup('"a string"')).toBeUndefined();
    expect(parseGroup("42")).toBeUndefined();
    expect(parseGroup("null")).toBeUndefined();
  });

  it.each([
    [
      "id",
      {
        threadId: "s",
        createdAt: "t",
        sourceRange: { startId: "a", endId: "b" },
        kind: "observation",
        items: [],
      },
    ],
    [
      "threadId",
      {
        id: "g",
        createdAt: "t",
        sourceRange: { startId: "a", endId: "b" },
        kind: "observation",
        items: [],
      },
    ],
    [
      "createdAt",
      {
        id: "g",
        threadId: "s",
        sourceRange: { startId: "a", endId: "b" },
        kind: "observation",
        items: [],
      },
    ],
    ["sourceRange", { id: "g", threadId: "s", createdAt: "t", kind: "observation", items: [] }],
  ])("rejects missing %s", (field, rest) => {
    expect(parseGroup(JSON.stringify(rest))).toBeUndefined();
  });

  it("rejects malformed sourceRange", () => {
    const group = { ...validGroup(), sourceRange: { startId: "a" } };
    expect(parseGroup(JSON.stringify(group))).toBeUndefined();
    const group2 = { ...validGroup(), sourceRange: "entry-1..entry-9" };
    expect(parseGroup(JSON.stringify(group2))).toBeUndefined();
  });

  it("rejects unknown kind", () => {
    const group = { ...validGroup(), kind: "summary" };
    expect(parseGroup(JSON.stringify(group))).toBeUndefined();
  });

  it("rejects non-array items", () => {
    const group = { ...validGroup(), items: "nope" };
    expect(parseGroup(JSON.stringify(group))).toBeUndefined();
  });

  it("rejects invalid items", () => {
    const missingText = {
      ...validGroup(),
      items: [{ date: "2026-11-03", type: "decision", severity: "observation" }],
    };
    expect(parseGroup(JSON.stringify(missingText))).toBeUndefined();

    const badType = {
      ...validGroup(),
      items: [{ date: "2026-11-03", type: "gist", severity: "observation", text: "x" }],
    };
    expect(parseGroup(JSON.stringify(badType))).toBeUndefined();

    const badSeverity = {
      ...validGroup(),
      items: [{ date: "2026-11-03", type: "decision", severity: "critical", text: "x" }],
    };
    expect(parseGroup(JSON.stringify(badSeverity))).toBeUndefined();

    const nonObject = { ...validGroup(), items: ["decision"] };
    expect(parseGroup(JSON.stringify(nonObject))).toBeUndefined();
  });

  it("rejects malformed sourceGroupIds", () => {
    const group = { ...validGroup(), sourceGroupIds: "group-1" };
    expect(parseGroup(JSON.stringify(group))).toBeUndefined();
    const group2 = { ...validGroup(), sourceGroupIds: [1, 2] };
    expect(parseGroup(JSON.stringify(group2))).toBeUndefined();
  });
});

describe("parseThreadRecord", () => {
  it("round-trips a valid record", () => {
    const record = { threadId: "session-abc", lastObservedAt: "2026-11-03T12:00:00.000Z" };
    expect(parseThreadRecord(JSON.stringify(record))).toEqual(record);
  });

  it("rejects invalid JSON and missing fields", () => {
    expect(parseThreadRecord("{oops")).toBeUndefined();
    expect(parseThreadRecord('{"threadId":"s"}')).toBeUndefined();
    expect(parseThreadRecord('{"lastObservedAt":"t"}')).toBeUndefined();
    expect(parseThreadRecord('{"threadId":1,"lastObservedAt":"t"}')).toBeUndefined();
  });
});

describe("SEVERITY_MARKERS", () => {
  it("maps each severity to its marker", () => {
    expect(SEVERITY_MARKERS.user).toBe("🔴");
    expect(SEVERITY_MARKERS.observation).toBe("🟡");
    expect(SEVERITY_MARKERS.action).toBe("🟢");
    expect(SEVERITY_MARKERS.done).toBe("✅");
  });
});
