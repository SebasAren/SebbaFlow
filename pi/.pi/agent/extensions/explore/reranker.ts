/**
 * Cohere Reranker via OpenRouter — semantic ranking for pre-search candidates.
 *
 * Builds synthetic documents from FileIndex metadata (description, exports,
 * top symbols) and calls OpenRouter's rerank endpoint. No raw file content
 * is sent — avoids import-noise contamination.
 */

import { resolveApiKey } from "@pi-ext/shared";
import type { FileEntry, ScoredFile } from "./file-index";

const RERANK_MODEL = "cohere/rerank-4-fast";
const RERANK_URL = "https://openrouter.ai/api/v1/rerank";
const MAX_DOC_LENGTH = 300; // Characters per synthetic document

export interface RerankedFile extends ScoredFile {
  /** Semantic relevance score from Cohere reranker (0–1). */
  relevanceScore: number;
}

/** Build a synthetic document for the reranker from index metadata. */
export function buildDocument(entry: FileEntry): string {
  const parts: string[] = [];

  // Basename gives the module name (without directory noise)
  parts.push(entry.path);

  // JSDoc description — already concise and semantic
  if (entry.description) {
    parts.push(entry.description.slice(0, 200));
  }

  // Exported symbols = public API surface
  if (entry.exports.length > 0) {
    parts.push(`Exports: ${entry.exports.slice(0, 8).join(", ")}`);
  }

  // Top symbols (functions, classes, interfaces) — the "what's inside"
  const topSymbols = entry.symbols
    .filter((s) => s.kind !== "export" && s.name.length >= 3)
    .slice(0, 6)
    .map((s) => s.name);
  if (topSymbols.length > 0) {
    parts.push(`Symbols: ${topSymbols.join(", ")}`);
  }

  const doc = parts.join(" | ");
  return doc.length > MAX_DOC_LENGTH ? doc.slice(0, MAX_DOC_LENGTH) + "..." : doc;
}

interface CohereRerankResult {
  results: Array<{
    index: number;
    relevance_score: number;
  }>;
}

/**
 * Rerank scored candidates using the OpenRouter Cohere rerank endpoint.
 *
 * @param rawQuery - The original user query (not decomposed plan terms)
 * @param candidates - Heuristic-scored candidates (pre-cut to top ~30)
 * @param entries - Full file entries for building synthetic documents
 * @returns Reranked candidates with `relevanceScore` populated, or
 *          the original candidates if the API is unavailable.
 */
export async function rerankCandidates(
  rawQuery: string,
  candidates: ScoredFile[],
  entries: Map<string, FileEntry>,
): Promise<RerankedFile[]> {
  // Env var first, then the "openrouter" entry in pi's auth.json
  const apiKey = resolveApiKey("OPENROUTER_API_KEY", "openrouter");
  if (!apiKey || candidates.length < 2) {
    // Graceful fallback: copy heuristic score into relevanceScore
    return candidates.map((c) => ({
      ...c,
      relevanceScore: heuristicToRelevance(c.score),
    }));
  }

  // Build synthetic documents only for candidates we have entries for
  const indexedCandidates: { scored: ScoredFile; entry: FileEntry | undefined }[] = [];
  for (const c of candidates) {
    indexedCandidates.push({ scored: c, entry: entries.get(c.path) });
  }

  const documents = indexedCandidates.map((d) =>
    d.entry ? buildDocument(d.entry) : `File: ${d.scored.path}`,
  );

  try {
    const res = await fetch(RERANK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: RERANK_MODEL,
        query: rawQuery,
        documents,
        top_n: documents.length,
      }),
    });

    if (!res.ok) {
      console.warn(`[explore] Rerank API error: ${res.status} ${res.statusText}`);
      return candidates.map((c) => ({
        ...c,
        relevanceScore: heuristicToRelevance(c.score),
      }));
    }

    const data = (await res.json()) as CohereRerankResult;
    const reranked = new Array<RerankedFile>(candidates.length);

    for (const r of data.results) {
      const c = indexedCandidates[r.index].scored;
      reranked[r.index] = {
        ...c,
        relevanceScore: r.relevance_score,
      };
    }

    // Sort by descending relevance score (most relevant first)
    reranked.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return reranked;
  } catch (err) {
    console.warn(`[explore] Rerank failed: ${String(err)}`);
    return candidates.map((c) => ({
      ...c,
      relevanceScore: heuristicToRelevance(c.score),
    }));
  }
}

/**
 * Map crude heuristic scores (0–40+) to a 0–1 range for display / tiering
 * when the reranker is not available.
 */
export function heuristicToRelevance(score: number): number {
  // sigmoid-ish: 0→0.00, 12→0.60, 20→0.80, 40→0.95
  return Math.min(1, score / (score + 8));
}
