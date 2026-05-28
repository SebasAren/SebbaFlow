import { describe, it, expect } from "bun:test";
import { formatUsageReport } from "./format-report";
import type { AggregationResult } from "./aggregate-usage";

const emptyAggregation = (): AggregationResult => ({
  byModel: new Map(),
  total: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
});

const makeAggregation = (
  models: Array<{
    name: string;
    input: number;
    output: number;
    cost: number;
    turns: number;
  }>,
): AggregationResult => {
  const byModel = new Map();
  const total = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 };

  for (const m of models) {
    byModel.set(m.name, {
      input: m.input,
      output: m.output,
      cacheRead: 0,
      cacheWrite: 0,
      cost: m.cost,
      turns: m.turns,
    });
    total.input += m.input;
    total.output += m.output;
    total.cost += m.cost;
    total.turns += m.turns;
  }

  return { byModel, total };
};

describe("formatUsageReport", () => {
  it("shows 'No usage data' for empty aggregation", () => {
    const lines = formatUsageReport(emptyAggregation(), "Today");

    expect(lines.some((l) => l.includes("No usage data"))).toBe(true);
  });

  it("includes the time label in the header", () => {
    const lines = formatUsageReport(emptyAggregation(), "This Week");

    expect(lines.some((l) => l.includes("This Week"))).toBe(true);
  });

  it("shows model rows with formatted tokens", () => {
    const agg = makeAggregation([
      { name: "claude-sonnet-4-20250514", input: 5000, output: 2000, cost: 0.03, turns: 4 },
    ]);

    const lines = formatUsageReport(agg, "Today");
    const output = lines.join("\n");

    expect(output).toContain("claude-sonnet-4-20250514");
    expect(output).toContain("5.0k"); // formatTokens(5000)
    expect(output).toContain("2.0k"); // formatTokens(2000)
    expect(output).toContain("$0.0300"); // cost formatted
  });

  it("shows total row at the bottom", () => {
    const agg = makeAggregation([
      { name: "model-a", input: 1000, output: 500, cost: 0.01, turns: 2 },
      { name: "model-b", input: 3000, output: 1000, cost: 0.02, turns: 3 },
    ]);

    const lines = formatUsageReport(agg, "Today");
    const lastLine = lines[lines.length - 1];

    expect(lastLine.toLowerCase()).toContain("total");
    expect(lastLine).toContain("5"); // total turns: 2 + 3
    expect(lastLine).toContain("4.0k"); // total input: 4000
  });

  it("shows multiple model rows", () => {
    const agg = makeAggregation([
      { name: "model-a", input: 1000, output: 500, cost: 0.01, turns: 1 },
      { name: "model-b", input: 2000, output: 800, cost: 0.02, turns: 2 },
    ]);

    const lines = formatUsageReport(agg, "Today");
    const output = lines.join("\n");

    expect(output).toContain("model-a");
    expect(output).toContain("model-b");
  });
});
