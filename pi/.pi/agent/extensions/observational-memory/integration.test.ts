/**
 * Integration tests for the observational-memory extension.
 *
 * Verifies that the extension loads correctly, registers its event handlers
 * (session_start, before_agent_start, input, turn_end) and the /memory
 * command, and that the handlers record and inject observations.
 */

import { describe, it, expect, mock } from "bun:test";
import { piCodingAgentMock, piTuiMock } from "@pi-ext/shared/test-mocks";

// Mock external dependencies
mock.module("@earendil-works/pi-coding-agent", piCodingAgentMock);
mock.module("@earendil-works/pi-tui", piTuiMock);

// Mock fs to avoid real file operations
mock.module("node:fs", () => ({
  readFileSync: mock(() => ""),
  appendFileSync: mock(() => {}),
  mkdirSync: mock(() => {}),
}));

// Now import the extension after mocks are set up
import observationalMemoryExtension, { createExtension } from "./index";

/** Collect event handlers registered on a fake ExtensionAPI. */
function harness() {
  const events = new Map<string, (...args: unknown[]) => unknown>();
  const commands = new Map<
    string,
    { description?: string; handler: (...args: unknown[]) => unknown }
  >();
  const api = {
    on: (event: string, handler: (...args: unknown[]) => unknown) => {
      events.set(event, handler);
    },
    registerCommand: (name: string, opts: { handler: (...args: unknown[]) => unknown }) => {
      commands.set(name, opts);
    },
  };
  return { events, commands, api };
}

const fakeCtx = {
  cwd: "/home/user/project",
  sessionManager: { getSessionId: () => "session-live" },
};

function wiredDeps() {
  return {
    appendObservation: mock(() => {}),
    readObservations: mock(() => [] as import("./observe").ObservationEntry[]),
    observationsPath: "/tmp/test-observations.jsonl",
  };
}

describe("observational-memory extension integration", () => {
  it("can be loaded without errors", () => {
    const { api } = harness();
    expect(() => observationalMemoryExtension(api as any)).not.toThrow();
  });

  it("registers all event handlers via pi.on()", () => {
    const { events, api } = harness();
    observationalMemoryExtension(api as any);
    for (const name of ["session_start", "before_agent_start", "input", "turn_end"]) {
      expect(events.has(name)).toBe(true);
    }
  });

  it("registers /memory command via pi.registerCommand()", () => {
    const { commands, api } = harness();
    observationalMemoryExtension(api as any);
    expect(commands.has("memory")).toBe(true);
    expect(commands.get("memory")!.description).toBe(
      "Show recent observations recorded for this project",
    );
  });

  it("declares @pi-ext/shared as a workspace dependency", async () => {
    const pkg = await import("./package.json");
    expect(pkg.dependencies?.["@pi-ext/shared"]).toBe("workspace:*");
  });

  it("input handler records user observations", () => {
    const { events, api } = harness();
    const deps = wiredDeps();
    createExtension(deps)(api as any);

    events.get("input")!(
      { type: "input", text: "fix the login bug", source: "interactive" },
      fakeCtx,
    );

    expect(deps.appendObservation).toHaveBeenCalledTimes(1);
    const [entry] = (deps.appendObservation as ReturnType<typeof mock>).mock.calls[0] as [
      import("./observe").ObservationEntry,
    ];
    expect(entry.kind).toBe("user");
    expect(entry.text).toBe("fix the login bug");
    expect(entry.cwd).toBe("/home/user/project");
    expect(entry.sessionId).toBe("session-live");
  });

  it("input handler skips slash commands and extension-sourced steering", () => {
    const { events, api } = harness();
    const deps = wiredDeps();
    createExtension(deps)(api as any);

    events.get("input")!({ type: "input", text: "/memory", source: "interactive" }, fakeCtx);
    events.get("input")!({ type: "input", text: "steering", source: "extension" }, fakeCtx);

    expect(deps.appendObservation).not.toHaveBeenCalled();
  });

  it("turn_end handler records assistant observations", () => {
    const { events, api } = harness();
    const deps = wiredDeps();
    createExtension(deps)(api as any);

    events.get("turn_end")!(
      {
        type: "turn_end",
        message: {
          role: "assistant",
          timestamp: 1700000000000,
          content: [
            { type: "text", text: "Fixed the login bug." },
            { type: "toolCall", name: "edit", arguments: { file_path: "/src/auth.ts" } },
          ],
        },
        toolResults: [],
      },
      fakeCtx,
    );

    expect(deps.appendObservation).toHaveBeenCalledTimes(1);
    const [entry] = (deps.appendObservation as ReturnType<typeof mock>).mock.calls[0] as [
      import("./observe").ObservationEntry,
    ];
    expect(entry.kind).toBe("assistant");
    expect(entry.files).toEqual(["/src/auth.ts"]);
  });

  it("turn_end handler ignores non-assistant messages and signal-free turns", () => {
    const { events, api } = harness();
    const deps = wiredDeps();
    createExtension(deps)(api as any);

    events.get("turn_end")!(
      { type: "turn_end", message: { role: "user" }, toolResults: [] },
      fakeCtx,
    );
    events.get("turn_end")!(
      { type: "turn_end", message: { role: "assistant", content: [] }, toolResults: [] },
      fakeCtx,
    );

    expect(deps.appendObservation).not.toHaveBeenCalled();
  });

  it("session_start builds a digest and before_agent_start injects it as a section", () => {
    const { events, api } = harness();
    const deps = wiredDeps();
    (deps.readObservations as ReturnType<typeof mock>).mockReturnValue([
      {
        ts: 1700000000000,
        cwd: "/home/user/project",
        sessionId: "session-past",
        kind: "user",
        text: "fix the login bug",
      },
    ]);
    createExtension(deps)(api as any);

    // Read called with the live session excluded and the digest limit
    events.get("session_start")!({ type: "session_start", reason: "new" }, fakeCtx);
    expect(deps.readObservations).toHaveBeenCalledWith("/tmp/test-observations.jsonl", {
      cwd: "/home/user/project",
      excludeSessionId: "session-live",
      limit: 40,
    });

    // Section injected into mutable system prompt options
    const options: { sections?: Record<string, string> } = {};
    events.get("before_agent_start")!({ type: "before_agent_start", systemPromptOptions: options });
    expect(options.sections?.["observational-memory"]).toContain("fix the login bug");
  });

  it("before_agent_start leaves options untouched when there is no history", () => {
    const { events, api } = harness();
    const deps = wiredDeps();
    createExtension(deps)(api as any);

    events.get("session_start")!({ type: "session_start", reason: "new" }, fakeCtx);

    const options: { sections?: Record<string, string> } = {};
    events.get("before_agent_start")!({ type: "before_agent_start", systemPromptOptions: options });
    expect(options.sections).toBeUndefined();
  });

  it("/memory command renders a widget from stored observations", async () => {
    const { commands, api } = harness();
    const deps = wiredDeps();
    (deps.readObservations as ReturnType<typeof mock>).mockReturnValue([
      {
        ts: 1700000000000,
        cwd: "/home/user/project",
        sessionId: "session-past",
        kind: "user",
        text: "fix the login bug",
      },
    ]);
    createExtension(deps)(api as any);

    const setWidget = mock(() => {});
    await commands.get("memory")!.handler([], {
      ...fakeCtx,
      ui: { setWidget },
    });

    expect(deps.readObservations).toHaveBeenCalledWith("/tmp/test-observations.jsonl", {
      cwd: "/home/user/project",
      limit: 20,
    });
    expect(setWidget).toHaveBeenCalledWith(
      "memory-report",
      expect.arrayContaining([expect.stringContaining("fix the login bug")]),
    );
  });
});
