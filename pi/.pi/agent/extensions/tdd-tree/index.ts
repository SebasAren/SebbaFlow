/**
 * TDD Tree Integration
 *
 * Bridges TDD plan execution with pi's session tree feature.
 * Provides tools to label a "kickoff" point (the exploration state)
 * and navigate back to it for each new TDD step.
 *
 * Tools:
 *   tdd-set-kickoff  — Label the current session leaf as the kickoff point
 *   tdd-go-kickoff   — Navigate to the labeled kickoff point (command)
 */

import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { BorderedLoader } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { reuseOrCreateText } from "@pi-ext/shared";

// ── Helpers ────────────────────────────────────────────────────────────────

function kickoffLabel(slug: string): string {
  return `tdd-kickoff-${slug}`;
}

/** Find the entry ID that has a given label. */
function findLabeledEntry(ctx: ExtensionContext, label: string): string | undefined {
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "custom" || entry.type === "message" || entry.type === "branch_summary") {
      const entryLabel = ctx.sessionManager.getLabel(entry.id);
      if (entryLabel === label) return entry.id;
    }
  }
  return undefined;
}

// ── Extension ──────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // Track kickoff entries: slug → entryId (reconstructed on session_start)
  const kickoffEntries = new Map<string, string>();
  let activeSlug: string | undefined;

  // Reconstruct state from session entries
  pi.on("session_start", async (_event, ctx) => {
    kickoffEntries.clear();
    activeSlug = undefined;
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === "tdd-kickoff") {
        const data = entry.data as
          { slug?: string; entryId?: string; labeledAt?: string } | undefined;
        if (data?.slug && data?.entryId) {
          kickoffEntries.set(data.slug, data.entryId);
          activeSlug = data.slug; // last (most recent) wins
        }
      }
    }
  });

  // ── Tool: tdd-set-kickoff ──────────────────────────────────────────────

  pi.registerTool({
    name: "tdd-set-kickoff",
    label: "Set TDD Kickoff",
    description:
      "Label the current session position as the TDD kickoff point for a plan. " +
      "Call this after the initial codebase exploration completes. " +
      "Each subsequent TDD step can then branch from this point.",
    promptSnippet: "Label the current session position as the TDD kickoff checkpoint",
    parameters: Type.Object({
      slug: Type.String({
        description: "The plan slug (e.g. 'user-auth'). Must match the tdd-plan slug.",
      }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const leafId = ctx.sessionManager.getLeafId();
      if (!leafId) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No session content yet. Run exploration first before setting kickoff.",
            },
          ],
          details: { success: false },
        };
      }

      const label = kickoffLabel(params.slug);

      // Prevent multiple kickoff points for the same slug
      if (kickoffEntries.has(params.slug)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `A kickoff point already exists for "${params.slug}". Use /kickoff (or /tdd-go-kickoff ${params.slug}) to navigate to it instead of creating a new one.`,
            },
          ],
          details: { success: false, error: "kickoff_already_exists" },
        };
      }

      // Set the label on the current leaf
      pi.setLabel(leafId, label);

      // Store a custom entry for persistence across sessions
      pi.appendEntry("tdd-kickoff", {
        slug: params.slug,
        entryId: leafId,
        labeledAt: new Date().toISOString(),
      });

      // Track in memory
      kickoffEntries.set(params.slug, leafId);
      activeSlug = params.slug;

      return {
        content: [
          {
            type: "text" as const,
            text:
              `TDD kickoff point set for plan "${params.slug}".\n` +
              `Entry: ${leafId}\n` +
              `Label: ${label}\n\n` +
              `Use /kickoff (or /tdd-go-kickoff ${params.slug}) to branch fresh for each step.`,
          },
        ],
        details: { slug: params.slug, entryId: leafId, label },
      };
    },

    renderCall(args, theme, context): Component {
      const preview = `Setting TDD kickoff for "${args.slug}"...`;
      const text = reuseOrCreateText(context);
      text.setText(theme.fg("muted", `🏷️  ${preview}`));
      return text;
    },

    renderResult(result, _state, theme, context): Component {
      const details = result.details as { success?: boolean; slug?: string } | undefined;
      const text = reuseOrCreateText(context);
      if (details?.success === false) {
        text.setText(theme.fg("error", "❌ Failed to set kickoff point"));
      } else {
        text.setText(theme.fg("accent", `✅ Kickoff set for "${details?.slug ?? "plan"}"`));
      }
      return text;
    },
  });

  // ── Shared navigation logic ────────────────────────────────────────────────

  async function navigateToKickoff(slug: string, ctx: ExtensionCommandContext): Promise<void> {
    const label = kickoffLabel(slug);

    // Try to find from tracked entries first, then scan
    let targetId = kickoffEntries.get(slug);
    if (targetId) {
      // Verify cached entry hasn't been pruned from the session tree
      const exists = ctx.sessionManager.getEntries().some((e) => e.id === targetId);
      if (!exists) {
        kickoffEntries.delete(slug);
        targetId = undefined;
      }
    }
    if (!targetId) {
      targetId = findLabeledEntry(ctx, label);
    }

    if (!targetId) {
      ctx.ui.notify(
        `No kickoff point found for "${slug}". Run exploration and use tdd-set-kickoff first.`,
        "error",
      );
      return;
    }

    // Check if we're already at the kickoff point
    const currentLeaf = ctx.sessionManager.getLeafId();
    if (currentLeaf === targetId) {
      ctx.ui.notify("Already at the kickoff point.", "info");
      return;
    }

    // Branch summarization needs a model. Without one, navigate without a summary
    // rather than blocking the TDD workflow (navigateTree throws if summarize && !model).
    const summarize = ctx.model !== undefined;
    if (!summarize) {
      ctx.ui.notify(
        "No model selected — navigating without a step summary. Use /model to enable summaries.",
        "warning",
      );
    }

    type NavResult = { cancelled: boolean } | { error: string } | null;

    // Navigate, showing a spinner while the LLM summarizes. Surface the real
    // error from navigateTree instead of masking it as "cancelled".
    const result = await ctx.ui.custom<NavResult>((tui, theme, _kb, done) => {
      const loader = new BorderedLoader(tui, theme, `Navigating to kickoff "${slug}"...`);
      let settled = false;
      const finish = (value: NavResult): void => {
        if (settled) return; // guard race between Escape-abort and completion
        settled = true;
        done(value);
      };
      // Canonical BorderedLoader pattern: let Escape dismiss the loader.
      loader.onAbort = () => finish({ cancelled: true });

      ctx
        .navigateTree(targetId, {
          summarize,
          customInstructions: summarize
            ? "Summarize the TDD step work that was done after the kickoff exploration. " +
              "Focus on: what tests were written, what implementation was added, what was refactored. " +
              "Keep it concise — this is a handoff to the next step."
            : undefined,
          label: `tdd-step-done-${slug}`,
        })
        .then((r) => finish(r))
        .catch((err) => finish({ error: err instanceof Error ? err.message : String(err) }));

      return loader;
    });

    if (result && "error" in result) {
      ctx.ui.notify(`Kickoff navigation failed: ${result.error}`, "error");
    } else if (result && result.cancelled) {
      ctx.ui.notify("Navigation cancelled.", "info");
    } else if (result) {
      ctx.ui.notify(`Navigated to TDD kickoff for "${slug}". Starting fresh branch.`, "info");
      // Queue the continuation as a follow-up: navigateTree may leave the agent
      // mid-processing (branch summary / navigation), and sendUserMessage throws
      // "Agent is already processing" unless deliverAs is set.
      pi.sendUserMessage(`Continue implementing the "${slug}" plan.`, { deliverAs: "followUp" });
    } else {
      // Defensive: should not happen with the wiring above.
      ctx.ui.notify("Kickoff navigation did not complete.", "warning");
    }
  }

  // ── Command: tdd-go-kickoff ──────────────────────────────────────────────

  pi.registerCommand("tdd-go-kickoff", {
    description: "Navigate to the TDD kickoff point for a plan (branches from exploration state)",
    handler: async (args, ctx) => {
      const slug = args.trim();
      if (!slug) {
        ctx.ui.notify("Usage: /tdd-go-kickoff <slug>", "info");
        return;
      }
      await navigateToKickoff(slug, ctx);
    },
  });

  // ── Command: kickoff (shortcut with active-slug fallback) ────────────────

  pi.registerCommand("kickoff", {
    description:
      "Navigate to the active TDD kickoff point. Defaults to the most recently set plan.",
    handler: async (args, ctx) => {
      let slug = args.trim();
      if (!slug) {
        if (activeSlug) {
          slug = activeSlug;
        } else {
          if (kickoffEntries.size === 0) {
            ctx.ui.notify(
              "No kickoff points found. Run exploration and use tdd-set-kickoff first.",
              "error",
            );
          } else {
            const plans = Array.from(kickoffEntries.keys()).join(", ");
            ctx.ui.notify(
              `Multiple plans active: ${plans}. Use /kickoff <slug> or /tdd-go-kickoff <slug>.`,
              "error",
            );
          }
          return;
        }
      }
      await navigateToKickoff(slug, ctx);
    },
  });
}
