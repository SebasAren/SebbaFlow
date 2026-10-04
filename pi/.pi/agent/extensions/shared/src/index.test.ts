import { describe, it, expect } from "bun:test";
import * as shared from "./index";

describe("index exports", () => {
  it("exports resolveRealCwd", () => {
    expect(typeof shared.resolveRealCwd).toBe("function");
  });

  it("exports formatTokens", () => {
    expect(typeof shared.formatTokens).toBe("function");
  });

  it("exports formatUsageLine", () => {
    expect(typeof shared.formatUsageLine).toBe("function");
  });

  it("exports parseSections", () => {
    expect(typeof shared.parseSections).toBe("function");
  });

  it("exports getSectionSummary", () => {
    expect(typeof shared.getSectionSummary).toBe("function");
  });

  it("exports getPiInvocation", () => {
    // Removed: subagent now runs in-process, no subprocess spawning
    // getPiInvocation is no longer exported
  });

  it("exports splitIntoSentences", () => {
    expect(typeof shared.splitIntoSentences).toBe("function");
  });

  it("exports formatAsBulletList", () => {
    expect(typeof shared.formatAsBulletList).toBe("function");
  });
});

// Type-only exports
import type { SubagentResult, UsageStats, SentenceFragment } from "./index";

describe("type exports", () => {
  it("exports SubagentResult type", () => {
    // Ensure the type is importable (compile-time check)
    const result: SubagentResult = {
      exitCode: 0,
      output: "",
      stderr: "",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0,
        contextTokens: 0,
        turns: 0,
      },
    };
    expect(result.exitCode).toBe(0);
  });

  it("exports UsageStats type", () => {
    const usage: UsageStats = {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      contextTokens: 0,
      turns: 0,
    };
    expect(usage.turns).toBe(0);
  });

  it("exports SpawnOptions type", () => {
    // Removed: SpawnOptions no longer exported (no subprocess spawning)
  });

  it("exports SentenceFragment type", () => {
    const fragment: SentenceFragment = {
      text: "test",
      truncated: false,
    };
    expect(fragment.text).toBe("test");
  });
});
