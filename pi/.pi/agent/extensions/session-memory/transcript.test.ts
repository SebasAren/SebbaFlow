import { describe, it, expect } from "bun:test";
import { parseSessionFile, flattenMainPath, renderTranscript, formatMessage } from "./index";
import type { SessionEntry } from "./index";

/** Fixture: session with a fork (abandoned retry) and varied content blocks. */
const FIXTURE_LINES: string[] = [
  '{"type":"session","version":3,"id":"2d74ff7d","timestamp":"2026-04-02T21:36:49.298Z","cwd":"/repo"}',
  '{"type":"model_change","id":"b243e8dd","parentId":null,"timestamp":"2026-04-02T21:36:49.300Z","provider":"mistral","modelId":"devstral-medium-latest"}',
  '{"type":"message","id":"a1","parentId":"b243e8dd","timestamp":"2026-04-02T21:36:50.000Z","role":"user","content":[{"type":"text","text":"fix the login bug"}]}',
  '{"type":"message","id":"a2","parentId":"a1","timestamp":"2026-04-02T21:37:10.000Z","role":"assistant","content":[{"type":"thinking","thinking":"let me think about this carefully"},{"type":"toolCall","id":"tc1","name":"bash","arguments":{"command":"rg login src/"}},{"type":"text","text":"Found it in auth.ts"}]}',
  '{"type":"message","id":"a3","parentId":"a2","timestamp":"2026-04-02T21:37:12.000Z","role":"toolResult","toolCallId":"tc1","toolName":"bash","content":[{"type":"text","text":"src/auth.ts:42:..."}]}',
  // Fork: abandoned retry (same parentId as a5)
  '{"type":"message","id":"a4","parentId":"a3","timestamp":"2026-04-02T21:38:00.000Z","role":"assistant","content":[{"type":"text","text":"ABANDONED wrong take"}]}',
  // Fork: winning branch (later in file)
  '{"type":"message","id":"a5","parentId":"a3","timestamp":"2026-04-02T21:38:05.000Z","role":"assistant","content":[{"type":"text","text":"The fix is to check the token expiry"}]}',
  '{"type":"message","id":"a6","parentId":"a5","timestamp":"2026-04-02T21:39:00.000Z","role":"user","content":[{"type":"text","text":"thanks"}]}',
];

describe("parseSessionFile", () => {
  it("parses each line into an entry, skipping invalid JSON silently", () => {
    const entries = parseSessionFile([...FIXTURE_LINES, "{not json", ""]);
    expect(entries).toHaveLength(8);
    expect(entries[0].type).toBe("session");
    expect(entries[2].role).toBe("user");
  });
});

describe("flattenMainPath", () => {
  it("walks the last entry to the root, dropping abandoned branches", () => {
    const entries = parseSessionFile(FIXTURE_LINES);
    const path = flattenMainPath(entries);
    expect(path.map((e: SessionEntry) => e.id)).toEqual(["b243e8dd", "a1", "a2", "a3", "a5", "a6"]);
  });
});

describe("renderTranscript", () => {
  const rendered = renderTranscript(parseSessionFile(FIXTURE_LINES));

  it("numbers only user and assistant messages, 1..N chronological", () => {
    expect(rendered.map((m) => m.number)).toEqual([1, 2, 3, 4]);
    expect(rendered.map((m) => m.role)).toEqual(["user", "assistant", "assistant", "user"]);
  });

  it("keeps user text", () => {
    expect(rendered[0].text).toBe("fix the login bug");
    expect(rendered[3].text).toBe("thanks");
  });

  it("keeps assistant text, collapses tool calls to one summary line, drops thinking and tool results", () => {
    expect(rendered[1].text).toContain("Found it in auth.ts");
    expect(rendered[1].text).toContain("→ bash(rg login src/)");
    expect(rendered[1].text).not.toContain("let me think");
    expect(rendered.map((m) => m.text).join("\n")).not.toContain("auth.ts:42");
    expect(rendered.map((m) => m.text).join("\n")).not.toContain("ABANDONED");
  });

  it("records HH:MM timestamps (UTC)", () => {
    expect(rendered[0].time).toBe("21:36");
  });
});

describe("formatMessage", () => {
  it("renders a numbered line", () => {
    const [first] = renderTranscript(parseSessionFile(FIXTURE_LINES));
    expect(formatMessage(first)).toBe("1. [21:36] user: fix the login bug");
  });
});
