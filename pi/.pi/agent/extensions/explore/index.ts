/**
 * Explore Subagent — delegate codebase exploration to a separate model
 *
 * Creates an in-process AgentSession with read-only tools to investigate
 * the codebase. The model is configurable via CHEAP_MODEL env var.
 */

import * as path from "node:path";
import {
  type AgentSession,
  type ExtensionAPI,
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { CreateAgentSessionOptions } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { resolveRealCwd, runSubagent, getModel, startExploreTrace } from "@pi-ext/shared";

import { EXPLORE_SYSTEM_PROMPT } from "./constants";
import { renderCall, renderResult } from "./render";
import { preSearch, invalidateFilePath, type PreSearchStats } from "./pre-search";

/** Shared auth/model infrastructure (created once, reused across subagent runs). */
let authStorage: AuthStorage | undefined;
let modelRegistry: ModelRegistry | undefined;
let settingsManager: SettingsManager | undefined;

function getSharedInfrastructure() {
  if (!authStorage) authStorage = AuthStorage.create();
  if (!modelRegistry) modelRegistry = ModelRegistry.create(authStorage);
  if (!settingsManager)
    settingsManager = SettingsManager.inMemory({ compaction: { enabled: false } });
  return { authStorage, modelRegistry, settingsManager };
}

/** Resolve a model name (e.g. "provider/model-id") to a Model object, or undefined. */
function resolveModel(modelName?: string): any {
  const name = modelName || getModel();
  if (!name) return undefined;

  const { modelRegistry } = getSharedInfrastructure();

  // Try "provider/model-id" format
  if (name.includes("/")) {
    const slashIdx = name.indexOf("/");
    const provider = name.slice(0, slashIdx);
    const modelId = name.slice(slashIdx + 1);
    return modelRegistry.find(provider, modelId);
  }

  // Try matching against all available models by id
  const all = modelRegistry.getAll();
  return all.find((m) => m.id === name);
}

/** Create an AgentSession for the explore subagent with read-only tools. */
async function createExploreSession(
  systemPrompt: string,
  cwd: string,
  modelName?: string,
): Promise<AgentSession> {
  const { authStorage, modelRegistry, settingsManager } = getSharedInfrastructure();

  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    systemPromptOverride: () => systemPrompt,
    // Skip extensions, skills, prompts — not needed for explore.
    // Load usage-tracker so subagent turns are counted in the usage dashboard.
    additionalExtensionPaths: [path.join(getAgentDir(), "extensions", "usage-tracker")],
    noExtensions: true,
  });
  await loader.reload();

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const model = resolveModel(modelName);

  // pi-coding-agent 0.68: `tools` is an allowlist of built-in tool names (string[]),
  // not an array of Tool objects. Only these built-ins are active and selectable.
  const opts: CreateAgentSessionOptions = {
    cwd,
    tools: ["read", "grep", "find", "ls", "bash"],
    authStorage,
    modelRegistry,
    sessionManager: SessionManager.inMemory(),
    settingsManager,
    resourceLoader: loader,
  };

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  if (model) opts.model = model;

  const { session } = await createAgentSession(opts);
  return session;
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface ExploreDetails {
  model?: string;
  usedModel?: string;
  query?: string;
  success?: boolean;
  usage?: { input: number; output: number; turns: number; cost: number; contextTokens: number };
  preSearchStats?: PreSearchStats;
  /** @internal Allows renderSubagentResult to accept this type */
  [key: string]: unknown;
}

// ── Tool parameters ────────────────────────────────────────────────────────

const ExploreParams = Type.Object({
  query: Type.String({
    description: "What to explore in the codebase. Be specific about what you're looking for.",
  }),
  directory: Type.Optional(
    Type.String({ description: "Directory to explore (defaults to current working directory)" }),
  ),
  thoroughness: Type.Optional(
    Type.String({
      description: "How thorough to be: quick (40 calls), medium (80, default), thorough (160)",
    }),
  ),
  maxToolCalls: Type.Optional(
    Type.Number({ description: "Override the tool call limit (default: based on thoroughness)" }),
  ),
  timeoutMs: Type.Optional(
    Type.Number({
      description: "Override timeout in ms (default: 300000 for medium, 600000 for thorough)",
    }),
  ),
  files: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Known file paths to focus on (for deepening after a scout pass). The subagent will prioritize these files.",
    }),
  ),
});

// ── Extension ──────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "explore",
    label: "Explore",
    description: [
      "Delegate codebase exploration to a subagent running on a separate (cheaper/faster) model.",
      "Useful for reconnaissance: finding files, tracing dependencies, understanding architecture.",
      "The explore agent is read-only — it cannot modify files.",
      "Configure the model via CHEAP_MODEL env var (e.g. 'xiaomi-mimo/mimo-v2-flash').",
      "You may call explore up to 4 times in parallel to investigate different aspects of the codebase simultaneously.",
      "For large codebases, use a scout-then-deepen pattern: first explore with quick thoroughness to find relevant files, then call explore again with 'files' set to the discovered paths and thoroughness=thorough.",
    ].join(" "),
    promptSnippet:
      "Explore the codebase to find files, trace dependencies, or understand architecture",
    parameters: ExploreParams,

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const realCwd = resolveRealCwd(ctx.cwd);
      const cwd = params.directory ? path.resolve(realCwd, params.directory) : realCwd;

      // Resolve thoroughness → budget
      const thoroughness = params.thoroughness || "medium";
      const defaultMaxCalls =
        thoroughness === "quick" ? 40 : thoroughness === "thorough" ? 160 : 80;
      const maxToolCalls = params.maxToolCalls ?? defaultMaxCalls;
      const defaultTimeout = thoroughness === "thorough" ? 600_000 : 300_000;
      const timeoutMs = params.timeoutMs ?? defaultTimeout;

      // Initialize tracing
      const modelName = getModel() || "unknown";
      const sessionId = ctx.sessionManager?.getSessionId?.();
      const { observation, child } = startExploreTrace(params.query, cwd, modelName, sessionId);

      try {
        // Pre-search: run intelligent pre-search before spawning the subagent
        const preSpan = child("pre-search", { input: { query: params.query } });
        const preSearchResult = await preSearch(cwd, params.query);
        preSpan.update({
          output: {
            stats: preSearchResult.stats,
            text: preSearchResult.text,
          },
        });
        preSpan.end();

        // Build query with constraints and optional focus files
        let query = params.query + preSearchResult.text;
        query += `\n\n[Constraints: thoroughness=${thoroughness}, max ${maxToolCalls} tool calls]`;
        if (params.directory) {
          query += `\n[Scope: only look in ${params.directory}]`;
        }
        if (params.files && params.files.length > 0) {
          query += `\n[Focus files: start by reading these known-relevant files, then explore outward if needed]`;
          query += `\n${params.files.map((f) => `- ${f}`).join("\n")}`;
        }

        const result = await runSubagent({
          cwd,
          query,
          systemPrompt: EXPLORE_SYSTEM_PROMPT,
          createSession: createExploreSession,
          timeoutMs,
          signal,
          onUpdate: onUpdate
            ? (update) => {
                onUpdate({
                  content: [{ type: "text", text: update.text }],
                  details: { model: getModel(), query, recentCalls: update.recentCalls },
                });
              }
            : undefined,
          onToolCall: (info) => {
            const toolSpan = child(info.toolName, {
              input: { argsSummary: info.argsSummary },
              metadata: { success: info.success, durationMs: info.durationMs },
            });
            toolSpan.end();
          },
          loopDetection: true,
          maxToolCalls,
        });

        const isError = result.exitCode !== 0 || !!result.errorMessage;

        observation.update({
          output: {
            usage: {
              input: result.usage.input,
              output: result.usage.output,
              turns: result.usage.turns,
              cost: result.usage.cost,
              contextTokens: result.usage.contextTokens,
            },
            success: !isError,
          },
        });

        if (isError) {
          const errorMsg = result.errorMessage || result.stderr || result.output || "(no output)";
          return {
            content: [{ type: "text" as const, text: `Explore failed: ${errorMsg}` }],
            details: {
              model: getModel(),
              query,
              usage: result.usage,
              success: false,
              preSearchStats: preSearchResult.stats,
            },
          };
        }

        return {
          content: [{ type: "text" as const, text: result.output || "(no output)" }],
          details: {
            model: getModel(),
            usedModel: result.model,
            query,
            usage: result.usage,
            success: true,
            preSearchStats: preSearchResult.stats,
          },
        };
      } finally {
        observation.end();
      }
    },

    renderCall(args, theme, context) {
      return renderCall(args, theme, context, getModel());
    },

    renderResult(result, state, theme, context) {
      return renderResult(
        result as unknown as Parameters<typeof renderResult>[0],
        state,
        theme,
        context,
      );
    },
  });

  // Real-time invalidation: when Pi edits a file, drop it from the index
  // so the next explore call sees fresh data.
  const piOn = (
    pi as ExtensionAPI & { on?: (event: string, listener: (...args: any[]) => void) => void }
  ).on;
  if (piOn) {
    piOn("tool_call", async (event: unknown, toolCtx: unknown) => {
      const e = event as { toolName?: string; input?: { path?: string } };
      const tc = toolCtx as { cwd?: string } | undefined;
      if (e.toolName === "edit" || e.toolName === "write") {
        const filePath = e.input?.path;
        if (typeof filePath === "string") {
          invalidateFilePath(filePath, tc?.cwd || "");
        }
      }
    });
  }

  // Register /explore command for interactive use
  pi.registerCommand("explore", {
    description: "Run explore subagent interactively",
    handler: async (args, ctx) => {
      if (!args.trim()) {
        ctx.ui.notify("Usage: /explore <query>", "info");
        return;
      }
      // Send as a prompt that triggers the explore tool
      pi.sendUserMessage(`Use the explore tool to investigate: ${args}`, {
        deliverAs: ctx.isIdle() ? undefined : "followUp",
      });
    },
  });
}
