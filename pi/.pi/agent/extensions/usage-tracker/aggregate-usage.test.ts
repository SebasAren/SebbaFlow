import { describe, it, expect } from "bun:test";
import { aggregateEntries } from "./aggregate-usage";
import type { UsageEntry } from "./parse-usage";

const makeEntry = (overrides: Partial<UsageEntry> = {}): UsageEntry => ({
  ts: 1700000000000,
  project: "/home/user/project",
  model: "claude-sonnet-4-20250514",
  input: 1000,
  output: 500,
  cacheRead: 200,
  cacheWrite: 100,
  cost: 0.015,
  ...overrides,
});

describe("aggregateEntries", () => {
  it("returns empty aggregation for empty array", () => {
    const result = aggregateEntries([]);

    expect(result.total.turns).toBe(0);
    expect(result.total.input).toBe(0);
    expect(result.total.output).toBe(0);
    expect(result.total.cacheRead).toBe(0);
    expect(result.total.cacheWrite).toBe(0);
    expect(result.total.cost).toBe(0);
    expect(result.byModel.size).toBe(0);
  });

  it("aggregates a single entry correctly", () => {
    const entry = makeEntry({
      input: 1000,
      output: 500,
      cacheRead: 200,
      cacheWrite: 100,
      cost: 0.015,
    });

    const result = aggregateEntries([entry]);

    expect(result.total.turns).toBe(1);
    expect(result.total.input).toBe(1000);
    expect(result.total.output).toBe(500);
    expect(result.total.cacheRead).toBe(200);
    expect(result.total.cacheWrite).toBe(100);
    expect(result.total.cost).toBe(0.015);

    const modelStats = result.byModel.get("claude-sonnet-4-20250514");
    expect(modelStats).toBeDefined();
    expect(modelStats!.turns).toBe(1);
    expect(modelStats!.input).toBe(1000);
  });

  it("sums multiple entries with same model", () => {
    const entries = [
      makeEntry({ model: "claude-sonnet-4-20250514", input: 1000, output: 500, cost: 0.01 }),
      makeEntry({ model: "claude-sonnet-4-20250514", input: 2000, output: 800, cost: 0.02 }),
      makeEntry({ model: "claude-sonnet-4-20250514", input: 500, output: 200, cost: 0.005 }),
    ];

    const result = aggregateEntries(entries);

    expect(result.total.turns).toBe(3);
    expect(result.total.input).toBe(3500);
    expect(result.total.output).toBe(1500);
    expect(result.total.cost).toBeCloseTo(0.035);

    const modelStats = result.byModel.get("claude-sonnet-4-20250514");
    expect(modelStats!.turns).toBe(3);
    expect(modelStats!.input).toBe(3500);
  });

  it("groups entries by different models", () => {
    const entries = [
      makeEntry({ model: "claude-sonnet-4-20250514", input: 1000, cost: 0.01 }),
      makeEntry({ model: "gpt-4o", input: 2000, cost: 0.03 }),
      makeEntry({ model: "claude-sonnet-4-20250514", input: 500, cost: 0.005 }),
    ];

    const result = aggregateEntries(entries);

    expect(result.byModel.size).toBe(2);

    const sonnet = result.byModel.get("claude-sonnet-4-20250514");
    expect(sonnet!.turns).toBe(2);
    expect(sonnet!.input).toBe(1500);

    const gpt = result.byModel.get("gpt-4o");
    expect(gpt!.turns).toBe(1);
    expect(gpt!.input).toBe(2000);

    expect(result.total.turns).toBe(3);
    expect(result.total.input).toBe(3500);
  });

  it("accumulates cache stats", () => {
    const entries = [
      makeEntry({ cacheRead: 100, cacheWrite: 50 }),
      makeEntry({ cacheRead: 200, cacheWrite: 80 }),
    ];

    const result = aggregateEntries(entries);

    expect(result.total.cacheRead).toBe(300);
    expect(result.total.cacheWrite).toBe(130);
  });
});
