/**
 * Observation store schema.
 *
 * An observation group condenses a range of raw session messages into
 * structured items (issue #143, spec in docs/design.md). Groups are
 * persisted as one JSON object per line and validated on read: anything
 * malformed is skipped silently rather than crashing the host.
 */

export type GroupKind = "observation" | "reflection";

/**
 * Severity codes rendered with markers: user → 🔴, observation → 🟡,
 * action → 🟢, done → ✅ (same coding as the Observer's output format).
 */
export type Severity = "user" | "observation" | "action" | "done";

export type ItemType = "user-statement" | "decision" | "file-touch" | "error" | "open-thread";

export const SEVERITY_MARKERS: Record<Severity, string> = {
  user: "🔴",
  observation: "🟡",
  action: "🟢",
  done: "✅",
};

export interface ObservationItem {
  /** Calendar date the item was observed, "YYYY-MM-DD". */
  date: string;
  type: ItemType;
  severity: Severity;
  text: string;
}

/** Range of raw session entries the group was derived from (entry ids). */
export interface SourceRange {
  startId: string;
  endId: string;
}

export interface ObservationGroup {
  id: string;
  /** pi session id the group was observed in. */
  threadId: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  sourceRange: SourceRange;
  kind: GroupKind;
  items: ObservationItem[];
  /** Source observation groups; present on reflection groups. */
  sourceGroupIds?: string[];
}

export interface ThreadRecord {
  /** pi session id. */
  threadId: string;
  /** ISO 8601 watermark: everything before this was already observed. */
  lastObservedAt: string;
}

const GROUP_KINDS: readonly GroupKind[] = ["observation", "reflection"];
const SEVERITIES: readonly Severity[] = ["user", "observation", "action", "done"];
const ITEM_TYPES: readonly ItemType[] = [
  "user-statement",
  "decision",
  "file-touch",
  "error",
  "open-thread",
];

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function parseItems(value: unknown): ObservationItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: ObservationItem[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) return undefined;
    const item = entry as Record<string, unknown>;
    if (
      !isString(item.date) ||
      !isString(item.text) ||
      !isString(item.type) ||
      !ITEM_TYPES.includes(item.type as ItemType) ||
      !isString(item.severity) ||
      !SEVERITIES.includes(item.severity as Severity)
    ) {
      return undefined;
    }
    items.push({
      date: item.date,
      type: item.type as ItemType,
      severity: item.severity as Severity,
      text: item.text,
    });
  }
  return items;
}

function parseSourceRange(value: unknown): SourceRange | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const range = value as Record<string, unknown>;
  if (!isString(range.startId) || !isString(range.endId)) return undefined;
  return { startId: range.startId, endId: range.endId };
}

/**
 * Parse one JSONL line into an ObservationGroup, or undefined if the
 * line is not valid JSON or fails validation.
 */
export function parseGroup(line: string): ObservationGroup | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (typeof raw !== "object" || raw === null) return undefined;
  const group = raw as Record<string, unknown>;
  if (
    !isString(group.id) ||
    !isString(group.threadId) ||
    !isString(group.createdAt) ||
    !isString(group.kind) ||
    !GROUP_KINDS.includes(group.kind as GroupKind)
  ) {
    return undefined;
  }
  const sourceRange = parseSourceRange(group.sourceRange);
  if (!sourceRange) return undefined;
  const items = parseItems(group.items);
  if (!items) return undefined;
  const parsed: ObservationGroup = {
    id: group.id,
    threadId: group.threadId,
    createdAt: group.createdAt,
    sourceRange,
    kind: group.kind as GroupKind,
    items,
  };
  if (group.sourceGroupIds !== undefined) {
    if (!Array.isArray(group.sourceGroupIds) || !group.sourceGroupIds.every(isString)) {
      return undefined;
    }
    parsed.sourceGroupIds = group.sourceGroupIds;
  }
  return parsed;
}

/**
 * Parse one JSONL line into a ThreadRecord, or undefined if the line is
 * not valid JSON or fails validation.
 */
export function parseThreadRecord(line: string): ThreadRecord | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (typeof raw !== "object" || raw === null) return undefined;
  const record = raw as Record<string, unknown>;
  if (!isString(record.threadId) || !isString(record.lastObservedAt)) {
    return undefined;
  }
  return { threadId: record.threadId, lastObservedAt: record.lastObservedAt };
}
