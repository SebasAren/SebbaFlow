/**
 * Aggregate usage entries by model with totals.
 */

import type { UsageEntry } from "./parse-usage";

/** Aggregated stats for a single model or a grand total. */
export interface AggregatedStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  turns: number;
}

/** Result of aggregating usage entries. */
export interface AggregationResult {
  /** Per-model aggregated stats. */
  byModel: Map<string, AggregatedStats>;
  /** Grand total across all models. */
  total: AggregatedStats;
}

const emptyStats = (): AggregatedStats => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  cost: 0,
  turns: 0,
});

/**
 * Aggregate usage entries into per-model stats and a grand total.
 *
 * @param entries - Array of UsageEntry records
 * @returns AggregationResult with byModel map and total
 */
export function aggregateEntries(entries: UsageEntry[]): AggregationResult {
  const byModel = new Map<string, AggregatedStats>();
  const total = emptyStats();

  for (const entry of entries) {
    total.input += entry.input;
    total.output += entry.output;
    total.cacheRead += entry.cacheRead;
    total.cacheWrite += entry.cacheWrite;
    total.cost += entry.cost;
    total.turns += 1;

    let modelStats = byModel.get(entry.model);
    if (!modelStats) {
      modelStats = emptyStats();
      byModel.set(entry.model, modelStats);
    }

    modelStats.input += entry.input;
    modelStats.output += entry.output;
    modelStats.cacheRead += entry.cacheRead;
    modelStats.cacheWrite += entry.cacheWrite;
    modelStats.cost += entry.cost;
    modelStats.turns += 1;
  }

  return { byModel, total };
}
