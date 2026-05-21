/**
 * Wiki Read Extension
 *
 * Scope-safe file reader for the personal wiki at ~/Documents/wiki/.
 * Only reads files within the wiki directory — rejects paths outside it.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { readFileSync } from "node:fs";
import { resolve, normalize } from "node:path";

// ── Types ──────────────────────────────────────────────────────────────────

export interface WikiReadDetails {
  path: string;
  size: number;
}

// ── Schema ─────────────────────────────────────────────────────────────────

export const WikiReadParams = Type.Object({
  path: Type.String({
    description:
      "Wiki page path — relative to ~/Documents/wiki/wiki/ (e.g. 'concepts/agent-swarm.md') or absolute path within the wiki directory",
  }),
});

// ── Execute ────────────────────────────────────────────────────────────────

export function executeWikiRead(params: { path: string }) {
  const wikiDir = `${process.env.HOME}/Documents/wiki/wiki`;
  let targetPath = params.path;

  // If relative, resolve against wiki directory
  if (!targetPath.startsWith("/")) {
    targetPath = resolve(wikiDir, targetPath);
  }

  // Normalize and validate scope
  const normalized = normalize(targetPath);
  const normalizedWikiDir = normalize(wikiDir);

  if (!normalized.startsWith(normalizedWikiDir)) {
    throw new Error(`Path "${params.path}" is outside the wiki directory`);
  }

  try {
    const content = readFileSync(normalized, "utf8");
    return {
      content: [{ type: "text" as const, text: content }],
      details: { path: normalized, size: content.length } satisfies WikiReadDetails,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read wiki page: ${message}`, { cause: err });
  }
}

// ── Extension entry point ─────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "wiki_read",
    label: "Wiki Read",
    description:
      "Read a specific page from the personal wiki at ~/Documents/wiki/. " +
      "Scope-safe — only reads files within the wiki directory.",
    promptSnippet: "Read a wiki page by path",
    parameters: WikiReadParams,

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      return executeWikiRead(params);
    },

    renderCall(args, theme, context) {
      let content = theme.fg("toolTitle", theme.bold("wiki_read "));
      content += theme.fg("accent", `"${args.path}"`);
      const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
      text.setText(content);
      return text;
    },

    renderResult(result, state, theme) {
      if (state.isPartial) {
        return new Text(theme.fg("warning", "Reading wiki..."), 0, 0);
      }

      const details = result.details as WikiReadDetails | undefined;
      const icon = theme.fg("success", "✓");
      let text = `${icon} ${theme.fg("toolTitle", theme.bold("wiki_read"))}`;

      if (details?.path) {
        const shortPath = details.path.replace(`${process.env.HOME}/Documents/wiki/wiki/`, "");
        text += theme.fg("dim", ` ${shortPath}`);
      }

      return new Text(text, 0, 0);
    },
  });
}
