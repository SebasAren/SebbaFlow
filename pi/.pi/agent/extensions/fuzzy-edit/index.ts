/**
 * Fuzzy Edit Extension — tab-aware whitespace fallback for the edit tool
 *
 * Wraps the built-in edit tool. When the built-in tool fails to find oldText,
 * this extension retries with progressively relaxed whitespace matching:
 *
 *   1. Exact match (built-in tool, includes Unicode/trailing whitespace fuzzy)
 *   2. Tab-to-space normalization (preserves indentation structure)
 *   3. Content-only matching (strips all leading/trailing whitespace per line)
 *
 * This handles the most common edit failures: tab vs space indentation,
 * wrong indentation depth, and trailing whitespace differences.
 */

import type { ExtensionAPI, EditToolDetails } from "@earendil-works/pi-coding-agent";
import { createEditTool, withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { readFile, writeFile, access, constants } from "node:fs/promises";
import { resolve } from "node:path";

import { editSchema, prepareArguments } from "./schema";
import { tabFuzzyReplace } from "./fuzzy-match";
import { generateDiff } from "./diff";

// ── Extension registration ───────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  const cwd = process.cwd();
  const originalEdit = createEditTool(cwd);

  pi.registerTool({
    name: "edit",
    label: "edit",
    description: [
      "Edit a file using exact text replacement, with support for multiple disjoint edits in one call.",
      "Each edits[].oldText is matched against the original file content, not after earlier edits are applied.",
      "Do not emit overlapping or nested edits \u2014 merge nearby changes into one edit entry.",
      "Keep edits[].oldText as small as possible while still being unique in the file \u2014 do not pad with large unchanged regions.",
      "When changing multiple separate locations in one file, use one edit call with multiple entries in edits[].",
    ].join(" "),
    parameters: editSchema,
    promptSnippet:
      "Make precise file edits with exact text replacement, including multiple disjoint edits in one call",
    prepareArguments,

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      // ── Step 1: Try original edit (exact + built-in Unicode fuzzy) ──
      try {
        return await originalEdit.execute(toolCallId, params, signal, onUpdate);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("Could not find")) {
          throw err; // Re-throw non-matching errors (file not found, permissions, etc.)
        }
      }

      // ── Step 2: Tab-aware fuzzy matching fallback ──
      const editPath = (params.path ?? "").replace(/^@/, "");
      const resolvedCwd = (ctx as unknown as { cwd?: string }).cwd ?? cwd;
      const absolutePath = resolve(resolvedCwd, editPath);
      const edits = params.edits;

      if (!edits || edits.length === 0) {
        throw new Error("edits must contain at least one replacement.");
      }

      return withFileMutationQueue(absolutePath, async () => {
        // Check file access
        try {
          await access(absolutePath, constants.R_OK | constants.W_OK);
        } catch {
          throw new Error(`File not found: ${editPath}`);
        }

        // Read file, strip BOM
        const buffer = await readFile(absolutePath);
        const rawContent = buffer.toString("utf-8");
        const content = rawContent.replace(/^\uFEFF/, "");

        // Normalize CRLF → LF for matching; restore original line ending on write.
        const hasCRLF = /\r\n/.test(content);
        const normalizedContent = hasCRLF ? content.replace(/\r\n/g, "\n") : content;

        let modified = normalizedContent;
        let anyFuzzy = false;

        // Apply each edit with fuzzy whitespace matching
        for (const edit of edits) {
          if (!edit.oldText) {
            throw new Error(`oldText must not be empty in ${editPath}.`);
          }
          const oldText = hasCRLF ? edit.oldText.replace(/\r\n/g, "\n") : edit.oldText;
          const newText = hasCRLF ? edit.newText.replace(/\r\n/g, "\n") : edit.newText;
          const result = tabFuzzyReplace(modified, oldText, newText);
          if (!result.found) {
            throw new Error(
              `Could not find oldText in ${editPath} (tried exact, tab-normalized, indent-shift, and content-only matching). ` +
                "The oldText must match including all non-whitespace content.",
            );
          }
          modified = result.content;
          if (result.fuzzy) anyFuzzy = true;
        }

        if (normalizedContent === modified) {
          throw new Error(
            `No changes made to ${editPath}. The replacement produced identical content.`,
          );
        }

        const finalContent = hasCRLF ? modified.replace(/\n/g, "\r\n") : modified;
        await writeFile(absolutePath, finalContent, "utf-8");

        const diffResult = generateDiff(normalizedContent, modified);
        return {
          content: [
            {
              type: "text" as const,
              text: anyFuzzy
                ? `Applied ${edits.length} edit(s) via tab-aware fuzzy matching in ${editPath}.`
                : `Applied ${edits.length} edit(s) in ${editPath}.`,
            },
          ],
          details: {
            diff: diffResult.diff,
            firstChangedLine: diffResult.firstChangedLine,
          } satisfies EditToolDetails,
        };
      });
    },

    // No custom rendering — built-in edit renderer is inherited automatically
  });
}
