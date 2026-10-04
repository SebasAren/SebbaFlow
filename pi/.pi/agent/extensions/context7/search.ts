/**
 * Context7 search tool — schema, execute logic, and types.
 */

import { Type } from "typebox";
import { Context7, Context7Error, type Library } from "@upstash/context7-sdk";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SearchDetails {
  query: string;
  libraryName: string;
  resultCount: number;
}

// ── Schema ─────────────────────────────────────────────────────────────────

export const SearchParams = Type.Object({
  libraryName: Type.String({
    description: "Library name to search for (e.g., 'react', 'next.js')",
  }),
  query: Type.String({ description: "Your question or task (used for relevance ranking)" }),
});

// ── Execute ────────────────────────────────────────────────────────────────

export async function executeSearch(
  params: { libraryName: string; query: string },
  apiKey: string | undefined,
  client: Context7,
  signal?: AbortSignal,
  onUpdate?: (update: {
    content: Array<{ type: "text"; text: string }>;
    details: SearchDetails;
  }) => void,
) {
  if (!apiKey) {
    throw new Error(
      "CONTEXT7_API_KEY not set. Get your API key at context7.com/dashboard and set it via export CONTEXT7_API_KEY='your-key' or an auth.json \"context7\" entry",
    );
  }

  const { libraryName, query } = params;

  // Show initial progress
  onUpdate?.({
    content: [{ type: "text" as const, text: `Searching Context7 for "${libraryName}"...` }],
    details: { query, libraryName, resultCount: 0 },
  });

  try {
    const libraries: Library[] = await client.searchLibrary(query, libraryName);

    // Check for cancellation
    if (signal?.aborted) {
      return {
        content: [{ type: "text" as const, text: "Search cancelled" }],
        details: { query, libraryName, resultCount: 0 },
      };
    }

    if (!libraries.length) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No libraries found matching "${libraryName}". Try a different search term.`,
          },
        ],
        details: { query, libraryName, resultCount: 0 },
      };
    }

    // Format results
    let output = `## Context7 Library Search Results for "${libraryName}"\n\n`;

    for (let i = 0; i < libraries.length; i++) {
      const lib = libraries[i];
      output += `### ${i + 1}. ${lib.name}\n`;
      output += `- **ID**: \`${lib.id}\`\n`;
      output += `- **Description**: ${lib.description}\n`;
      output += `- **Snippets**: ${lib.totalSnippets}\n`;
      output += `- **Trust Score**: ${(lib.trustScore * 100).toFixed(1)}%\n`;
      if (lib.versions?.length) {
        output += `- **Versions**: ${lib.versions.slice(0, 5).join(", ")}${lib.versions.length > 5 ? "..." : ""}\n`;
      }
      output += "\n";
    }

    output += `\nUse the library ID with the \`context7_docs\` tool to fetch documentation.`;

    const details: SearchDetails = {
      query,
      libraryName,
      resultCount: libraries.length,
    };

    return {
      content: [{ type: "text" as const, text: output }],
      details,
    };
  } catch (error: unknown) {
    if (error instanceof Context7Error) {
      throw new Error(`Context7 search failed: ${error.message}`, { cause: error });
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Context7 search failed: ${errorMessage}`, { cause: error });
  }
}
