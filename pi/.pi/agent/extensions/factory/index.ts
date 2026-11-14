/**
 * Factory Extension
 *
 * Bridge to a self-hosted Mastra Factory (https://factory.mastra.ai/):
 * - factory_items: list work items with running/parked session state
 * - factory_attention: list the attention inbox (mentions, failed runs, proposals)
 * - factory_decisions: list decisions (proposals, failures) awaiting a human
 * - factory_resolve: approve/dismiss/retry a decision
 * - /factory command: compact status widget, no model round-trip
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { checkApiKey } from "@pi-ext/shared";

import { createFactoryClient, type FactoryClient, type ResolveAction } from "./client";
import { resolveFactoryConfig } from "./config";
import {
  formatAttention,
  formatDecisionResult,
  formatDecisions,
  formatStatusWidget,
  formatWorkItems,
} from "./format";
import { renderFactoryToolCall, renderFactoryToolResult } from "./render";

export interface ExtensionDeps {
  client: FactoryClient;
}

const OPTIONAL_PROJECT_ID = Type.Optional(
  Type.String({
    description:
      "Factory project UUID. Omit to auto-detect (FACTORY_PROJECT_ID env, or the only project).",
  }),
);

const ACTION_PARAM = Type.Union(
  [Type.Literal("approve"), Type.Literal("dismiss"), Type.Literal("retry")],
  {
    description: "Resolution action for the decision.",
  },
);

export function createExtension(deps: ExtensionDeps) {
  return function factory(pi: ExtensionAPI) {
    // Soft check — warns at init when no token is configured (auth-disabled
    // factories still work without one).
    checkApiKey("factory", "FACTORY_TOKEN", "factory");

    pi.registerTool({
      name: "factory_items",
      label: "Factory Work Items",
      description:
        "List work items in a Mastra Factory project with their current stage and running/parked session state. " +
        "Use this to see what the Factory agents are working on.",
      promptSnippet: "List Mastra Factory work items",
      parameters: Type.Object({ projectId: OPTIONAL_PROJECT_ID }),

      async execute(_toolCallId, params) {
        const projectId = await deps.client.resolveProjectId(params.projectId);
        const payload = await deps.client.listWorkItems(projectId);
        return {
          content: [{ type: "text" as const, text: formatWorkItems(payload) }],
          details: { projectId },
        };
      },

      renderCall(args, theme, context) {
        return renderFactoryToolCall(args, theme, context, "factory items");
      },
      renderResult: renderFactoryToolResult,
    });

    pi.registerTool({
      name: "factory_attention",
      label: "Factory Attention",
      description:
        "List the Factory attention inbox: mentions, failed automation runs, pending proposals, and agent activity " +
        "that needs a human. Use this to see what needs your input.",
      promptSnippet: "List Mastra Factory attention items",
      parameters: Type.Object({
        projectId: OPTIONAL_PROJECT_ID,
        view: Type.Optional(
          Type.Union([Type.Literal("open"), Type.Literal("unread"), Type.Literal("archived")], {
            description: "Which attention items to show (default: open).",
          }),
        ),
        kind: Type.Optional(
          Type.String({
            description:
              "Filter by attention kind: automation-failed, automation-proposed, mention, activity, agent-waiting.",
          }),
        ),
      }),

      async execute(_toolCallId, params) {
        const projectId = await deps.client.resolveProjectId(params.projectId);
        const payload = await deps.client.listAttention(projectId, {
          view: params.view,
          kind: params.kind,
        });
        return {
          content: [{ type: "text" as const, text: formatAttention(payload) }],
          details: { projectId },
        };
      },

      renderCall(args, theme, context) {
        return renderFactoryToolCall(args, theme, context, "factory attention");
      },
      renderResult: renderFactoryToolResult,
    });

    pi.registerTool({
      name: "factory_decisions",
      label: "Factory Decisions",
      description:
        "List Factory decisions (e.g. proposed plans, failed runs) with their status, role, and last error. " +
        "Defaults to proposed decisions waiting for approval; pass status to see others (pending, failed, succeeded...).",
      promptSnippet: "List Mastra Factory decisions",
      parameters: Type.Object({
        projectId: OPTIONAL_PROJECT_ID,
        status: Type.Optional(
          Type.String({
            description: "Comma-separated decision statuses to filter by (default: proposed).",
          }),
        ),
      }),

      async execute(_toolCallId, params) {
        const projectId = await deps.client.resolveProjectId(params.projectId);
        const payload = await deps.client.listDecisions(projectId, params.status);
        return {
          content: [{ type: "text" as const, text: formatDecisions(payload.decisions) }],
          details: { projectId },
        };
      },

      renderCall(args, theme, context) {
        return renderFactoryToolCall(args, theme, context, "factory decisions");
      },
      renderResult: renderFactoryToolResult,
    });

    pi.registerTool({
      name: "factory_resolve",
      label: "Factory Resolve Decision",
      description:
        "Resolve a Factory decision: approve or dismiss a proposed plan, or retry a failed run. " +
        "Use decision ids from factory_decisions or factory_attention.",
      promptSnippet: "Approve, dismiss, or retry a Mastra Factory decision",
      parameters: Type.Object({
        decisionId: Type.String({ description: "Decision UUID to resolve." }),
        action: ACTION_PARAM,
        projectId: OPTIONAL_PROJECT_ID,
      }),

      async execute(_toolCallId, params) {
        const projectId = await deps.client.resolveProjectId(params.projectId);
        const action: ResolveAction = params.action;
        const payload = await deps.client.resolveDecision(projectId, params.decisionId, action);
        return {
          content: [
            { type: "text" as const, text: formatDecisionResult(payload.decision, action) },
          ],
          details: { projectId },
        };
      },

      renderCall(args, theme, context) {
        return renderFactoryToolCall(args, theme, context, "factory resolve");
      },
      renderResult: renderFactoryToolResult,
    });

    pi.registerCommand("factory", {
      description: "Show Factory work items, attention, and pending proposals",
      handler: async (_args, ctx) => {
        try {
          const projectId = await deps.client.resolveProjectId();
          const [items, attention, decisions] = await Promise.all([
            deps.client.listWorkItems(projectId),
            deps.client.listAttention(projectId, { view: "open" }),
            deps.client.listDecisions(projectId, "proposed"),
          ]);
          const runningItems = items.workItems.filter((item) =>
            Object.values(item.sessions ?? {}).some((session) =>
              items.runningSessionIds?.includes(session?.sessionId ?? ""),
            ),
          ).length;
          const parkedItems = items.workItems.filter((item) =>
            Object.values(item.sessions ?? {}).some((session) =>
              items.parkedSessionIds?.includes(session?.sessionId ?? ""),
            ),
          ).length;
          const attentionOpen = Object.values(attention.kinds ?? {}).reduce(
            (sum, counts) => sum + (counts?.open ?? 0),
            0,
          );
          const attentionUnread = Object.values(attention.kinds ?? {}).reduce(
            (sum, counts) => sum + (counts?.unread ?? 0),
            0,
          );
          const lines = formatStatusWidget(
            {
              items: items.workItems.length,
              running: runningItems,
              parked: parkedItems,
              attentionOpen,
              attentionUnread,
              proposals: decisions.decisions.length,
            },
            projectId,
          );
          ctx.ui.setWidget("factory-status", lines);
        } catch (err) {
          ctx.ui.notify(err instanceof Error ? err.message : String(err), "error");
        }
      },
    });
  };
}

export default createExtension({ client: createFactoryClient(resolveFactoryConfig()) });
