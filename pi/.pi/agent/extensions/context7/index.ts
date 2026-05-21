/**
 * Context7 API Extension
 *
 * Provides library documentation lookup using Context7 API.
 * Tools:
 * - context7_search: Search for libraries by name and query
 * - context7_docs: Get documentation for a specific library ID
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Context7 } from "@upstash/context7-sdk";

import { SearchParams, executeSearch } from "./search";
import { DocsParams, executeDocs } from "./docs";
import { renderSearchCall, renderSearchResult, renderDocsCall, renderDocsResult } from "./render";

// Lazy-initialized SDK client — created only when API key is available
let _client: Context7 | null = null;

function getClient(): Context7 {
  if (!_client) {
    _client = new Context7();
  }
  return _client;
}

export default function (pi: ExtensionAPI) {
  // Get API key from environment (captured at init for warning)
  const apiKey = process.env.CONTEXT7_API_KEY;
  if (!apiKey) {
    console.warn(
      "[context7] CONTEXT7_API_KEY not set. Context7 tools will not work. Get your API key at context7.com/dashboard",
    );
  }

  // Tool 1: Search libraries
  pi.registerTool({
    name: "context7_search",
    label: "Context7 Library Search",
    description:
      "Search for libraries in the Context7 database. Returns matching libraries with IDs, descriptions, and trust scores. " +
      "Use this to find the correct library ID before fetching documentation.",
    promptSnippet: "Search Context7 for library documentation",
    parameters: SearchParams,

    async execute(_toolCallId, params, signal, onUpdate, _ctx) {
      return executeSearch(params, apiKey, getClient(), signal, onUpdate);
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

  // Tool 2: Get documentation
  pi.registerTool({
    name: "context7_docs",
    label: "Context7 Documentation",
    description:
      "Fetch up-to-date documentation and code examples for a specific library using its Context7 library ID. " +
      "Returns relevant snippets ranked by the query. You must first use context7_search to obtain a valid library ID.",
    promptSnippet: "Fetch library documentation from Context7",
    parameters: DocsParams,

    async execute(_toolCallId, params, signal, onUpdate, _ctx) {
      return executeDocs(params, apiKey, getClient(), signal, onUpdate);
    },

    renderCall(args, theme, context) {
      return renderDocsCall(args, theme, context);
    },

    renderResult(result, state, theme, _context) {
      return renderDocsResult(
        result as unknown as Parameters<typeof renderDocsResult>[0],
        state,
        theme,
      );
    },
  });

  // Register a quick command for documentation lookup
  pi.registerCommand("context7", {
    description: "Quick Context7 documentation lookup (library query)",
    handler: async (args, ctx) => {
      if (!args) {
        ctx.ui.notify("Usage: /context7 <library> <query>", "warning");
        return;
      }
      const parts = args.split(/\s+/);
      if (parts.length < 2) {
        ctx.ui.notify("Usage: /context7 <library> <query>", "warning");
        return;
      }
      const library = parts[0];
      const query = parts.slice(1).join(" ");
      pi.sendUserMessage(`Search Context7 for library "${library}" and get docs about: ${query}`, {
        deliverAs: "followUp",
      });
    },
  });
}
