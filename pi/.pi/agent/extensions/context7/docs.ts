/**
 * Context7 docs tool — schema, execute logic, and types.
 */

import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { Context7, Context7Error, type Documentation } from "@upstash/context7-sdk";

// ── Types ──────────────────────────────────────────────────────────────────

export interface DocsDetails {
  libraryId: string;
  query: string;
  snippetCount: number;
}

// ── Schema ─────────────────────────────────────────────────────────────────

export const DocsParams = Type.Object({
  libraryId: Type.String({
    description: "Context7-compatible library ID (e.g., '/facebook/react', '/vercel/next.js')",
  }),
  query: Type.String({ description: "Your question or task (used for relevance ranking)" }),
  type: Type.Optional(
    StringEnum(["json", "txt"] as const, {
      description: "Response type: 'json' or 'txt' (default: 'txt')",
    }),
  ),
});

// ── Execute ────────────────────────────────────────────────────────────────

export async function executeDocs(
  params: { libraryId: string; query: string; type?: "json" | "txt" },
  apiKey: string | undefined,
  client: Context7,
  signal?: AbortSignal,
  onUpdate?: (update: {
    content: Array<{ type: "text"; text: string }>;
    details: DocsDetails;
  }) => void,
) {
  if (!apiKey) {
    throw new Error(
      "CONTEXT7_API_KEY not set. Get your API key at context7.com/dashboard and set it via export CONTEXT7_API_KEY='your-key' or an auth.json \"context7\" entry",
    );
  }

  const { libraryId, query, type = "txt" } = params;

  // Show initial progress
  onUpdate?.({
    content: [{ type: "text" as const, text: `Fetching documentation for ${libraryId}...` }],
    details: { libraryId, query, snippetCount: 0 },
  });

  try {
    let output: string;
    let snippetCount = 0;

    if (type === "txt") {
      output = await client.getContext(query, libraryId, { type: "txt" });
      // Estimate snippet count by counting code blocks
      snippetCount = (output.match(/```/g) || []).length / 2;
    } else {
      const docs: Documentation[] = await client.getContext(query, libraryId);
      snippetCount = docs.length;

      if (snippetCount === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No documentation found for library "${libraryId}" with query "${query}".`,
            },
          ],
          details: { libraryId, query, snippetCount: 0 },
        };
      }

      // Format JSON response
      output = `## Context7 Documentation for ${libraryId}\n\n`;
      output += `**Query**: ${query}\n\n`;

      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        output += `### ${doc.title || `Snippet ${i + 1}`}\n`;
        if (doc.source) {
          output += `**Source**: ${doc.source}\n`;
        }
        output += `${doc.content}\n\n`;
      }
    }

    // Check for cancellation
    if (signal?.aborted) {
      return {
        content: [{ type: "text" as const, text: "Documentation fetch cancelled" }],
        details: { libraryId, query, snippetCount: 0 },
      };
    }

    const details: DocsDetails = {
      libraryId,
      query,
      snippetCount,
    };

    return {
      content: [{ type: "text" as const, text: output }],
      details,
    };
  } catch (error: unknown) {
    if (error instanceof Context7Error) {
      throw new Error(`Context7 documentation fetch failed: ${error.message}`, { cause: error });
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Context7 documentation fetch failed: ${errorMessage}`, { cause: error });
  }
}
