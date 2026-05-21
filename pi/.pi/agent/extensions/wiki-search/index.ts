/**
 * Wiki Search Extension
 *
 * Provides semantic and hybrid search over the personal wiki at ~/Documents/wiki/.
 * Wraps the wiki-search CLI tool (BM25 + vector embeddings + rerank).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { spawnSync } from "node:child_process";

import { renderSearchCall, renderSearchResult } from "./render";

// ── Types ──────────────────────────────────────────────────────────────────

export interface WikiSearchDetails {
  query: string;
  resultCount: number;
  reranked: boolean;
  semantic: boolean;
  wikiDir: string;
  paths: string[];
}

// ── Schema ─────────────────────────────────────────────────────────────────

export const WikiSearchParams = Type.Object({
  query: Type.String({
    description:
      "Search query. Use specific wiki terminology (e.g. 'agent swarm' not 'multi-agent AI').",
  }),
  top: Type.Optional(
    Type.Number({
      description: "Number of results to return (default: 5)",
      minimum: 1,
      maximum: 20,
    }),
  ),
  context: Type.Optional(
    Type.Number({
      description: "Context lines around matches (default: 3)",
      minimum: 0,
      maximum: 10,
    }),
  ),
  semantic: Type.Optional(
    Type.Boolean({
      description:
        "Use vector-only semantic search instead of hybrid BM25+vector. Slower but better for conceptual queries.",
    }),
  ),
  no_rerank: Type.Optional(
    Type.Boolean({
      description: "Skip Cohere reranking. Faster but lower result quality.",
    }),
  ),
});

// ── Execute ────────────────────────────────────────────────────────────────

export async function executeWikiSearch(
  params: {
    query: string;
    top?: number;
    context?: number;
    semantic?: boolean;
    no_rerank?: boolean;
  },
  binaryPath = "wiki-search",
) {
  const { query, top = 5, context = 3, semantic = false, no_rerank = false } = params;

  const args = [query, "--top", String(top), "--context", String(context)];
  if (semantic) args.push("--semantic");
  if (no_rerank) args.push("--no-rerank");

  const result = spawnSync(binaryPath, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024, // 10 MB
    timeout: 30_000,
    env: { ...process.env },
  });

  if (result.error) {
    throw new Error(`wiki-search failed to spawn: ${result.error.message}`);
  }

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";

  if (result.status !== 0) {
    const errMsg = stderr.trim() || stdout.trim() || `exit code ${result.status}`;

    // No results found is a valid outcome, not an error
    if (errMsg.startsWith("No matching pages")) {
      return buildResult("", query, semantic, no_rerank);
    }

    // Auto-rebuild on stale index: rebuild and retry once
    if (errMsg.includes("stale")) {
      const rebuildResult = spawnSync(binaryPath, ["--rebuild"], {
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
        timeout: 60_000,
        env: { ...process.env },
      });

      if (rebuildResult.status === 0) {
        // Retry the original search
        const retry = spawnSync(binaryPath, args, {
          encoding: "utf8",
          maxBuffer: 10 * 1024 * 1024,
          timeout: 30_000,
          env: { ...process.env },
        });

        if (retry.status === 0) {
          const retryStdout = retry.stdout ?? "";
          return buildResult(retryStdout, query, semantic, no_rerank);
        }

        const retryErr =
          retry.stderr?.trim() || retry.stdout?.trim() || `exit code ${retry.status}`;
        throw new Error(`wiki-search failed after rebuild: ${retryErr}`);
      }

      // Rebuild failed (e.g., no API key) — throw informative error
      const rebuildErr =
        rebuildResult.stderr?.trim() ||
        rebuildResult.stdout?.trim() ||
        `exit code ${rebuildResult.status}`;
      throw new Error(`wiki-search: index stale and auto-rebuild failed: ${rebuildErr}`);
    }

    throw new Error(`wiki-search failed: ${errMsg}`);
  }

  return buildResult(stdout, query, semantic, no_rerank);
}

function buildResult(stdout: string, query: string, semantic: boolean, no_rerank: boolean) {
  const wikiDir = `${process.env.HOME}/Documents/wiki/wiki`;

  // Parse relative paths from result headers like "─── entities/humanlayer.md (score: 0.956) ───"
  const paths: string[] = [];
  for (const line of stdout.split("\n")) {
    const m = line.match(/^─── ([^\s(]+)/);
    if (m) {
      paths.push(`${wikiDir}/${m[1]}`);
    }
  }

  const details: WikiSearchDetails = {
    query,
    resultCount: paths.length,
    reranked: !no_rerank,
    semantic: semantic || false,
    wikiDir,
    paths,
  };

  return {
    content: [{ type: "text" as const, text: stdout }],
    details,
  };
}
// ── Extension entry point ──────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "wiki_search",
    label: "Wiki Search",
    description:
      "Search the personal wiki at ~/Documents/wiki/ using hybrid BM25 + vector search with Cohere reranking. " +
      "Returns the most relevant wiki pages with matching context. " +
      "Great for finding concepts, entities, sources, and synthesis pages.",
    promptSnippet: "Search the wiki for relevant pages",
    parameters: WikiSearchParams,

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      return executeWikiSearch(params);
    },

    renderCall(args, theme, context) {
      return renderSearchCall(args, theme, context);
    },

    renderResult(result, state, theme, _context) {
      return renderSearchResult(
        result as unknown as Parameters<typeof renderSearchResult>[0],
        state,
        theme,
      );
    },
  });

  // Quick command: /search-wiki <query>
  pi.registerCommand("search-wiki", {
    description: "Search the personal wiki",
    handler: async (args, ctx) => {
      if (!args) {
        ctx.ui.notify("Usage: /search-wiki <query>", "warning");
        return;
      }
      pi.sendUserMessage(`Search the wiki for: ${args}`, { deliverAs: "followUp" });
    },
  });
}
