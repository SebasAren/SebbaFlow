import { describe, it, expect } from "bun:test";
import { parseUsageEntry } from "./parse-usage";

/** Minimal shape matching the assistant message in a turn_end event. */
const turnEndMessage = (overrides: Record<string, unknown> = {}) =>
  ({
    role: "assistant",
    model: "claude-sonnet-4-20250514",
    usage: {
      input: 1000,
      output: 500,
      cacheRead: 200,
      cacheWrite: 100,
      cost: { total: 0.015 },
    },
    ...overrides,
  }) as any;

describe("parseUsageEntry", () => {
  it("extracts all fields from a full usage message", () => {
    const entry = parseUsageEntry(turnEndMessage(), "/home/user/project");

    expect(entry.project).toBe("/home/user/project");
    expect(entry.model).toBe("claude-sonnet-4-20250514");
    expect(entry.input).toBe(1000);
    expect(entry.output).toBe(500);
    expect(entry.cacheRead).toBe(200);
    expect(entry.cacheWrite).toBe(100);
    expect(entry.cost).toBe(0.015);
    expect(typeof entry.ts).toBe("number");
  });

  it("defaults missing usage fields to 0", () => {
    const msg = turnEndMessage({
      usage: { cost: {} },
    });
    const entry = parseUsageEntry(msg, "/tmp");

    expect(entry.input).toBe(0);
    expect(entry.output).toBe(0);
    expect(entry.cacheRead).toBe(0);
    expect(entry.cacheWrite).toBe(0);
    expect(entry.cost).toBe(0);
  });

  it("defaults model to unknown when missing", () => {
    const msg = turnEndMessage({ model: undefined });
    const entry = parseUsageEntry(msg, "/tmp");

    expect(entry.model).toBe("unknown");
  });

  it("handles completely missing usage object", () => {
    const msg = turnEndMessage({ usage: undefined });
    const entry = parseUsageEntry(msg, "/tmp");

    expect(entry.input).toBe(0);
    expect(entry.output).toBe(0);
    expect(entry.cacheRead).toBe(0);
    expect(entry.cacheWrite).toBe(0);
    expect(entry.cost).toBe(0);
  });

  it("returns a timestamp close to Date.now()", () => {
    const before = Date.now();
    const entry = parseUsageEntry(turnEndMessage(), "/tmp");
    const after = Date.now();

    expect(entry.ts).toBeGreaterThanOrEqual(before);
    expect(entry.ts).toBeLessThanOrEqual(after);
  });
});
