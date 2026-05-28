/**
 * Parse a turn_end message into a UsageEntry for JSONL storage.
 */

/** Local interface for the assistant message payload in a turn_end event. */
export interface TurnEndMessage {
  role: string;
  model?: string;
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    cost?: { total?: number };
  };
}

/** A single usage record to be written to JSONL. */
export interface UsageEntry {
  ts: number;
  project: string;
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

/**
 * Extract usage fields from a turn_end message.
 *
 * @param message - The assistant message from a turn_end event
 * @param cwd - The project working directory (used as project label)
 * @returns A UsageEntry with extracted fields (missing values default to 0)
 */
export function parseUsageEntry(message: TurnEndMessage, cwd: string): UsageEntry {
  const usage = message.usage;

  return {
    ts: Date.now(),
    project: cwd,
    model: message.model ?? "unknown",
    input: usage?.input ?? 0,
    output: usage?.output ?? 0,
    cacheRead: usage?.cacheRead ?? 0,
    cacheWrite: usage?.cacheWrite ?? 0,
    cost: usage?.cost?.total ?? 0,
  };
}
