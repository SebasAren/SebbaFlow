import { describe, it, expect, mock, afterAll, beforeAll } from "bun:test";
import { typeboxMock, piCodingAgentMock } from "../shared/src/test-mocks";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sessionDirFor } from "./index";

// Mock external dependencies
mock.module("@earendil-works/pi-coding-agent", piCodingAgentMock);

mock.module("typebox", typeboxMock);

import sessionMemoryExtension from "./index";

describe("session-memory extension", () => {
  const origLibrarian = process.env.PI_LIBRARIAN_LOAD;

  it("can be loaded without errors", () => {
    delete process.env.PI_LIBRARIAN_LOAD;
    const mockApi = {
      registerTool: mock(() => {}),
      registerCommand: mock(() => {}),
    };
    expect(() => sessionMemoryExtension(mockApi as any)).not.toThrow();
  });

  it("skips registration when not in librarian context (PI_LIBRARIAN_LOAD not set)", () => {
    delete process.env.PI_LIBRARIAN_LOAD;
    const registeredTools: any[] = [];
    const registeredCommands: { name: string; command: any }[] = [];
    const mockApi = {
      registerTool: (tool: any) => registeredTools.push(tool),
      registerCommand: (name: string, command: any) => {
        registeredCommands.push({ name, command });
      },
    };
    sessionMemoryExtension(mockApi as any);
    expect(registeredTools).toHaveLength(0);
    expect(registeredCommands).toHaveLength(0);
  });

  it("registers two tools (session_search and session_read) when in librarian context", () => {
    process.env.PI_LIBRARIAN_LOAD = "1";
    const registeredTools: any[] = [];
    const registeredCommands: { name: string; command: any }[] = [];
    const mockApi = {
      registerTool: (tool: any) => registeredTools.push(tool),
      registerCommand: (name: string, command: any) => {
        registeredCommands.push({ name, command });
      },
    };
    sessionMemoryExtension(mockApi as any);
    delete process.env.PI_LIBRARIAN_LOAD;
    expect(registeredTools).toHaveLength(2);
    expect(registeredTools[0].name).toBe("session_search");
    expect(registeredTools[1].name).toBe("session_read");
    expect(registeredCommands).toHaveLength(0);
  });

  afterAll(() => {
    if (origLibrarian !== undefined) process.env.PI_LIBRARIAN_LOAD = origLibrarian;
    else delete process.env.PI_LIBRARIAN_LOAD;
  });
});

describe("session-memory end-to-end flow", () => {
  const origLibrarian = process.env.PI_LIBRARIAN_LOAD;
  const origParent = process.env.PI_PARENT_SESSION_FILE;
  const origRealCwd = process.env.PI_REAL_CWD;
  let realCwd: string;
  let parentFile: string;
  let tools: any[];

  function msgLine(id: string, parentId: string, role: string, text: string): string {
    return JSON.stringify({
      type: "message",
      id,
      parentId,
      timestamp: "2026-05-01T09:00:00.000Z",
      role,
      content: [{ type: "text", text }],
    });
  }

  beforeAll(() => {
    // getAgentDir is mocked to "/tmp/agent"; PI_REAL_CWD routes resolveRealCwd
    realCwd = mkdtempSync(join(tmpdir(), "sess-e2e-cwd-"));
    process.env.PI_REAL_CWD = realCwd;
    const dir = sessionDirFor(realCwd, "/tmp/agent");
    mkdirSync(dir, { recursive: true });
    const flow =
      [
        JSON.stringify({
          type: "session",
          version: 3,
          id: "f1",
          timestamp: "2026-05-01T09:00:00.000Z",
          cwd: realCwd,
        }),
        JSON.stringify({
          type: "model_change",
          id: "m1",
          parentId: null,
          timestamp: "2026-05-01T09:00:00.000Z",
        }),
        msgLine("e1", "m1", "user", "we grilled the grill-me skill design"),
        msgLine("e2", "e1", "assistant", "the grill session concluded with a plan"),
        msgLine("e3", "e2", "user", "unrelated msg about kitty config"),
      ].join("\n") + "\n";
    writeFileSync(join(dir, "2026-05-01T09-00-00-000Z_flow1111.jsonl"), flow);
    parentFile = join(dir, "2026-05-02T09-00-00-000Z_live2222.jsonl");
    writeFileSync(
      parentFile,
      [
        JSON.stringify({
          type: "session",
          version: 3,
          id: "f2",
          timestamp: "2026-05-02T09:00:00.000Z",
          cwd: realCwd,
        }),
        msgLine("l1", null as any, "user", "live-session-marker should never appear"),
      ].join("\n") + "\n",
    );
    process.env.PI_PARENT_SESSION_FILE = parentFile;
    process.env.PI_LIBRARIAN_LOAD = "1";
    tools = [];
    sessionMemoryExtension({ registerTool: (t: any) => tools.push(t) } as any);
  });

  afterAll(() => {
    rmSync(join("/tmp/agent", "sessions"), { recursive: true, force: true });
    rmSync(realCwd, { recursive: true, force: true });
    if (origLibrarian !== undefined) process.env.PI_LIBRARIAN_LOAD = origLibrarian;
    else delete process.env.PI_LIBRARIAN_LOAD;
    if (origParent !== undefined) process.env.PI_PARENT_SESSION_FILE = origParent;
    else delete process.env.PI_PARENT_SESSION_FILE;
    if (origRealCwd !== undefined) process.env.PI_REAL_CWD = origRealCwd;
    else delete process.env.PI_REAL_CWD;
  });

  it("search → read returns the same message at the reported number", async () => {
    const search = tools.find((t) => t.name === "session_search");
    const read = tools.find((t) => t.name === "session_read");
    // ctx.cwd is the fixture cwd itself: works with the real resolveRealCwd
    // (resolves to the same dir) and with test-double pass-through mocks.
    const ctx = { cwd: realCwd } as any;

    const res = await search.execute("id", { query: "grill" }, undefined, undefined, ctx);
    expect(res.details.matches.length).toBe(2);
    const m = res.details.matches[1]; // assistant message #2
    expect(m.number).toBe(2);

    const rres = await read.execute(
      "id",
      { session: m.session, offset: m.number, limit: 1 },
      undefined,
      undefined,
      ctx,
    );
    expect(rres.content[0].text).toContain("the grill session concluded with a plan");
  });

  it("excludes the live parent session end-to-end", async () => {
    const search = tools.find((t) => t.name === "session_search");
    const ctx = { cwd: realCwd } as any;
    const res = await search.execute(
      "id",
      { query: "live-session-marker" },
      undefined,
      undefined,
      ctx,
    );
    expect(res.details.matches).toHaveLength(0);
    expect(res.content[0].text).toContain("No matches");
  });
});
