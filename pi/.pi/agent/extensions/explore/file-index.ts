/**
 * File Index — in-memory structural index of a codebase.
 *
 * Built once per session, invalidated on tool edits, and queried with
 * multi-signal relevance scoring (symbols, intent, scope, import graph).
 */

import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { extractSymbols, type CodeSymbol } from "@pi-ext/shared";
import type { QueryPlan, QueryIntent } from "./query-planner";

export interface FileEntry {
  path: string;
  language: string;
  symbols: CodeSymbol[];
  description: string;
  imports: string[];
  exports: string[];
  size: number;
  mtimeMs: number;
}

export interface ScoredFile {
  path: string;
  score: number;
  reasons: string[];
}

const MAX_INDEXED_FILES = 1500;
const MAX_BUILD_TIME_MS = 20_000;
const MAX_FILE_SIZE = 50_000;

export class FileIndex {
  private cwd: string;
  private files = new Map<string, FileEntry>();
  private importedBy = new Map<string, Set<string>>();
  /** Maps package name (from package.json `name` field) to directory path */
  private packageNameMap = new Map<string, string>();

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  get size(): number {
    return this.files.size;
  }

  /** Look up a single entry by relative path. Returns undefined if not indexed. */
  getEntry(relPath: string): FileEntry | undefined {
    return this.files.get(relPath);
  }

  /** Build the index from all tracked source files. Returns true if the build was truncated by the time cap. */
  async build(): Promise<boolean> {
    const fileList = this.enumerateFiles();
    const start = Date.now();

    const indexed: string[] = [];
    let hitBuildCap = false;
    for (const relPath of fileList) {
      if (Date.now() - start > MAX_BUILD_TIME_MS) {
        hitBuildCap = true;
        break;
      }
      const success = await this.indexFile(relPath);
      if (success) indexed.push(relPath);
    }

    // Populate package name map from package.json files
    await this.buildPackageNameMap(indexed);

    // Second pass: resolve imports and build reverse graph
    for (const relPath of indexed) {
      const entry = this.files.get(relPath);
      if (!entry) continue;
      for (const imp of entry.imports) {
        const resolved = this.resolveImport(relPath, imp);
        if (resolved && this.files.has(resolved)) {
          if (!this.importedBy.has(resolved)) {
            this.importedBy.set(resolved, new Set());
          }
          this.importedBy.get(resolved)!.add(relPath);
        }
      }
    }

    return hitBuildCap;
  }

  /** Search the index using a structured query plan. */
  search(plan: QueryPlan): ScoredFile[] {
    const scored: ScoredFile[] = [];
    for (const entry of this.files.values()) {
      const result = this.scoreFile(entry, plan);
      if (result.score > 0) {
        scored.push(result);
      }
    }

    scored.sort((a, b) => b.score - a.score);
    this.applyProximityBoost(scored, plan.intent);
    scored.sort((a, b) => b.score - a.score);

    return scored;
  }

  /** Remove a file from the index (e.g. after an external edit). */
  invalidate(relPath: string): void {
    const normalized = relPath.replace(/^\.\//, "");
    this.files.delete(normalized);
  }

  /** Re-index a single file if it changed on disk. */
  async validateAndReindexIfNeeded(relPath: string): Promise<boolean> {
    const normalized = relPath.replace(/^\.\//, "");
    const entry = this.files.get(normalized);
    if (!entry) return false;
    try {
      const fullPath = path.resolve(this.cwd, normalized);
      const s = await stat(fullPath);
      if (s.mtimeMs > entry.mtimeMs || s.size !== entry.size) {
        await this.indexFile(normalized);
        return true;
      }
      return false;
    } catch {
      this.files.delete(normalized);
      return false;
    }
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private enumerateFiles(): string[] {
    const exts = [
      "*.ts",
      "*.tsx",
      "*.js",
      "*.jsx",
      "*.mjs",
      "*.cjs",
      "*.py",
      "*.go",
      "*.rs",
      "*.vue",
      "*.svelte",
      "*.rb",
      "*.java",
      "*.kt",
      "*.swift",
      "*.c",
      "*.cpp",
      "*.h",
      "*.hpp",
      "*.lua",
    ];

    // Try git ls-files first (works in git repos).
    // Strip index/env redirection so we always enumerate THIS directory's repo:
    // when pi runs `mise run test` under the pre-commit hook, GIT_INDEX_FILE
    // points at the committing repo's index and would silently return that
    // file list instead (every path then fails stat and the index comes up
    // empty). Same hazard for fixture repos in tests.
    const gitEnv = { ...process.env };
    delete gitEnv.GIT_INDEX_FILE;
    delete gitEnv.GIT_DIR;
    delete gitEnv.GIT_WORK_TREE;
    const gitResult = spawnSync("git", ["ls-files", "--", ...exts], {
      cwd: this.cwd,
      env: gitEnv,
      timeout: 5000,
      encoding: "utf-8",
    });

    if (gitResult.status === 0 && gitResult.stdout.trim()) {
      return gitResult.stdout
        .trim()
        .split("\n")
        .filter((f) => f && !f.includes("node_modules/") && !f.startsWith(".git/"))
        .map((f) => f.replace(/^\.\//, ""))
        .slice(0, MAX_INDEXED_FILES);
    }

    // Fallback: find command for non-git directories
    const findArgs = [".", "-type", "f", "("];
    for (let i = 0; i < exts.length; i++) {
      if (i > 0) findArgs.push("-o");
      findArgs.push("-name", exts[i]);
    }
    findArgs.push(
      ")",
      "!",
      "-path",
      "./node_modules/*",
      "!",
      "-path",
      "./.*",
      "!",
      "-path",
      "./dist/*",
      "!",
      "-path",
      "./build/*",
    );

    const findResult = spawnSync("find", findArgs, {
      cwd: this.cwd,
      timeout: 5000,
      encoding: "utf-8",
    });

    if (findResult.status === 0 && findResult.stdout.trim()) {
      return findResult.stdout
        .trim()
        .split("\n")
        .filter((f) => f && !f.includes("node_modules/") && !f.startsWith(".git/"))
        .map((f) => f.replace(/^\.\//, ""))
        .slice(0, MAX_INDEXED_FILES);
    }

    return [];
  }

  private async indexFile(relPath: string): Promise<boolean> {
    const fullPath = path.resolve(this.cwd, relPath);
    try {
      const s = await stat(fullPath);
      if (s.size > MAX_FILE_SIZE) return false;

      const source = await readFile(fullPath, "utf-8");
      const outline = await extractSymbols(relPath, source);
      const symbols = outline?.symbols ?? [];
      const description = extractDescription(source);
      const imports = extractImports(relPath, source);
      const exports = symbols
        .filter(
          (sym) =>
            sym.name &&
            sym.kind !== "export" &&
            (["function", "class", "interface", "type_alias"] as string[]).includes(sym.kind),
        )
        .map((sym) => sym.name);

      const entry: FileEntry = {
        path: relPath,
        language: outline?.language ?? path.extname(relPath),
        symbols,
        description,
        imports,
        exports,
        size: s.size,
        mtimeMs: s.mtimeMs,
      };

      this.files.set(relPath, entry);
      return true;
    } catch {
      return false;
    }
  }

  private scoreFile(entry: FileEntry, plan: QueryPlan): ScoredFile {
    let score = 0;
    const reasons: string[] = [];

    // Grep term matches in symbols, path, and description
    // Skip terms that overlap with entities — those are scored separately
    // with higher weights in the entity loop below.
    const entityLowers = new Set(plan.entities.map((e) => e.toLowerCase()));
    for (const term of plan.grepTerms) {
      if (entityLowers.has(term.toLowerCase())) continue;
      const lower = term.toLowerCase();
      // Path match
      if (entry.path.toLowerCase().includes(lower)) {
        score += 2;
        reasons.push(`path match: ${term}`);
      }
      for (const sym of entry.symbols) {
        if (sym.kind === "export") continue; // Skip noisy export-statement symbols
        const symLower = sym.name.toLowerCase();
        if (isRelated(lower, symLower)) {
          score += symLower === lower ? 8 : 4;
          reasons.push(`symbol match: ${sym.name}`);
        }
      }
      if (entry.description.toLowerCase().includes(lower)) {
        score += 1;
      }
    }

    // Exact entity matches (highest weight)
    for (const entity of plan.entities) {
      const lower = entity.toLowerCase();
      // Path match for entity
      if (entry.path.toLowerCase().includes(lower)) {
        score += 6;
        reasons.push(`path entity: ${entity}`);
      }
      const exactSym = entry.symbols.find(
        (s) => s.kind !== "export" && isRelated(s.name.toLowerCase(), lower),
      );
      if (exactSym) {
        score += 12;
        reasons.push(`exact entity: ${exactSym.name}`);
      }
      // Description mentions entity — lifts files whose JSDoc names the concept
      // even when no symbol matches (e.g. "In-process subagent runner")
      if (entry.description.toLowerCase().includes(lower)) {
        score += 4;
        reasons.push(`description mentions: ${entity}`);
      }
    }

    // Intent boosting
    if (
      plan.intent === "define" &&
      entry.symbols.some((s) =>
        (["function", "class", "interface", "type_alias", "method"] as string[]).includes(s.kind),
      )
    ) {
      score += 4;
    }
    if (
      plan.intent === "arch" &&
      ["index.ts", "main.ts", "app.ts", "server.ts"].some((n) => entry.path.endsWith(n))
    ) {
      score += 3;
      reasons.push("entry point");
    }

    // Scope hints
    for (const hint of plan.scopeHints) {
      if (entry.path.includes(hint)) {
        score += 3;
        reasons.push(`scope: ${hint}`);
      }
    }

    // File pattern preference
    const ext = path.extname(entry.path);
    const hasPreferredExt = plan.filePatterns.some((p) => {
      if (p.startsWith("*.")) return ext === p.slice(1);
      return (
        entry.path.toLowerCase().includes(p.toLowerCase().replace(/\*/g, "")) && !p.startsWith("*.")
      );
    });
    if (hasPreferredExt) {
      score += 1;
    }

    return {
      path: entry.path,
      score: Math.max(0, score),
      reasons: [...new Set(reasons)],
    };
  }

  private applyProximityBoost(scored: ScoredFile[], intent?: QueryIntent): void {
    const topPaths = new Set(scored.slice(0, 10).map((s) => s.path));
    const boostMap = new Map<string, number>();
    const secondOrderBoostMap = new Map<string, number>();

    for (const file of topPaths) {
      // Files that import top files (direct callers)
      const importers = this.importedBy.get(file);
      if (importers) {
        for (const importer of importers) {
          boostMap.set(importer, (boostMap.get(importer) || 0) + 2);
          // Second-order: files that import the importers
          const secondOrder = this.importedBy.get(importer);
          if (secondOrder) {
            for (const so of secondOrder) {
              if (!topPaths.has(so)) {
                secondOrderBoostMap.set(so, (secondOrderBoostMap.get(so) || 0) + 1);
              }
            }
          }
        }
      }
      // Files that top files import (dependencies)
      const entry = this.files.get(file);
      if (entry) {
        for (const imp of entry.imports) {
          const resolved = this.resolveImport(file, imp);
          if (resolved) {
            boostMap.set(resolved, (boostMap.get(resolved) || 0) + 1);
          }
        }
      }
    }

    // Use-intent: weight callers of matched symbols higher
    const callerBoost = intent === "use" ? 4 : 2;

    for (const s of scored) {
      // Only boost files that already have direct relevance.
      if (s.score === 0) continue;
      const boost = boostMap.get(s.path);
      if (boost) {
        s.score += intent === "use" ? callerBoost : boost;
        s.reasons.push("import proximity");
      }
      const secondOrder = secondOrderBoostMap.get(s.path);
      if (secondOrder) {
        s.score += secondOrder;
        s.reasons.push("second-order proximity");
      }
    }
  }

  /**
   * Read package.json files from the index and populate packageNameMap.
   * Maps package name → directory path (e.g. "@pi-ext/shared" → "shared/src/").
   */
  private async buildPackageNameMap(indexed: string[]): Promise<void> {
    const pkgFiles = indexed.filter((f) => f.endsWith("/package.json") || f === "package.json");
    for (const pkgFile of pkgFiles) {
      try {
        const fullPath = path.resolve(this.cwd, pkgFile);
        const content = await readFile(fullPath, "utf-8");
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const pkg: { name?: unknown } = JSON.parse(content);
        if (pkg.name && typeof pkg.name === "string") {
          const dir = path.dirname(pkgFile);
          this.packageNameMap.set(pkg.name, dir === "." ? "" : dir.replace(/\\/g, "/"));
        }
      } catch {
        // skip unparseable package.json
      }
    }
  }

  private resolveImport(fromRelPath: string, importPath: string): string | null {
    const fromDir = path.dirname(fromRelPath);
    let base: string;

    // ── Relative imports ────────────────────────────────────────────────
    if (importPath.startsWith(".")) {
      base = path.join(fromDir, importPath);
      const candidates = [
        base,
        base + ".ts",
        base + ".tsx",
        base + ".js",
        base + ".jsx",
        base + ".mjs",
        base + ".cjs",
        base + ".py",
        base + ".lua",
        base + "/index.ts",
        base + "/index.js",
        base + "/__init__.py",
        base + "/init.lua",
      ];
      for (const c of candidates) {
        const normalized = c.replace(/^\.\//, "").replace(/\\/g, "/");
        if (this.files.has(normalized)) return normalized;
      }
      return null;
    }

    // ── Barrel / package imports (non-relative) ─────────────────────────
    // Try package name map first (e.g. "@pi-ext/shared" → "shared/src/")
    for (const [pkgName, pkgDir] of this.packageNameMap) {
      if (importPath === pkgName) {
        // Exact package match: look for index files in the package root
        const indexCandidates = [
          pkgDir + "/index.ts",
          pkgDir + "/index.js",
          pkgDir + "/src/index.ts",
          pkgDir + "/src/index.js",
          pkgDir + "/__init__.py",
          pkgDir + "/init.lua",
        ].filter(Boolean);
        for (const c of indexCandidates) {
          if (this.files.has(c)) return c;
        }
      } else if (importPath.startsWith(pkgName + "/")) {
        // Subpath import (e.g. "@pi-ext/shared/test-mocks" → "shared/src/test-mocks.ts")
        const subpath = importPath.slice(pkgName.length + 1);
        const candidates = [
          pkgDir + "/" + subpath + ".ts",
          pkgDir + "/" + subpath + ".js",
          pkgDir + "/src/" + subpath + ".ts",
          pkgDir + "/src/" + subpath + ".js",
          pkgDir + "/" + subpath + "/index.ts",
          pkgDir + "/" + subpath + "/index.js",
          pkgDir + "/" + subpath + ".py",
          pkgDir + "/" + subpath + ".lua",
        ].filter(Boolean);
        for (const c of candidates) {
          const normalized = c.replace(/^\.\//, "").replace(/\\/g, "/");
          if (this.files.has(normalized)) return normalized;
        }
      }
    }

    // ── Python module paths (e.g. "mypackage.mymodule") ────────────────
    if (importPath.includes(".")) {
      const asPath = importPath.replace(/\./g, "/");
      const candidates = [asPath + ".py", asPath + "/__init__.py"];
      for (const c of candidates) {
        if (this.files.has(c)) return c;
      }
    }

    // ── Lua module paths (e.g. "mymodule.submodule") ───────────────────
    if (importPath.includes(".")) {
      const asPath = importPath.replace(/\./g, "/");
      const candidates = [asPath + ".lua", asPath + "/init.lua"];
      for (const c of candidates) {
        if (this.files.has(c)) return c;
      }
    }

    return null;
  }
}

/**
 * Check if two lowercase strings are related (stem/plural overlap).
 * Returns true if they are equal, or if one is a prefix of the other
 * at a word boundary (next char is non-alphanumeric or end-of-string),
 * or if they share ≥6 leading chars (stem/plural overlap).
 */
function isRelated(a: string, b: string): boolean {
  if (a === b) return true;

  // Containment check with word-boundary enforcement:
  // the shorter string must end at a word boundary in the longer string.
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  const idx = longer.indexOf(shorter);
  if (idx >= 0) {
    const afterIdx = idx + shorter.length;
    if (afterIdx === longer.length) return true; // shorter is suffix
    const nextChar = longer[afterIdx];
    if (!/[a-z0-9]/.test(nextChar)) return true; // boundary after match
  }

  // Plural / stem overlap: compute longest common prefix
  let shared = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] === b[i]) shared++;
    else break;
  }
  if (shared >= 6) return true;

  // De-pluralised containment (subagents ↔ subagent)
  const aStem = a.replace(/s$/, "");
  const bStem = b.replace(/s$/, "");
  if (aStem !== a || bStem !== b) {
    return isRelated(aStem, bStem);
  }

  return false;
}

function extractDescription(source: string): string {
  // Lua multi-line comment (--[[ ... ]])
  const luaMultiline = source.match(/--\[\[[\s\S]*?\]\]/);
  if (luaMultiline) {
    return luaMultiline[0]
      .replace(/^--\[\[\s*/, "")
      .replace(/\s*\]\]$/, "")
      .replace(/\s*\n\s*/g, " ")
      .trim()
      .slice(0, 200);
  }

  // JSDoc block
  const jsdoc = source.match(/\/\*\*[\s\S]*?\*\//);
  if (jsdoc) {
    return jsdoc[0]
      .replace(/\/\*\*?\s*|\s*\*\//g, "")
      .replace(/\s*\n\s*\*\s?/g, " ")
      .trim()
      .slice(0, 200);
  }

  // Leading single-line comments (// or --)
  const lines = source.split("\n");
  const comments: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("//")) {
      comments.push(trimmed.replace(/^\/\/\s*/, ""));
    } else if (trimmed.startsWith("--") && !trimmed.startsWith("--[[")) {
      comments.push(trimmed.replace(/^--\s*/, ""));
    } else if (trimmed === "" || trimmed.startsWith("import ") || trimmed.startsWith("export ")) {
      continue;
    } else {
      break;
    }
  }
  if (comments.length > 0) {
    return comments.join(" ").slice(0, 200);
  }

  // Fallback: first non-empty non-import line
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("import") && !trimmed.startsWith("export")) {
      return trimmed.slice(0, 200);
    }
  }
  return "";
}

export function extractImports(filePath: string, source: string): string[] {
  const ext = path.extname(filePath);
  const imports: string[] = [];
  let match;

  // ── TypeScript / JavaScript ──────────────────────────────────────────────
  if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
    const importRegex =
      /import\s+(?:type\s+)?(?:{[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;
    while ((match = importRegex.exec(source)) !== null) {
      imports.push(match[1]);
    }

    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRegex.exec(source)) !== null) {
      imports.push(match[1]);
    }
  }

  // ── Python ───────────────────────────────────────────────────────────────
  if (ext === ".py") {
    // from X import Y
    const fromImport = /^from\s+([\w.]+)\s+import\s+/gm;
    while ((match = fromImport.exec(source)) !== null) {
      imports.push(match[1]);
    }
    // import X [, Y]
    const plainImport = /^import\s+([\w.]+)(?:\s*,\s*[\w.]+)*/gm;
    while ((match = plainImport.exec(source)) !== null) {
      imports.push(match[1]);
    }
  }

  // ── Lua ──────────────────────────────────────────────────────────────────
  if (ext === ".lua") {
    // require("X") or require 'X'
    const luaRequire = /require\s*[(]?\s*['"]([^'"]+)['"]/g;
    while ((match = luaRequire.exec(source)) !== null) {
      imports.push(match[1]);
    }
  }

  return imports;
}
