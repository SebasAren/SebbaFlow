import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeSessionSearch, executeSessionRead, sessionDirFor } from "./index";

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

/** Session with 6 user/assistant messages for offset/limit tests. */
function writeFixture(agentDir: string, file: string): string {
  const dir = sessionDirFor(CWD, agentDir);
  mkdirSync(dir, { recursive: true });
  const roles: Array<[string, string]> = [
    ["user", "msg one about alpha"],
    ["assistant", "msg two about alpha"],
    ["user", "msg three about beta"],
    ["assistant", "msg four about beta"],
    ["user", "msg five about gamma"],
    ["assistant", "msg six about gamma"],
  ];
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
    ...roles.map(([role, text], i) =>
      sessionLine(`e${i + 1}`, i === 0 ? "m1" : `e${i}`, role, text, `2026-04-01T10:0${i}:00.000Z`),
    ),
  ];
  const path = join(dir, file);
  writeFileSync(path, lines.join("\n") + "\n");
  return path;
}

describe("executeSessionRead", () => {
  let agentDir: string;
  const FILE = "2026-04-02T11-00-00-000Z_bbbb2222.jsonl";

  beforeAll(() => {
    agentDir = mkdtempSync(join(tmpdir(), "sess-read-"));
    writeFixture(agentDir, FILE);
    // Second session on the same date, for ambiguity tests
    const dir = sessionDirFor(CWD, agentDir);
    writeFileSync(
      join(dir, "2026-04-02T12-30-00-000Z_eeee5555.jsonl"),
      [
        JSON.stringify({
          type: "session",
          version: 3,
          id: "x",
          timestamp: "2026-04-02T12:30:00.000Z",
          cwd: CWD,
        }),
      ].join("\n") + "\n",
    );
  });

  afterAll(() => rmSync(agentDir, { recursive: true, force: true }));

  it("returns a numbered range with original numbering and total count", async () => {
    const result = await executeSessionRead(
      { session: FILE, offset: 2, limit: 3 },
      { agentDir, cwd: CWD },
    );
    expect(result.text).toContain("6 messages"); // header: total count
    expect(result.text).toContain("2. [10:01] assistant: msg two about alpha");
    expect(result.text).toContain("4.");
    expect(result.text).not.toContain("1.");
  });

  it("uses numbering consistent with session_search results", async () => {
    const search = await executeSessionSearch({ query: "beta" }, { agentDir, cwd: CWD });
    expect(search.matches.map((m) => m.number)).toEqual([3, 4]);
    const read = await executeSessionRead(
      { session: FILE, offset: 3, limit: 2 },
      { agentDir, cwd: CWD },
    );
    expect(read.text).toContain("3.");
    expect(read.text).toContain("msg three about beta");
    expect(read.text).toContain("msg four about beta");
  });

  it("resolves a unique date prefix to the matching session", async () => {
    const result = await executeSessionRead(
      { session: "2026-04-02T11", offset: 1, limit: 1 },
      { agentDir, cwd: CWD },
    );
    expect(result.text).toContain("msg one about alpha");
  });

  it("rejects reading the excluded parent session even by exact name", async () => {
    const dir = sessionDirFor(CWD, agentDir);
    const parent = join(dir, FILE);
    await expect(
      executeSessionRead(
        { session: FILE, offset: 1, limit: 2 },
        { agentDir, cwd: CWD, parentFile: parent },
      ),
    ).rejects.toThrow(/not found/);
  });

  it("still reads the second session while the first is excluded", async () => {
    const dir = sessionDirFor(CWD, agentDir);
    const parent = join(dir, FILE);
    const result = await executeSessionRead(
      { session: "2026-04-02T12", offset: 1, limit: 2 },
      { agentDir, cwd: CWD, parentFile: parent },
    );
    expect(result.text).toContain("2026-04-02T12-30-00-000Z_eeee5555.jsonl");
  });

  it("caps total output characters with a truncation note", async () => {
    const result = await executeSessionRead(
      { session: FILE, offset: 1, limit: 6 },
      { agentDir, cwd: CWD, maxOutputChars: 100 },
    );
    expect(result.text.length).toBeLessThanOrEqual(100 + 200); // cap + truncation note allowance
    expect(result.text).toContain("truncated");
  });

  it("header shows a sane range when offset is beyond the end", async () => {
    const result = await executeSessionRead({ session: FILE, offset: 99 }, { agentDir, cwd: CWD });
    expect(result.text).not.toMatch(/showing 99-\d+ -/);
    expect(result.text).toContain("showing 99-98");
  });

  it("throws with candidate list for an ambiguous date prefix", async () => {
    // Both fixture files start with 2026-04-02T1 (candidates listed newest-first)
    await expect(
      executeSessionRead({ session: "2026-04-02T1", offset: 1 }, { agentDir, cwd: CWD }),
    ).rejects.toThrow(/Ambiguous session.*eeee5555\.jsonl.*bbbb2222\.jsonl/s);
  });

  it("throws for an unknown session", async () => {
    await expect(
      executeSessionRead({ session: "1999-01-01", offset: 1 }, { agentDir, cwd: CWD }),
    ).rejects.toThrow(/not found/i);
  });

  it("caps the ambiguity candidate list at 10 with an 'and N more' note", async () => {
    const dir = sessionDirFor(CWD, agentDir);
    for (let i = 0; i < 12; i++) {
      writeFileSync(
        join(dir, `2026-04-05T10-${String(i).padStart(2, "0")}-00-000Z_f${i}.jsonl`),
        "\n",
      );
    }
    await expect(
      executeSessionRead({ session: "2026-04-05", offset: 1 }, { agentDir, cwd: CWD }),
    ).rejects.toThrow(/and 2 more/);
  });

  it("notes an empty window when offset is beyond the end", async () => {
    const result = await executeSessionRead(
      { session: FILE, offset: 99, limit: 5 },
      { agentDir, cwd: CWD },
    );
    expect(result.text).toContain("No messages");
  });
});
