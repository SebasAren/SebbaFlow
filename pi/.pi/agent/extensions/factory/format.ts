/**
 * Human-readable formatting for Factory API payloads (tools + /factory widget).
 */

import type {
  AttentionPayload,
  Decision,
  ResolveAction,
  WorkItem,
  WorkItemsPayload,
} from "./client";

export function shortId(id: string | undefined): string {
  return id ? id.slice(0, 8) : "?";
}

function sessionIds(item: WorkItem): string[] {
  return Object.values(item.sessions ?? {})
    .map((session) => session?.sessionId)
    .filter((id): id is string => typeof id === "string");
}

export function formatWorkItems(payload: WorkItemsPayload): string {
  const running = new Set(payload.runningSessionIds ?? []);
  const parked = new Set(payload.parkedSessionIds ?? []);
  const items = payload.workItems ?? [];
  if (items.length === 0) return "## Factory Work Items\n\nNo work items found.";

  const lines = [`## Factory Work Items (${items.length})`];
  for (const item of items) {
    const stages = item.stages?.length ? item.stages.join("/") : "—";
    const title = item.title || "(untitled)";
    const ids = sessionIds(item);
    const state = ids.some((id) => running.has(id))
      ? "running"
      : ids.some((id) => parked.has(id))
        ? "parked"
        : undefined;
    lines.push(`- **[${stages}]** ${title} — \`${shortId(item.id)}\`${state ? ` · ${state}` : ""}`);
  }
  return lines.join("\n");
}

export function formatAttention(payload: AttentionPayload): string {
  const items = payload.items ?? [];
  if (items.length === 0) return "## Factory Attention\n\nAttention inbox is empty.";

  const lines = [`## Factory Attention (${items.length})`];
  const kinds = Object.entries(payload.kinds ?? {}).filter(([, counts]) => (counts?.open ?? 0) > 0);
  if (kinds.length > 0) {
    lines.push(
      `Open by kind: ${kinds.map(([kind, counts]) => `${kind}: ${counts?.open ?? 0}`).join(", ")}`,
    );
  }
  for (const item of items) {
    const label = item.title || item.key || shortId(item.id);
    lines.push(`- **[${item.kind ?? "?"}]** ${label}${item.unread ? " · unread" : ""}`);
  }
  return lines.join("\n");
}

export function formatDecisions(decisions: Decision[]): string {
  if (decisions.length === 0) return "## Factory Decisions\n\nNo pending decisions.";

  const lines = [`## Factory Decisions (${decisions.length})`];
  for (const decision of decisions) {
    const target = decision.workItemId ? ` on \`${shortId(decision.workItemId)}\`` : "";
    let line = `- **${decision.status ?? "?"}** ${decision.type ?? "decision"}${target} — decision \`${shortId(decision.id)}\``;
    if (decision.role) line += ` · role ${decision.role}`;
    lines.push(line);
    if (decision.lastError) lines.push(`  error: ${decision.lastError}`);
  }
  return lines.join("\n");
}

const ACTION_VERB: Record<ResolveAction, string> = {
  approve: "Approved",
  dismiss: "Dismissed",
  retry: "Retrying",
};

export function formatDecisionResult(decision: Decision, action: ResolveAction): string {
  const status = decision.status ? ` (status: ${decision.status})` : "";
  return `${ACTION_VERB[action]} decision \`${shortId(decision.id)}\`${status}`;
}

export interface FactoryStatusStats {
  items: number;
  running: number;
  parked: number;
  attentionOpen: number;
  attentionUnread: number;
  proposals: number;
}

export function formatStatusWidget(stats: FactoryStatusStats, projectId: string): string[] {
  return [
    `Factory ${shortId(projectId)}`,
    `Items: ${stats.items} · running ${stats.running} · parked ${stats.parked}`,
    `Attention: ${stats.attentionOpen} open · ${stats.attentionUnread} unread`,
    `Proposals waiting: ${stats.proposals}`,
  ];
}
