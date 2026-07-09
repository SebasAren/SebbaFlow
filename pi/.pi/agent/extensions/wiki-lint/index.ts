/**
 * Wiki Lint Extension
 *
 * Structural health checks for the personal wiki at ~/Documents/wiki/.
 * Detects broken links, orphans, missing titles, filename violations, empty pages, and stale inbox files.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";

import { renderLintCall, renderLintResult } from "./render";

// ── Types ──────────────────────────────────────────────────────────────────

export interface LintIssue {
  path: string;
  message: string;
}

export interface LintResult {
  check: LintCheck;
  issues: LintIssue[];
}

export type LintCheck =
  "broken-links" | "orphans" | "missing-h1" | "filename" | "empty-pages" | "inbox-orphans";

export const ALL_CHECKS: LintCheck[] = [
  "broken-links",
  "orphans",
  "missing-h1",
  "filename",
  "empty-pages",
  "inbox-orphans",
];

export interface WikiLintDetails {
  wikiDir: string;
  checksRun: number;
  totalIssues: number;
  results: LintResult[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

const WIKI_SUBDIRS = ["concepts", "entities", "sources", "synthesis", "analysis"];

/** Directories (relative to wikiDir) to search when resolving link slugs. Includes root. */
const SLUG_SEARCH_DIRS = [".", ...WIKI_SUBDIRS];

/** Recursively list .md files in a directory. */
function listMdFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

/** List all wiki .md files with their category-relative paths. */
function listAllWikiPages(wikiDir: string): string[] {
  const files: string[] = [];
  for (const sub of WIKI_SUBDIRS) {
    files.push(...listMdFiles(join(wikiDir, sub)));
  }
  return files;
}

/** Extract slug from a [[link]] target. Handles [[slug]], [[slug|alias]], [[slug#heading]]. */
function extractSlug(linkTarget: string): string {
  // Remove alias: [[slug|alias]] → slug
  let slug = linkTarget.split("|")[0];
  // Remove anchor: [[slug#heading]] → slug
  slug = slug.split("#")[0];
  return slug.trim();
}

/** Check if a slug resolves to an existing wiki file. */
function slugExists(slug: string, wikiDir: string): boolean {
  for (const dir of SLUG_SEARCH_DIRS) {
    if (existsSync(join(wikiDir, dir, `${slug}.md`))) return true;
  }
  return false;
}

/** Run ripgrep and return stdout. */
function rg(...args: string[]): string {
  const result = spawnSync("rg", args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30_000,
  });
  if (result.error) {
    throw new Error(`ripgrep failed: ${result.error.message}`);
  }
  if (result.status !== 0 && result.status !== 1) {
    // status 1 = no matches, which is fine; anything else is an error
    throw new Error(`ripgrep exited with status ${result.status}: ${result.stderr ?? ""}`);
  }
  return result.stdout ?? "";
}

/** Strip fenced code blocks and inline code spans from markdown content. */
function stripCodeSpans(content: string): string {
  // Remove fenced code blocks first
  const withoutFenced = content.replace(/```[\s\S]*?```/g, "");
  // Remove inline code spans
  return withoutFenced.replace(/`[^`]+`/g, "");
}

/** Find the first non-blank content line after optional YAML frontmatter. */
function firstContentLine(lines: string[]): string {
  if (lines.length === 0) return "";
  let startIdx = 0;

  // Skip YAML frontmatter (--- ... ---)
  if (lines[0].trim() === "---") {
    const closingIdx = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
    if (closingIdx !== -1) {
      startIdx = closingIdx + 1;
    }
  }

  // Skip blank lines after frontmatter (or at start)
  for (let i = startIdx; i < lines.length; i++) {
    if (lines[i].trim() !== "") return lines[i];
  }
  return "";
}

// ── Check implementations ──────────────────────────────────────────────────

function checkBrokenLinks(wikiDir: string): LintResult {
  const issues: LintIssue[] = [];

  // Extract all unique [[links]] across wiki pages, ignoring those inside backtick code spans
  const allPages = listAllWikiPages(wikiDir);
  const seen = new Set<string>();

  for (const pagePath of allPages) {
    const content = readFileSync(pagePath, "utf8");
    const cleanContent = stripCodeSpans(content);

    for (const m of cleanContent.matchAll(/\[\[([^\]]+)\]\]/g)) {
      const raw = m[1];
      const slug = extractSlug(raw);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);

      if (!slugExists(slug, wikiDir)) {
        issues.push({
          path: `${slug}.md`,
          message: `Broken link: [[${raw}]] — no matching file found`,
        });
      }
    }
  }

  return { check: "broken-links", issues };
}

function checkOrphans(wikiDir: string): LintResult {
  const issues: LintIssue[] = [];
  const allPages = listAllWikiPages(wikiDir);

  for (const pagePath of allPages) {
    const slug = basename(pagePath, ".md");
    const dirName = basename(join(pagePath, ".."));

    // Search for [[slug]] or [[category/slug]] across all wiki files except the page itself
    // Regex matches: [[slug, [[concepts/slug, [[sources/slug|alias, etc.
    const stdout = rg(
      "-l",
      `\\[\\[(?:[^/\\]\\|]+/)*${slug}`,
      "--glob",
      `!${dirName}/${slug}.md`,
      wikiDir,
    );
    const hasInbound = stdout.trim().length > 0;

    if (!hasInbound) {
      issues.push({
        path: pagePath,
        message: `Orphan: no inbound [[${slug}]] links from other wiki pages`,
      });
    }
  }

  return { check: "orphans", issues };
}

function checkMissingH1(wikiDir: string): LintResult {
  const issues: LintIssue[] = [];
  const allPages = listAllWikiPages(wikiDir);

  for (const pagePath of allPages) {
    const content = readFileSync(pagePath, "utf8");
    const lines = content.split("\n");
    const heading = firstContentLine(lines);
    if (!heading.startsWith("# ")) {
      issues.push({
        path: pagePath,
        message: `Missing H1 title. First content line: "${heading.slice(0, 60)}"`,
      });
    }
  }

  return { check: "missing-h1", issues };
}

function checkFilenames(wikiDir: string): LintResult {
  const issues: LintIssue[] = [];
  const validPattern = /^[a-z0-9-]+\.md$/;

  const allPages = listAllWikiPages(wikiDir);
  for (const pagePath of allPages) {
    const name = basename(pagePath);
    if (!validPattern.test(name)) {
      issues.push({
        path: pagePath,
        message: `Invalid filename: "${name}" — should be lowercase-with-dashes.md`,
      });
    }
  }

  return { check: "filename", issues };
}

function checkEmptyPages(wikiDir: string): LintResult {
  const issues: LintIssue[] = [];
  const allPages = listAllWikiPages(wikiDir);

  for (const pagePath of allPages) {
    const stat = statSync(pagePath);
    if (stat.size < 50) {
      const content = readFileSync(pagePath, "utf8").trim();
      issues.push({
        path: pagePath,
        message: `Near-empty page (${stat.size} bytes): "${content.slice(0, 50)}"`,
      });
    }
  }

  return { check: "empty-pages", issues };
}

function checkInboxOrphans(baseDir: string): LintResult {
  const issues: LintIssue[] = [];
  const inboxDir = join(baseDir, "raw", "inbox");
  if (!existsSync(inboxDir)) return { check: "inbox-orphans", issues: [] };

  const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;

  for (const entry of readdirSync(inboxDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const filePath = join(inboxDir, entry.name);
    const stat = statSync(filePath);
    if (stat.mtimeMs < threeDaysAgo) {
      const daysOld = Math.floor((Date.now() - stat.mtimeMs) / (24 * 60 * 60 * 1000));
      issues.push({ path: filePath, message: `Inbox file ${daysOld} days old: "${entry.name}"` });
    }
  }

  return { check: "inbox-orphans", issues };
}

// ── Main lint runner ───────────────────────────────────────────────────────

const CHECK_FNS: Record<LintCheck, (dir: string) => LintResult> = {
  "broken-links": (dir) => checkBrokenLinks(join(dir, "wiki")),
  orphans: (dir) => checkOrphans(join(dir, "wiki")),
  "missing-h1": (dir) => checkMissingH1(join(dir, "wiki")),
  filename: (dir) => checkFilenames(join(dir, "wiki")),
  "empty-pages": (dir) => checkEmptyPages(join(dir, "wiki")),
  "inbox-orphans": (dir) => checkInboxOrphans(dir),
};

export async function runLintChecks(
  wikiBaseDir: string,
  checks?: LintCheck[],
): Promise<LintResult[]> {
  const toRun = checks && checks.length > 0 ? checks : ALL_CHECKS;
  const results: LintResult[] = [];

  for (const check of toRun) {
    const fn = CHECK_FNS[check];
    if (fn) {
      results.push(fn(wikiBaseDir));
    }
  }

  return results;
}

// ── Extension entry point ──────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "wiki_lint",
    label: "Wiki Lint",
    description:
      "Run structural health checks on the personal wiki at ~/Documents/wiki/. " +
      "Detects broken wiki links, orphan pages, missing H1 titles, filename convention violations, " +
      "near-empty pages, and stale inbox files.",
    promptSnippet: "Lint the wiki for structural issues",
    parameters: Type.Object({
      checks: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Which checks to run. Values: broken-links, orphans, missing-h1, filename, empty-pages, inbox-orphans. Default: all.",
        }),
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const wikiBaseDir = `${process.env.HOME}/Documents/wiki`;
      const checks = (params.checks as LintCheck[] | undefined) ?? undefined;

      const results = await runLintChecks(wikiBaseDir, checks);

      const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
      const wikiDir = join(wikiBaseDir, "wiki");

      // Build human-readable report
      let report = `Wiki Lint Report: ${totalIssues} issue${totalIssues === 1 ? "" : "s"} found\n\n`;

      for (const result of results) {
        const icon = result.issues.length > 0 ? "⚠️" : "✓";
        report += `${icon} ${result.check}: ${result.issues.length} issue${result.issues.length === 1 ? "" : "s"}\n`;
        for (const issue of result.issues.slice(0, 50)) {
          report += `  - ${issue.message}\n`;
        }
        if (result.issues.length > 50) {
          report += `  ... and ${result.issues.length - 50} more\n`;
        }
        report += "\n";
      }

      const details: WikiLintDetails = {
        wikiDir,
        checksRun: results.length,
        totalIssues,
        results,
      };

      return {
        content: [{ type: "text" as const, text: report }],
        details,
      };
    },

    renderCall(args, theme, context) {
      return renderLintCall(args, theme, context);
    },

    renderResult(result, state, theme, _context) {
      return renderLintResult(
        result as unknown as Parameters<typeof renderLintResult>[0],
        state,
        theme,
      );
    },
  });

  // Quick command: /lint-wiki
  pi.registerCommand("lint-wiki", {
    description: "Run structural lint checks on the wiki",
    handler: async (args, _ctx) => {
      const checks = args ? args.trim().split(/[\s,]+/) : undefined;
      const checkStr = checks ? ` with checks: ${checks.join(", ")}` : "";
      pi.sendUserMessage(`Run wiki_lint${checkStr}.`, { deliverAs: "followUp" });
    },
  });
}
