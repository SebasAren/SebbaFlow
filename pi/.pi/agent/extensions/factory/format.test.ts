import { describe, it, expect } from "bun:test";
import {
  formatAttention,
  formatDecisionResult,
  formatDecisions,
  formatStatusWidget,
  formatWorkItems,
} from "./format";

describe("formatWorkItems", () => {
  it("renders stage, title, short id, and session state", () => {
    const text = formatWorkItems({
      workItems: [
        {
          id: "aaaaaaaa-1111-2222-3333-444444444444",
          title: "Fix login",
          stages: ["review"],
          sessions: {},
        },
        {
          id: "bbbbbbbb-1111-2222-3333-444444444444",
          title: "Add dark mode",
          stages: ["triage"],
          sessions: {},
        },
      ],
      runningSessionIds: [],
      parkedSessionIds: [],
    });
    expect(text).toContain("Factory Work Items (2)");
    expect(text).toContain("**[review]** Fix login — `aaaaaaaa`");
    expect(text).toContain("**[triage]** Add dark mode — `bbbbbbbb`");
    expect(text).not.toContain("running");
  });

  it("marks running and parked items", () => {
    const text = formatWorkItems({
      workItems: [
        {
          id: "aaaaaaaa-1111",
          title: "A",
          stages: ["execute"],
          sessions: { implement: { sessionId: "s1" } },
        },
        {
          id: "bbbbbbbb-1111",
          title: "B",
          stages: ["review"],
          sessions: { review: { sessionId: "s2" } },
        },
      ],
      runningSessionIds: ["s1"],
      parkedSessionIds: ["s2"],
    });
    expect(text).toContain("A — `aaaaaaaa` · running");
    expect(text).toContain("B — `bbbbbbbb` · parked");
  });

  it("handles an empty list", () => {
    expect(formatWorkItems({ workItems: [] })).toMatch(/No work items found/);
  });

  it("tolerates missing stages and titles", () => {
    const text = formatWorkItems({ workItems: [{ id: "cccccccc-1111" }] });
    expect(text).toContain("**[—]** (untitled)");
  });
});

describe("formatAttention", () => {
  it("renders items with kind, label, and unread flag", () => {
    const text = formatAttention({
      items: [
        { kind: "mention", title: "Look here", unread: true },
        { kind: "activity", key: "p1:activity:1", unread: false },
      ],
      kinds: {
        mention: { open: 1, unread: 1, latest: null },
        activity: { open: 1, unread: 0, latest: null },
      },
    });
    expect(text).toContain("Factory Attention (2)");
    expect(text).toContain("**[mention]** Look here · unread");
    expect(text).toContain("**[activity]** p1:activity:1");
    expect(text).toContain("Open by kind: mention: 1, activity: 1");
  });

  it("handles an empty inbox", () => {
    expect(formatAttention({ items: [], kinds: {} })).toMatch(/empty/i);
  });
});

describe("formatDecisions", () => {
  it("renders pending decisions with work item and role", () => {
    const text = formatDecisions([
      {
        id: "dddddddd-1111",
        workItemId: "aaaaaaaa-1111",
        type: "transition",
        status: "proposed",
        role: "implement",
      },
    ]);
    expect(text).toContain("**proposed** transition on `aaaaaaaa`");
    expect(text).toContain("decision `dddddddd`");
    expect(text).toContain("role implement");
  });

  it("includes the last error on its own line", () => {
    const text = formatDecisions([
      { id: "dddddddd-1111", status: "failed", lastError: "tests failed" },
    ]);
    expect(text).toContain("failed");
    expect(text).toContain("error: tests failed");
  });

  it("handles an empty list", () => {
    expect(formatDecisions([])).toMatch(/No pending decisions/);
  });
});

describe("formatDecisionResult", () => {
  it("reports the action and resulting status", () => {
    const text = formatDecisionResult({ id: "dddddddd-1111", status: "succeeded" }, "approve");
    expect(text).toContain("Approved decision `dddddddd`");
    expect(text).toContain("succeeded");
    expect(formatDecisionResult({ id: "dddddddd-1111" }, "dismiss")).toMatch(/Dismissed/);
    expect(formatDecisionResult({ id: "dddddddd-1111" }, "retry")).toMatch(/Retrying/);
  });
});

describe("formatStatusWidget", () => {
  it("renders compact status lines", () => {
    const lines = formatStatusWidget(
      { items: 5, running: 2, parked: 1, attentionOpen: 3, attentionUnread: 2, proposals: 1 },
      "11111111",
    );
    expect(lines).toEqual([
      "Factory 11111111",
      "Items: 5 · running 2 · parked 1",
      "Attention: 3 open · 2 unread",
      "Proposals waiting: 1",
    ]);
  });
});
