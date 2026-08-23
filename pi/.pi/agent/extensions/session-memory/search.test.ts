import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeSessionSearch } from "./index";
import { sessionDirFor } from "./index";

const CWD = "/repo";

function sessionLine(id: string, parentId: string, role: string, text: string, ts: string): string {
  return JSON.stringify({
    type: "message",
    id,
    parentId,
    timestamp: ts,
    role,
    content: [{ type: "text", text }],
  });
}

function writeSession(agentDir: string, file: string, messages: Array<[string, string]>): string {
  const dir = sessionDirFor(CWD, agentDir);
  mkdirSync(dir, { recursive: true });
  const lines = [
    JSON.stringify({
      type: "session",
      version: 3,
      id: file.slice(0, 8),
      timestamp: file.slice(0, 24),
      cwd: CWD,
    }),
    JSON.stringify({
      type: "model_change",
      id: "m1",
      parentId: null,
      timestamp: "2026-04-01T00:00:00.000Z",
    }),
    ...messages.map(([role, text], i) =>
      sessionLine(`e${i + 1}`, i === 0 ? "m1" : `e${i}`, role, text, `2026-04-01T10:0${i}:00.000Z`),
    ),
  ];
  const path = join(dir, file);
  writeFileSync(path, lines.join("\n") + "\n");
  return path;
}

describe("executeSessionSearch", () => {
  let agentDir: string;
  let parentFile: string;

  beforeAll(() => {
    agentDir = mkdtempSync(join(tmpdir(), "sess-search-"));
    writeSession(agentDir, "2026-04-01T10-00-00-000Z_aaaa1111.jsonl", [
      ["user", "we picked devstral for the librarian subagent"],
      ["assistant", "Yes, devstral-medium is the cheap model now"],
      ["user", "unrelated message about tmux config"],
    ]);
    writeSession(agentDir, "2026-04-02T11-00-00-000Z_bbbb2222.jsonl", [
      ["user", "The Foo widget broke and foo bar also Foo again"],
      ["assistant", "Fixed Foo and the foo bar case"],
    ]);
    parentFile = writeSession(agentDir, "2026-04-03T12-00-00-000Z_cccc3333.jsonl", [
      ["user", "devstral live session should be excluded"],
    ]);
    process.env.PI_PARENT_SESSION_FILE = parentFile;
  });

  afterAll(() => {
    delete process.env.PI_PARENT_SESSION_FILE;
    rmSync(agentDir, { recursive: true, force: true });
  });

  it("finds matches in previous sessions with handle, date, number, role, excerpt", async () => {
    const result = await executeSessionSearch({ query: "devstral" }, { agentDir, cwd: CWD });
    expect(result.text).toContain("2026-04-01T10-00-00-000Z_aaaa1111.jsonl");
    expect(result.text).toContain("2026-04-01");
    expect(result.text).toContain("1. [10:00] user");
    expect(result.text).toContain("we picked devstral");
    expect(result.matches.length).toBeGreaterThanOrEqual(2);
  });

  it("excludes the live parent session (PI_PARENT_SESSION_FILE)", async () => {
    const result = await executeSessionSearch({ query: "excluded" }, { agentDir, cwd: CWD });
    expect(result.text).toContain("No matches");
    expect(result.matches).toHaveLength(0);
  });

  it("smart-case: lowercase query matches any case, uppercase query is case-sensitive", async () => {
    const insensitive = await executeSessionSearch({ query: "foo" }, { agentDir, cwd: CWD });
    expect(insensitive.matches.length).toBe(2); // both messages in file 2

    const sensitive = await executeSessionSearch({ query: "Foo" }, { agentDir, cwd: CWD });
    expect(sensitive.matches.length).toBe(2); // both messages also contain "Foo"
    // Distinguish: a message containing only lowercase must not match "Foo"
    const onlyLower = await executeSessionSearch({ query: "Fixed Foo" }, { agentDir, cwd: CWD });
    expect(onlyLower.matches.length).toBe(1);
  });

  it("truncates results to limit, newest sessions first", async () => {
    const result = await executeSessionSearch({ query: "foo", limit: 1 }, { agentDir, cwd: CWD });
    expect(result.matches).toHaveLength(1);
    expect(result.text).toContain("2026-04-02"); // newest session's match kept
  });

  it("returns 'No matches' text (not a throw) when nothing matches", async () => {
    const result = await executeSessionSearch({ query: "zzz-nothing" }, { agentDir, cwd: CWD });
    expect(result.text).toContain("No matches");
    expect(result.matches).toHaveLength(0);
  });

  it("skips invalid JSONL lines silently", async () => {
    const dir = sessionDirFor(CWD, agentDir);
    writeFileSync(
      join(dir, "2026-04-04T10-00-00-000Z_dddd4444.jsonl"),
      "{not json\n" +
        sessionLine("e1", null as any, "user", "corrupt-file-marker", "2026-04-04T10:00:00.000Z") +
        "\n",
    );
    const result = await executeSessionSearch(
      { query: "corrupt-file-marker" },
      { agentDir, cwd: CWD },
    );
    expect(result.matches).toHaveLength(1);
  });

  it("returns matches ordered newest session first", async () => {
    const result = await executeSessionSearch({ query: "the" }, { agentDir, cwd: CWD });
    const dates = result.matches.map((m) => m.session);
    const sorted = [...dates].sort().reverse();
    expect(dates).toEqual(sorted);
  });
});
