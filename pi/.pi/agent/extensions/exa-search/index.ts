/**
 * Exa Web Search Extension
 *
 * Provides web search and fetch capabilities using the Exa API.
 * Search type: auto (balanced relevance and speed)
 * Content: highlights (compact, token-efficient)
 */

import Exa from "exa-js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { WebSearchParams, executeWebSearch } from "./web-search";
import { WebFetchParams, executeWebFetch } from "./web-fetch";
import { renderSearchCall, renderSearchResult, renderFetchCall, renderFetchResult } from "./render";

export default function (pi: ExtensionAPI) {
  // Internal-only extension — only registers tools when loaded by the
  // librarian subagent session (which sets PI_LIBRARIAN_LOAD).
  // The main agent skips registration, keeping these tools out of its context.
  if (parseInt(process.env.PI_LIBRARIAN_LOAD || "0", 10) < 1) return;

  // Get API key from environment
  const apiKey = process.env.EXA_API_KEY;

  const exa = apiKey ? new Exa(apiKey) : null;

  // ── web_search tool ──────────────────────────────────────────────────────

  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description:
      "Search the web using Exa. Returns relevant results with titles, URLs, and highlights. " +
      "Great for finding current information, documentation, news, and research.",
    promptSnippet: "Search the web for current information using Exa",
    parameters: WebSearchParams,

    async execute(_toolCallId, params, signal, onUpdate, _ctx) {
      if (!exa) {
        throw new Error("EXA_API_KEY not set. Please set it via: export EXA_API_KEY='your-key'");
      }

      return executeWebSearch(params, exa, signal, onUpdate);
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

  // ── web_fetch tool ──────────────────────────────────────────────────────

  pi.registerTool({
    name: "web_fetch",
    label: "Web Fetch",
    description:
      "Fetch and parse web page content from URLs. Returns clean, LLM-ready content " +
      "(text, highlights, or summary). Use after web_search to read specific pages in detail, " +
      "or to fetch a known documentation URL directly.",
    promptSnippet: "Fetch and parse web page content from URLs",
    parameters: WebFetchParams,

    async execute(_toolCallId, params, signal, onUpdate, _ctx) {
      if (!exa) {
        throw new Error("EXA_API_KEY not set. Please set it via: export EXA_API_KEY='your-key'");
      }

      return executeWebFetch(params, exa, signal, onUpdate);
    },

    renderCall(args, theme, context) {
      return renderFetchCall(args, theme, context);
    },

    renderResult(result, state, theme, _context) {
      return renderFetchResult(
        result as unknown as Parameters<typeof renderFetchResult>[0],
        state,
        theme,
      );
    },
  });
}
