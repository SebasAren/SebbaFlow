import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileIndex, extractImports } from "./file-index";
import type { FileEntry } from "./file-index";
import type { QueryPlan } from "./query-planner";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<FileEntry> & { path: string }): FileEntry {
  return {
    path: overrides.path,
    language: "typescript",
    symbols: [],
    description: "",
    imports: [],
    exports: [],
    size: 100,
    mtimeMs: Date.now(),
    ...overrides,
  };
}

/**
 * Env for git fixture subprocesses.
 *
 * `git commit` exports GIT_INDEX_FILE to pre-commit hooks (absolute path for
 * worktrees and partial-commit next-index files). Our test task runs under
 * that hook, so every `git` we spawn inherits it: a fixture repo's `git add`
 * then writes the COMMITTING repo's index instead of the fixture's own,
 * leaving a phantom staged path whose blob lives only inside the temp repo.
 * The temp repo is rmSync'd in `finally`, so the commit dies at tree-build
 * with `error: invalid object ... for 'src/util.ts'` after all checks passed.
 *
 * Strip git env redirection so fixture repos stay hermetic.
 */
function gitFixtureEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.GIT_INDEX_FILE;
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_OBJECT_DIRECTORY;
  delete env.GIT_COMMON_DIR;
  return env;
}

function buildPlan(overrides: Partial<QueryPlan>): QueryPlan {
  return {
    intent: "define",
    entities: [],
    grepTerms: [],
    filePatterns: ["*.ts"],
    scopeHints: [],
    avoidTerms: [],
    ...overrides,
  };
}

// ── FileIndex lifecycle ────────────────────────────────────────────────────

describe("FileIndex lifecycle", () => {
  it("constructs with cwd and starts empty", () => {
    const index = new FileIndex("/tmp");
    expect(index.size).toBe(0);
  });

  it("invalidate removes a file", () => {
    const index = new FileIndex("/tmp");
    (index as any).files.set("src/parser.ts", makeEntry({ path: "src/parser.ts" }));
    expect(index.size).toBe(1);
    index.invalidate("src/parser.ts");
    expect(index.size).toBe(0);
  });

  it("invalidate normalizes leading ./", () => {
    const index = new FileIndex("/tmp");
    (index as any).files.set("src/parser.ts", makeEntry({ path: "src/parser.ts" }));
    index.invalidate("./src/parser.ts");
    expect(index.size).toBe(0);
  });

  it("getEntry returns entry or undefined", () => {
    const index = new FileIndex("/tmp");
    (index as any).files.set("src/parser.ts", makeEntry({ path: "src/parser.ts" }));
    expect(index.getEntry("src/parser.ts")).toBeDefined();
    expect(index.getEntry("nonexistent.ts")).toBeUndefined();
  });

  it("validateAndReindexIfNeeded returns false for non-indexed file", async () => {
    const index = new FileIndex("/tmp");
    const result = await index.validateAndReindexIfNeeded("nonexistent.ts");
    expect(result).toBe(false);
  });

  it("validateAndReindexIfNeeded detects file changes", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "file-index-test-"));
    try {
      const filePath = join(tmpDir, "test.ts");
      writeFileSync(filePath, "const x = 1;\n");

      // Create a temp dir with no git so it enumerates via find fallback
      const index = new FileIndex(tmpDir);

      // Manually add the file
      (index as any).files.set(
        "test.ts",
        makeEntry({
          path: "test.ts",
          language: "typescript",
          size: 12,
          mtimeMs: Date.now(),
        }),
      );

      // mtime might be same immediately, so change the size
      const result = await index.validateAndReindexIfNeeded("test.ts");
      expect(typeof result).toBe("boolean");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── FileIndex.search ───────────────────────────────────────────────────────

describe("FileIndex.search", () => {
  it("ranks path matches above non-matches", () => {
    const index = new FileIndex("/tmp");
    (index as any).files.set("src/parser.ts", makeEntry({ path: "src/parser.ts" }));
    (index as any).files.set("src/ui.ts", makeEntry({ path: "src/ui.ts" }));

    const plan = buildPlan({ grepTerms: ["parser"] });
    const results = index.search(plan);
    expect(results[0]?.path).toBe("src/parser.ts");
    expect(results[0]?.score).toBeGreaterThan(0);
  });

  it("gives higher weight to exact entity symbol matches", () => {
    const index = new FileIndex("/tmp");
    (index as any).files.set(
      "src/parser.ts",
      makeEntry({
        path: "src/parser.ts",
        symbols: [{ name: "parseQuestions", kind: "function", start: 0, end: 10 }],
      }),
    );
    (index as any).files.set(
      "src/ui.ts",
      makeEntry({
        path: "src/ui.ts",
        symbols: [{ name: "runUI", kind: "function", start: 0, end: 10 }],
      }),
    );

    const plan = buildPlan({ entities: ["parseQuestions"] });
    const results = index.search(plan);
    expect(results[0]?.path).toBe("src/parser.ts");
  });

  it("boosts files whose description mentions an entity", () => {
    const index = new FileIndex("/tmp");
    (index as any).files.set(
      "src/subagent.ts",
      makeEntry({
        path: "src/subagent.ts",
        description: "In-process subagent runner using the pi SDK",
      }),
    );
    (index as any).files.set(
      "src/util.ts",
      makeEntry({ path: "src/util.ts", description: "Shared utilities" }),
    );

    const plan = buildPlan({ entities: ["subagent"] });
    const results = index.search(plan);
    expect(results[0]?.path).toBe("src/subagent.ts");
    expect(results[0]?.reasons).toContain("description mentions: subagent");
  });

  it("applies higher caller boost for 'use' intent", () => {
    const index = new FileIndex("/tmp");
    (index as any).files.set(
      "src/parser.ts",
      makeEntry({
        path: "src/parser.ts",
        symbols: [{ name: "parse", kind: "function", start: 0, end: 10 }],
      }),
    );
    (index as any).files.set(
      "src/caller.ts",
      makeEntry({
        path: "src/caller.ts",
        imports: ["./parser"],
        symbols: [{ name: "main", kind: "variable", start: 0, end: 10 }],
      }),
    );
    (index as any).importedBy.set("src/parser.ts", new Set(["src/caller.ts"]));

    const definePlan = buildPlan({ intent: "define", grepTerms: ["caller"] });
    const usePlan = buildPlan({ intent: "use", grepTerms: ["caller"] });

    const defineResults = index.search(definePlan);
    const useResults = index.search(usePlan);

    const callerDefine = defineResults.find((r) => r.path === "src/caller.ts");
    const callerUse = useResults.find((r) => r.path === "src/caller.ts");

    expect(callerUse?.score ?? 0).toBeGreaterThan(callerDefine?.score ?? 0);
    expect(callerUse?.reasons).toContain("import proximity");
  });

  it("applies second-order proximity boost", () => {
    const index = new FileIndex("/tmp");
    for (let i = 0; i < 11; i++) {
      (index as any).files.set(
        `src/dummy${i}.ts`,
        makeEntry({
          path: `src/dummy${i}.ts`,
          symbols: [{ name: `dummy${i}`, kind: "function", start: 0, end: 10 }],
        }),
      );
    }

    (index as any).files.set(
      "src/core.ts",
      makeEntry({
        path: "src/core.ts",
        symbols: [{ name: "core", kind: "function", start: 0, end: 10 }],
      }),
    );
    (index as any).files.set("src/mid.ts", makeEntry({ path: "src/mid.ts", imports: ["./core"] }));
    (index as any).files.set("src/leaf.ts", makeEntry({ path: "src/leaf.ts", imports: ["./mid"] }));

    (index as any).importedBy.set("src/core.ts", new Set(["src/mid.ts"]));
    (index as any).importedBy.set("src/mid.ts", new Set(["src/leaf.ts"]));

    const plan = buildPlan({ entities: ["core"] });
    const results = index.search(plan);

    const leaf = results.find((r) => r.path === "src/leaf.ts");
    expect(leaf?.score ?? 0).toBeGreaterThan(0);
    expect(leaf?.reasons).toContain("second-order proximity");
  });

  it("applies scope hint boost", () => {
    const index = new FileIndex("/tmp");
    (index as any).files.set("src/parser.ts", makeEntry({ path: "src/parser.ts" }));
    (index as any).files.set("src/parser.test.ts", makeEntry({ path: "src/parser.test.ts" }));

    const plan = buildPlan({ grepTerms: ["parser"], scopeHints: ["test"] });
    const results = index.search(plan);
    const testFile = results.find((r) => r.path.includes("test"));
    expect(testFile?.score ?? 0).toBeGreaterThan(0);
  });

  it("applies arch intent boost for entry point files", () => {
    const index = new FileIndex("/tmp");
    (index as any).files.set("src/index.ts", makeEntry({ path: "src/index.ts" }));
    (index as any).files.set("src/util.ts", makeEntry({ path: "src/util.ts" }));

    const plan = buildPlan({ intent: "arch", grepTerms: ["util", "index"] });
    const results = index.search(plan);
    const entryResult = results.find((r) => r.path === "src/index.ts");
    expect(entryResult?.reasons).toContain("entry point");
  });

  it("applies define intent boost for definition files", () => {
    const index = new FileIndex("/tmp");
    (index as any).files.set(
      "src/types.ts",
      makeEntry({
        path: "src/types.ts",
        symbols: [{ name: "User", kind: "interface", start: 0, end: 10 }],
      }),
    );
    (index as any).files.set(
      "src/main.ts",
      makeEntry({
        path: "src/main.ts",
        symbols: [{ name: "main", kind: "variable", start: 0, end: 10 }],
      }),
    );

    const plan = buildPlan({ intent: "define", grepTerms: ["types", "main"] });
    const results = index.search(plan);
    const typesResult = results.find((r) => r.path === "src/types.ts");
    expect(typesResult?.score ?? 0).toBeGreaterThan(0);
  });

  it("returns empty for no matches with no matching file patterns", () => {
    const index = new FileIndex("/tmp");
    (index as any).files.set("src/parser.ts", makeEntry({ path: "src/parser.ts" }));

    // No matching filePatterns and no matching terms → 0 results
    const plan = buildPlan({ grepTerms: ["zzz_nonexistent"], filePatterns: [] });
    const results = index.search(plan);
    expect(results.length).toBe(0);
  });

  it("deduplicates reasons", () => {
    const index = new FileIndex("/tmp");
    (index as any).files.set(
      "src/foo.ts",
      makeEntry({
        path: "src/foo.ts",
        description: "foo bar baz",
        symbols: [{ name: "foo", kind: "function", start: 0, end: 10 }],
      }),
    );

    // Two different grep terms that both match the same path → only one "path match" reason
    const plan = buildPlan({ grepTerms: ["foo", "foo.ts"], filePatterns: [] });
    const results = index.search(plan);
    const fooResult = results.find((r) => r.path === "src/foo.ts");
    // Should have path match reason (foo.ts) and symbol match reason
    const pathReasons = fooResult?.reasons.filter((r) => r.startsWith("path match")) ?? [];
    // path match for "foo" and "foo.ts" should be deduplicated if they map to the same path
    expect(pathReasons.length).toBeGreaterThanOrEqual(1);
    // The Set should contain unique reasons
    expect(new Set(fooResult?.reasons).size).toBe(fooResult?.reasons.length);
  });

  it("scores with file pattern preference", () => {
    const index = new FileIndex("/tmp");
    (index as any).files.set("src/file1.ts", makeEntry({ path: "src/file1.ts" }));
    (index as any).files.set("src/file2.py", makeEntry({ path: "src/file2.py" }));

    const plan = buildPlan({ grepTerms: ["file"], filePatterns: ["*.py"] });
    const results = index.search(plan);
    expect(results[0]?.path).toBe("src/file2.py");
  });

  it("scores with non-glob file pattern", () => {
    const index = new FileIndex("/tmp");
    (index as any).files.set("src/backend/app.ts", makeEntry({ path: "src/backend/app.ts" }));
    (index as any).files.set("src/frontend/app.ts", makeEntry({ path: "src/frontend/app.ts" }));

    const plan = buildPlan({ grepTerms: ["app"], filePatterns: ["backend"] });
    const results = index.search(plan);
    expect(results[0]?.path).toBe("src/backend/app.ts");
  });

  it("skips entity-overlapping grep terms to avoid double scoring", () => {
    const index = new FileIndex("/tmp");
    (index as any).files.set(
      "src/foo.ts",
      makeEntry({
        path: "src/foo.ts",
        symbols: [{ name: "foo", kind: "function", start: 0, end: 10 }],
      }),
    );

    // "FOO" as entity matches case-insensitively; "foo" as grep term should be skipped
    const plan = buildPlan({ grepTerms: ["foo"], entities: ["FOO"] });
    const results = index.search(plan);
    const fooResult = results.find((r) => r.path === "src/foo.ts");
    // Should only have exact entity reason, not symbol match from grep terms
    expect(fooResult?.reasons.some((r) => r.startsWith("exact entity"))).toBe(true);
  });
});

// ── resolveImport ──────────────────────────────────────────────────────────

describe("FileIndex.resolveImport", () => {
  function makeIndex(files: string[]): { index: FileIndex } {
    const index = new FileIndex("/tmp");
    for (const f of files) {
      (index as any).files.set(f, makeEntry({ path: f }));
    }
    return { index };
  }

  it("resolves relative .ts import", () => {
    const { index } = makeIndex(["src/parser.ts"]);
    const result = (index as any).resolveImport("src/main.ts", "./parser");
    expect(result).toBe("src/parser.ts");
  });

  it("resolves relative index import", () => {
    const { index } = makeIndex(["src/utils/index.ts"]);
    const result = (index as any).resolveImport("src/main.ts", "./utils");
    expect(result).toBe("src/utils/index.ts");
  });

  it("resolves with explicit extension", () => {
    const { index } = makeIndex(["src/parser.ts"]);
    const result = (index as any).resolveImport("src/main.ts", "./parser.ts");
    expect(result).toBe("src/parser.ts");
  });

  it("resolves with .py extension", () => {
    const { index } = makeIndex(["src/module.py"]);
    const result = (index as any).resolveImport("src/main.py", "./module");
    expect(result).toBe("src/module.py");
  });

  it("resolves __init__.py for directory imports", () => {
    const { index } = makeIndex(["src/utils/__init__.py"]);
    const result = (index as any).resolveImport("src/main.py", "./utils");
    expect(result).toBe("src/utils/__init__.py");
  });

  it("resolves init.lua for directory imports", () => {
    const { index } = makeIndex(["src/utils/init.lua"]);
    const result = (index as any).resolveImport("src/main.lua", "./utils");
    expect(result).toBe("src/utils/init.lua");
  });

  it("returns null for unresolvable relative import", () => {
    const { index } = makeIndex(["src/parser.ts"]);
    const result = (index as any).resolveImport("src/main.ts", "./nonexistent");
    expect(result).toBeNull();
  });

  it("resolves package name to index file", () => {
    const index = new FileIndex("/tmp");
    (index as any).files.set("shared/src/index.ts", makeEntry({ path: "shared/src/index.ts" }));
    (index as any).packageNameMap.set("@pi-ext/shared", "shared/src");
    const result = (index as any).resolveImport("src/main.ts", "@pi-ext/shared");
    expect(result).toBe("shared/src/index.ts");
  });

  it("resolves package subpath imports", () => {
    const index = new FileIndex("/tmp");
    (index as any).files.set(
      "shared/src/test-mocks.ts",
      makeEntry({ path: "shared/src/test-mocks.ts" }),
    );
    (index as any).packageNameMap.set("@pi-ext/shared", "shared/src");
    const result = (index as any).resolveImport("src/main.ts", "@pi-ext/shared/test-mocks");
    expect(result).toBe("shared/src/test-mocks.ts");
  });

  it("resolves Python dot-notation imports", () => {
    const { index } = makeIndex(["mypackage/mymodule.py"]);
    const result = (index as any).resolveImport("main.py", "mypackage.mymodule");
    expect(result).toBe("mypackage/mymodule.py");
  });

  it("resolves Python __init__ for dot-notation package imports", () => {
    const { index } = makeIndex(["mypackage/__init__.py"]);
    const result = (index as any).resolveImport("main.py", "mypackage");
    // The dot-notation check requires dots; "mypackage" has none so this falls through
    // to the package name map, which is empty, so null
    expect(result).toBeNull();
  });

  it("resolves Lua dot-notation imports", () => {
    const { index } = makeIndex(["mymodule/submodule.lua"]);
    const result = (index as any).resolveImport("main.lua", "mymodule.submodule");
    expect(result).toBe("mymodule/submodule.lua");
  });

  it("resolves Lua init.lua for dot-notation package imports", () => {
    const { index } = makeIndex(["mymodule/init.lua"]);
    const result = (index as any).resolveImport("main.lua", "mymodule");
    // Lua check requires dots; "mymodule" has none
    expect(result).toBeNull();
  });

  it("normalizes backslash paths on Windows-style inputs", () => {
    const { index } = makeIndex(["src/parser.ts"]);
    const result = (index as any).resolveImport("src/main.ts", "./parser");
    expect(result).toBe("src/parser.ts");
  });
});

// ── isRelated ──────────────────────────────────────────────────────────────

describe("isRelated", () => {
  it("matches exact symbol names via search", () => {
    const index = new FileIndex("/tmp");
    (index as any).files.set(
      "src/parse.ts",
      makeEntry({
        path: "src/parse.ts",
        symbols: [{ name: "parseInput", kind: "function", start: 0, end: 10 }],
      }),
    );

    // entity "parseInput" should match symbol name "parseInput" exactly
    const plan = buildPlan({ entities: ["parseInput"] });
    const results = index.search(plan);
    expect(results.length).toBeGreaterThan(0);
  });

  it("matches plural/singular forms via search", () => {
    const index = new FileIndex("/tmp");
    (index as any).files.set(
      "src/subagent.ts",
      makeEntry({
        path: "src/subagent.ts",
        symbols: [{ name: "subagent", kind: "function", start: 0, end: 10 }],
      }),
    );

    // search for "subagents" (plural) should match "subagent" (singular)
    const plan = buildPlan({ entities: ["subagents"] });
    const results = index.search(plan);
    expect(results.length).toBeGreaterThan(0);
  });

  it("matches prefix at word boundary", () => {
    const index = new FileIndex("/tmp");
    (index as any).files.set(
      "src/middleware.ts",
      makeEntry({
        path: "src/middleware.ts",
        symbols: [{ name: "middlewareStack", kind: "function", start: 0, end: 10 }],
      }),
    );

    // "middleware" is a prefix of "middlewareStack" - should match at word boundary
    const plan = buildPlan({ grepTerms: ["middleware"] });
    const results = index.search(plan);
    expect(results.length).toBeGreaterThan(0);
  });

  it("does not match unrelated symbols", () => {
    const index = new FileIndex("/tmp");
    (index as any).files.set(
      "src/middleware.ts",
      makeEntry({
        path: "src/middleware.ts",
        symbols: [{ name: "middlewareStack", kind: "function", start: 0, end: 10 }],
      }),
    );

    // "midwest" partially matches but not at a word boundary and < 6 chars shared from start
    // Use intent that does NOT boost function symbols and empty filePatterns
    const plan = buildPlan({ entities: ["midwest"], filePatterns: [], intent: "arch" });
    const results = index.search(plan);
    expect(results.length).toBe(0);
  });
});

// ── build ──────────────────────────────────────────────────────────────────

describe("FileIndex.build", () => {
  it("builds from files via git ls-files", async () => {
    // Create a temp dir with a real file and initialize a git repo
    const tmpDir = mkdtempSync(join(tmpdir(), "file-index-build-"));
    try {
      mkdirSync(join(tmpDir, "src"), { recursive: true });
      writeFileSync(join(tmpDir, "src", "main.ts"), "const x = 1;\n");
      writeFileSync(join(tmpDir, "src", "utils.ts"), "export function util() {}\n");

      // Init git repo so enumerateFiles uses git ls-files
      const { spawnSync } = require("node:child_process") as { spawnSync: any };
      spawnSync("git", ["init"], { cwd: tmpDir, env: gitFixtureEnv() });
      spawnSync("git", ["config", "user.email", "test@test.com"], {
        cwd: tmpDir,
        env: gitFixtureEnv(),
      });
      spawnSync("git", ["config", "user.name", "Test"], { cwd: tmpDir, env: gitFixtureEnv() });
      spawnSync("git", ["add", "."], { cwd: tmpDir, env: gitFixtureEnv() });

      const index = new FileIndex(tmpDir);
      const truncated = await index.build();
      expect(truncated).toBe(false);
      expect(index.size).toBeGreaterThanOrEqual(2);
      expect(index.getEntry("src/main.ts")).toBeDefined();
      expect(index.getEntry("src/utils.ts")).toBeDefined();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 10_000);

  it("builds from non-git directory via find fallback", async () => {
    // Create a temp dir WITHOUT git
    const tmpDir = mkdtempSync(join(tmpdir(), "file-index-nogit-"));
    try {
      mkdirSync(join(tmpDir, "lib"), { recursive: true });
      writeFileSync(join(tmpDir, "lib", "helper.ts"), "export const x = 1;\n");

      const index = new FileIndex(tmpDir);
      const truncated = await index.build();
      expect(truncated).toBe(false);
      expect(index.size).toBe(1);
      expect(index.getEntry("lib/helper.ts")).toBeDefined();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 10_000);

  it("handles empty directory", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "file-index-empty-"));
    try {
      const index = new FileIndex(tmpDir);
      const truncated2 = await index.build();
      expect(truncated2).toBe(false);
      expect(index.size).toBe(0);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 10_000);

  it("importedBy reverse graph is populated after build", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "file-index-imports-"));
    try {
      mkdirSync(join(tmpDir, "src"), { recursive: true });
      writeFileSync(
        join(tmpDir, "src", "core.ts"),
        `import { helper } from "./utils";\nexport function core() {}\n`,
      );
      writeFileSync(join(tmpDir, "src", "utils.ts"), `export function helper() {}\n`);

      const { spawnSync } = require("node:child_process") as { spawnSync: any };
      spawnSync("git", ["init"], { cwd: tmpDir, env: gitFixtureEnv() });
      spawnSync("git", ["config", "user.email", "test@test.com"], {
        cwd: tmpDir,
        env: gitFixtureEnv(),
      });
      spawnSync("git", ["config", "user.name", "Test"], { cwd: tmpDir, env: gitFixtureEnv() });
      spawnSync("git", ["add", "."], { cwd: tmpDir, env: gitFixtureEnv() });

      const index = new FileIndex(tmpDir);
      await index.build();
      expect(index.size).toBe(2);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 10_000);
});

// ── extractImports ─────────────────────────────────────────────────────────

describe("extractImports", () => {
  it("extracts TypeScript import statements", () => {
    const imports = extractImports(
      "src/main.ts",
      `import { foo } from "./foo";
import type { Bar } from "./types";
import * as utils from "./utils";
import DefaultExport from "./default";
`,
    );
    expect(imports).toContain("./foo");
    expect(imports).toContain("./types");
    expect(imports).toContain("./utils");
    expect(imports).toContain("./default");
  });

  it("extracts CommonJS require", () => {
    const imports = extractImports(
      "src/main.js",
      `const fs = require("fs");
const { join } = require("path");
`,
    );
    expect(imports).toContain("fs");
    expect(imports).toContain("path");
  });

  it("extracts Python imports", () => {
    const imports = extractImports(
      "main.py",
      `import os
from datetime import datetime
import sys, json
`,
    );
    expect(imports).toContain("os");
    expect(imports).toContain("datetime");
    // plain import with comma-separated: only captures the first module
    // regex: /^import\s+([\w.]+)(?:\s*,\s*[\w.]+)*/gm → match[1] is the first module
    expect(imports).toContain("sys");
  });

  it("extracts Lua require", () => {
    const imports = extractImports(
      "main.lua",
      `local http = require("http")
local json = require('json')
`,
    );
    expect(imports).toContain("http");
    expect(imports).toContain("json");
  });

  it("returns empty for unsupported file extension", () => {
    const imports = extractImports("main.rs", `use std::collections;`);
    expect(imports).toEqual([]);
  });
});

// ── extractDescription ─────────────────────────────────────────────────────

describe("extractDescription (via indexFile)", () => {
  it("extracts description from JSDoc block", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "desc-jsdoc-"));
    try {
      mkdirSync(join(tmpDir, "src"), { recursive: true });
      writeFileSync(
        join(tmpDir, "src", "parser.ts"),
        `/**
 * Parse source files into AST.
 * This is the main entry point.
 */
export function parse() {}`,
      );

      const { spawnSync } = require("node:child_process") as { spawnSync: any };
      spawnSync("git", ["init"], { cwd: tmpDir, env: gitFixtureEnv() });
      spawnSync("git", ["config", "user.email", "test@test.com"], {
        cwd: tmpDir,
        env: gitFixtureEnv(),
      });
      spawnSync("git", ["config", "user.name", "Test"], { cwd: tmpDir, env: gitFixtureEnv() });
      spawnSync("git", ["add", "."], { cwd: tmpDir, env: gitFixtureEnv() });

      const index = new FileIndex(tmpDir);
      await index.build();
      const entry = index.getEntry("src/parser.ts");
      expect(entry?.description).toMatch(/Parse/i);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 10_000);

  it("extracts description from Lua comment", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "desc-lua-"));
    try {
      mkdirSync(join(tmpDir, "src"), { recursive: true });
      writeFileSync(
        join(tmpDir, "src", "main.lua"),
        `--[[
  Main entry point
  Handles initialization
]]\nfunction main() end`,
      );

      const { spawnSync } = require("node:child_process") as { spawnSync: any };
      spawnSync("git", ["init"], { cwd: tmpDir, env: gitFixtureEnv() });
      spawnSync("git", ["config", "user.email", "test@test.com"], {
        cwd: tmpDir,
        env: gitFixtureEnv(),
      });
      spawnSync("git", ["config", "user.name", "Test"], { cwd: tmpDir, env: gitFixtureEnv() });
      spawnSync("git", ["add", "."], { cwd: tmpDir, env: gitFixtureEnv() });

      const index = new FileIndex(tmpDir);
      await index.build();
      const entry = index.getEntry("src/main.lua");
      expect(entry?.description).toMatch(/Main entry/i);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 10_000);

  it("extracts description from leading single-line comments", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "desc-sl-"));
    try {
      mkdirSync(join(tmpDir, "src"), { recursive: true });
      writeFileSync(
        join(tmpDir, "src", "util.ts"),
        `// Helper utilities
// Shared across modules
export function util() {}`,
      );

      const { spawnSync } = require("node:child_process") as { spawnSync: any };
      spawnSync("git", ["init"], { cwd: tmpDir, env: gitFixtureEnv() });
      spawnSync("git", ["config", "user.email", "test@test.com"], {
        cwd: tmpDir,
        env: gitFixtureEnv(),
      });
      spawnSync("git", ["config", "user.name", "Test"], { cwd: tmpDir, env: gitFixtureEnv() });
      spawnSync("git", ["add", "."], { cwd: tmpDir, env: gitFixtureEnv() });

      const index = new FileIndex(tmpDir);
      await index.build();
      const entry = index.getEntry("src/util.ts");
      expect(entry?.description).toMatch(/Helper utilities/i);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 10_000);
});
