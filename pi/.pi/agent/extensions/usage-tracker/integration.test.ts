/**
 * Integration tests for the usage-tracker extension.
 *
 * Verifies that the extension loads correctly and registers the expected
 * pi extension API hook (turn_end) and command (/usage).
 */

import { describe, it, expect, mock } from "bun:test";
import { piCodingAgentMock, piTuiMock } from "@pi-ext/shared/test-mocks";

// Mock external dependencies
mock.module("@earendil-works/pi-coding-agent", piCodingAgentMock);
mock.module("@earendil-works/pi-tui", piTuiMock);

// Mock fs to avoid real file operations
mock.module("node:fs", () => ({
  readFileSync: mock(() => "[]"),
  appendFileSync: mock(() => {}),
  mkdirSync: mock(() => {}),
}));

// Now import the extension after mocks are set up
import usageTrackerExtension, { createExtension } from "./index";

describe("usage-tracker extension integration", () => {
  it("can be loaded without errors", () => {
    const mockApi = {
      on: mock(() => {}),
      registerCommand: mock(() => {}),
    };
    expect(() => usageTrackerExtension(mockApi as any)).not.toThrow();
  });

  it("registers turn_end handler via pi.on()", () => {
    const events: string[] = [];
    const mockApi = {
      on: (event: string) => {
        events.push(event);
      },
      registerCommand: mock(() => {}),
    };
    usageTrackerExtension(mockApi as any);
    expect(events).toContain("turn_end");
  });

  it("registers /usage command via pi.registerCommand()", () => {
    const commands: string[] = [];
    const mockApi = {
      on: mock(() => {}),
      registerCommand: (name: string) => {
        commands.push(name);
      },
    };
    usageTrackerExtension(mockApi as any);
    expect(commands).toContain("usage");
  });

  it("declares @pi-ext/shared as a workspace dependency", async () => {
    const pkg = await import("./package.json");
    expect(pkg.dependencies?.["@pi-ext/shared"]).toBe("workspace:*");
  });

  it("turn_end handler captures usage from assistant messages", () => {
    const events = new Map<string, (...args: unknown[]) => void>();
    const mockParse = mock<() => any>();
    const mockAppend = mock<() => void>();

    const mockApi = {
      on: (event: string, handler: (...args: unknown[]) => void) => {
        events.set(event, handler);
      },
      registerCommand: mock(() => {}),
    };

    // Use createExtension with mock deps to test handler behavior
    createExtension({
      parseUsageEntry: mockParse,
      appendUsageEntry: mockAppend,
      readUsageEntries: () => [],
      aggregateEntries: () => ({
        byModel: new Map(),
        total: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
      }),
      formatUsageReport: () => [],
      usagePath: "/tmp/test-usage.jsonl",
    })(mockApi as any);

    const turnEndHandler = events.get("turn_end")!;

    // Fire first turn_end event with claude model
    turnEndHandler({
      type: "turn_end",
      message: {
        role: "assistant",
        model: "claude-sonnet-4",
        usage: { input: 1000, output: 500, cacheRead: 100, cacheWrite: 50, cost: { total: 0.01 } },
      },
    });

    expect(mockParse).toHaveBeenCalledTimes(1);
    expect(mockParse).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-sonnet-4" }),
      expect.any(String),
    );
    expect(mockAppend).toHaveBeenCalledTimes(1);

    // Fire second turn_end event with different model
    mockParse.mockClear();
    mockAppend.mockClear();

    turnEndHandler({
      type: "turn_end",
      message: {
        role: "assistant",
        model: "gpt-4o",
        usage: { input: 2000, output: 800, cacheRead: 200, cacheWrite: 100, cost: { total: 0.02 } },
      },
    });

    expect(mockParse).toHaveBeenCalledTimes(1);
    expect(mockParse).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-4o" }),
      expect.any(String),
    );
    expect(mockAppend).toHaveBeenCalledTimes(1);
  });

  it("turn_end handler ignores non-assistant messages", () => {
    const events = new Map<string, (...args: unknown[]) => void>();
    const mockParse = mock<() => any>();
    const mockAppend = mock<() => void>();

    const mockApi = {
      on: (event: string, handler: (...args: unknown[]) => void) => {
        events.set(event, handler);
      },
      registerCommand: mock(() => {}),
    };

    createExtension({
      parseUsageEntry: mockParse,
      appendUsageEntry: mockAppend,
      readUsageEntries: () => [],
      aggregateEntries: () => ({
        byModel: new Map(),
        total: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
      }),
      formatUsageReport: () => [],
      usagePath: "/tmp/test-usage.jsonl",
    })(mockApi as any);

    const turnEndHandler = events.get("turn_end")!;

    // Fire turn_end with user message (should be ignored)
    turnEndHandler({
      type: "turn_end",
      message: {
        role: "user",
        model: "claude-sonnet-4",
        usage: { input: 1000, output: 500 },
      },
    });

    expect(mockParse).not.toHaveBeenCalled();
    expect(mockAppend).not.toHaveBeenCalled();
  });
});
