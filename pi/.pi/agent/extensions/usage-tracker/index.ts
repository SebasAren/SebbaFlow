/**
 * Usage tracker extension for Pi.
 *
 * Records token usage from every turn to ~/.config/pi/usage.jsonl
 * and shows aggregated stats via the /usage command.
 */

import { join } from "node:path";
import { homedir } from "node:os";
import type { ExtensionAPI, TurnEndEvent } from "@earendil-works/pi-coding-agent";
import { parseUsageEntry } from "./parse-usage";
import { appendUsageEntry } from "./append-usage";
import { readUsageEntries } from "./read-usage";
import { aggregateEntries } from "./aggregate-usage";
import { formatUsageReport } from "./format-report";

/** Default path for the usage JSONL file. */
const DEFAULT_USAGE_PATH = join(homedir(), ".config", "pi", "usage.jsonl");

interface ExtensionDeps {
  parseUsageEntry: typeof parseUsageEntry;
  appendUsageEntry: typeof appendUsageEntry;
  readUsageEntries: typeof readUsageEntries;
  aggregateEntries: typeof aggregateEntries;
  formatUsageReport: typeof formatUsageReport;
  usagePath: string;
}

/**
 * Create the usage tracker extension with injectable dependencies.
 */
export function createExtension(deps: ExtensionDeps) {
  return function usageTracker(pi: ExtensionAPI): void {
    // Register /usage command
    pi.registerCommand("usage", {
      description: "Show token usage statistics",
      handler: async (_args, ctx) => {
        const entries = deps.readUsageEntries(deps.usagePath);
        const agg = deps.aggregateEntries(entries);
        const lines = deps.formatUsageReport(agg, "All Time");

        // Display via widget (shows in status area)
        ctx.ui.setWidget("usage-report", lines);
      },
    });

    // Capture usage on every turn
    pi.on("turn_end", (event: TurnEndEvent) => {
      const msg = event.message;
      if (msg.role === "assistant") {
        // AgentMessage doesn't expose usage/model — cast to access runtime fields
        const entry = deps.parseUsageEntry(msg as any, process.cwd());
        deps.appendUsageEntry(entry, deps.usagePath);
      }
    });
  };
}

/**
 * Default export with real dependencies wired in.
 */
export default function usageTracker(pi: ExtensionAPI): void {
  createExtension({
    parseUsageEntry,
    appendUsageEntry,
    readUsageEntries,
    aggregateEntries,
    formatUsageReport,
    usagePath: DEFAULT_USAGE_PATH,
  })(pi);
}
