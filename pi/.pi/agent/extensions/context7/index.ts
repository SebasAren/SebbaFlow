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
  // Internal-only extension — only registers tools when loaded by the
  // librarian subagent session (which sets PI_LIBRARIAN_LOAD).
  // The main agent skips registration, keeping these tools out of its context.
  if (parseInt(process.env.PI_LIBRARIAN_LOAD || "0", 10) < 1) return;

  // Get API key from environment (captured at init for warning — but guard above
  // skips this entirely for main agent, warning only fires in subagent context)
  const apiKey = process.env.CONTEXT7_API_KEY;

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
}
