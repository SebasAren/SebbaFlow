/**
 * Rule loading and matching logic for Claude rules.
 */

import "./picomatch.d.ts";
import * as fs from "node:fs";
import * as path from "node:path";
import picomatch from "picomatch";

import type { ClaudeRule } from "./types";
import { parseFrontmatter, parseInlineArray } from "./parser";

/**
 * Recursively find all .md files under a directory.
 */
export function findMarkdownFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Create a matcher function for a glob pattern.
 * Patterns without slashes use matchBase (match basename anywhere).
 * Patterns with slashes match against the full relative path.
 */
export function createMatcher(glob: string): (p: string) => boolean {
  const hasSlash = glob.includes("/");
  const pm = picomatch(glob, {
    dot: true,
    matchBase: !hasSlash,
  });
  return (filePath: string) => pm(filePath);
}

/**
 * Load all Claude rules from `.claude/rules/`.
 */
export function loadRules(projectRoot: string): ClaudeRule[] {
  const rulesDir = path.join(projectRoot, ".claude", "rules");
  const files = findMarkdownFiles(rulesDir);
  const rules: ClaudeRule[] = [];

  for (const fullPath of files) {
    try {
      const raw = fs.readFileSync(fullPath, "utf-8");
      const { frontmatter, body } = parseFrontmatter(raw);
      const relativePath = path.relative(projectRoot, fullPath);

      // Normalize globs/paths to string array.
      // Claude Code uses both `globs` and `paths` frontmatter fields.
      // `paths` values may be comma-separated: "**/*.ts, **/*.tsx"
      // `globs` values may be inline JSON arrays: ["*.ts"]
      let globs: string[] = [];
      const rawGlobs = frontmatter.globs ?? frontmatter.paths;
      if (rawGlobs) {
        if (typeof rawGlobs === "string") {
          // Try inline JSON array first, then comma-separated, then single value
          const inlineArray = parseInlineArray(rawGlobs);
          if (inlineArray) {
            globs = inlineArray;
          } else if (rawGlobs.includes(",")) {
            globs = rawGlobs
              .split(",")
              .map((g) => g.trim())
              .filter(Boolean);
          } else {
            globs = [rawGlobs];
          }
        } else if (Array.isArray(rawGlobs)) {
          globs = rawGlobs.filter((g): g is string => typeof g === "string");
        }
      }

      // Build compiled matchers
      const matchers = globs.map(createMatcher);

      const description =
        typeof frontmatter.description === "string"
          ? frontmatter.description
          : path.basename(fullPath, ".md");

      rules.push({
        filePath: relativePath,
        description,
        matchers,
        body: body.trim(),
      });
    } catch (err) {
      console.error(`[claude-rules] Failed to parse ${fullPath}: ${String(err)}`);
    }
  }

  return rules;
}
