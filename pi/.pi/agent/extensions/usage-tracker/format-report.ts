/**
 * Format aggregated usage data as a human-readable report.
 */

import { formatTokens } from "@pi-ext/shared";
import type { AggregationResult } from "./aggregate-usage";

/**
 * Format an aggregation result as a string array (one line per row).
 *
 * @param agg - The aggregated usage data
 * @param timeLabel - Label for the time period (e.g. "Today", "This Week")
 * @returns Array of formatted strings suitable for rendering
 */
export function formatUsageReport(agg: AggregationResult, timeLabel: string): string[] {
  const lines: string[] = [];

  lines.push(`Usage — ${timeLabel}`);
  lines.push("");

  if (agg.total.turns === 0) {
    lines.push("No usage data.");
    return lines;
  }

  // Model rows
  for (const [model, stats] of agg.byModel) {
    const parts: string[] = [];
    parts.push(model);
    parts.push(`${stats.turns} turn${stats.turns > 1 ? "s" : ""}`);
    parts.push(`in ${formatTokens(stats.input)}`);
    parts.push(`out ${formatTokens(stats.output)}`);
    parts.push(`$${stats.cost.toFixed(4)}`);
    lines.push(parts.join("  "));
  }

  // Total row
  lines.push("");
  const totalParts: string[] = [];
  totalParts.push("Total");
  totalParts.push(`${agg.total.turns} turn${agg.total.turns > 1 ? "s" : ""}`);
  totalParts.push(`in ${formatTokens(agg.total.input)}`);
  totalParts.push(`out ${formatTokens(agg.total.output)}`);
  totalParts.push(`$${agg.total.cost.toFixed(4)}`);
  lines.push(totalParts.join("  "));

  return lines;
}
