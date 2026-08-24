# Plan: Shared Package for Pi Extensions

## Context

The `explore`, `librarian`, and `wt-worktree` extensions contain identical utility functions and similar subprocess-spawning patterns. This refactoring extracts shared code into a `@pi-ext/shared` package within the existing Bun workspace.

**Benefits:**

- Single source of truth for common utilities
- Easier maintenance (bug fixes in one place)
- Consistent behavior across extensions
- Reduced bundle size (shared code compiled once)

**Constraints:**

- Extensions must remain independently deployable
- No breaking changes to public APIs
- Existing functionality must be preserved

## Architecture

```
pi/.pi/agent/extensions/
├── package.json          # Workspace root
├── shared/               # NEW: Shared package
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts      # Public exports
│       ├── cwd.ts        # resolveRealCwd()
│       ├── format.ts      # formatTokens(), formatUsageLine()
│       ├── markdown.ts    # parseSections(), getSectionSummary()
│       ├── subprocess.ts  # getPiInvocation(), runSubagent()
│       └── types.ts       # Shared interfaces
├── explore/              # Refactored to use shared
├── librarian/            # Refactored to use shared
├── wt-worktree/          # Refactored to use shared
├── exa-search/           # Unchanged (no shared deps)
├── context7/             # Unchanged (no shared deps)
└── claude-rules/         # Unchanged (no shared deps)
```

---

## ~~Step 1: Create shared package structure~~ ✅

**🔴 RED — Write a failing test**

Create a test file `shared/src/cwd.test.ts` that verifies the package can be imported and has the expected exports:

```typescript
// Test imports work correctly
import { resolveRealCwd } from "../src/cwd";

// verify package.json has correct workspace reference
// verify exports are accessible
```

**🟢 GREEN — Make it pass**

1. Create `shared/package.json`:

```json
{
  "name": "@pi-ext/shared",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

2. Create `shared/tsconfig.json` extending base config
3. Create stub `src/index.ts` with temporary `resolveRealCwd` function
4. Add `"shared"` to workspace root `package.json`

**🔵 REFACTOR**

Verify workspace linking works with `bun install`.

---

## ~~Step 2: Extract `resolveRealCwd()`~~ ✅

**🔴 RED — Write a failing test**

```typescript
// cwd.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test";

describe("resolveRealCwd", () => {
  it("returns process.cwd() when no env vars are set", () => {
    // Test that basic case works
  });

  it("returns PI_REAL_CWD when set and exists", () => {
    // Test env var override
  });

  it("returns PWD when realpath fails", () => {
    // Test fallback
  });
});
```

**🟢 GREEN — Make it pass**

Move the actual `resolveRealCwd()` implementation from `explore/index.ts`:

```typescript
// src/cwd.ts
import * as fs from "node:fs";

export function resolveRealCwd(cwd: string): string {
  if (process.env.PI_REAL_CWD && fs.existsSync(process.env.PI_REAL_CWD)) {
    return process.env.PI_REAL_CWD;
  }
  try {
    const real = fs.realpathSync(cwd);
    if (fs.existsSync(real)) return real;
  } catch {
    /* ignore */
  }
  if (process.env.PWD && fs.existsSync(process.env.PWD)) return process.env.PWD;
  return process.cwd();
}
```

**🔵 REFACTOR**

Move tests to cover edge cases. Ensure JSDoc comments are added.

---

## ~~Step 3: Extract `formatTokens()` and `formatUsageLine()`~~ ✅

**🔴 RED — Write a failing test**

```typescript
describe("formatTokens", () => {
  it("returns raw number for < 1000", () => {
    expect(formatTokens(500)).toBe("500");
  });
  it("uses k suffix for thousands", () => {
    expect(formatTokens(1500)).toBe("1.5k");
  });
  it("uses M suffix for millions", () => {
    expect(formatTokens(1500000)).toBe("1.5M");
  });
});

describe("formatUsageLine", () => {
  it("formats turns only", () => {
    const usage = { input: 0, output: 0, turns: 3, cost: 0 };
    expect(formatUsageLine(usage)).toBe("3 turns");
  });
  it("includes cost when present", () => {
    const usage = { input: 1000, output: 500, turns: 1, cost: 0.0015 };
    expect(formatUsageLine(usage)).toContain("$0.0015");
  });
});
```

**🟢 GREEN — Make it pass**

```typescript
// src/format.ts
export function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  return `${(count / 1000000).toFixed(1)}M}`;
}

export function formatUsageLine(
  usage: { input: number; output: number; turns: number; cost: number },
  usedModel?: string,
): string {
  const parts: string[] = [];
  if (usage.turns)
    parts.push(`${usage.turns} turn${usage.turns > 1 ? "s" : ""}`);
  if (usage.input) parts.push(`↑${formatTokens(usage.input)}`);
  if (usage.output) parts.push(`↓${formatTokens(usage.output)}`);
  if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);
  if (usedModel) parts.push(usedModel);
  return parts.join(" ");
}
```

**🔵 REFACTOR**

None needed - implementation is clean.

---

## ~~Step 4: Extract markdown parsing utilities~~ ✅

**🔴 RED — Write a failing test**

```typescript
describe("parseSections", () => {
  it("parses ## Title sections", () => {
    const input = "## Overview\nSome content\n## Details\nMore content";
    const sections = parseSections(input);
    expect(sections).toHaveLength(2);
    expect(sections[0].title).toBe("Overview");
    expect(sections[0].content).toBe("Some content");
  });

  it("handles section without content", () => {
    const input = "## Summary";
    const sections = parseSections(input);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("Summary");
    expect(sections[0].content).toBe("");
  });
});

describe("getSectionSummary", () => {
  it("returns first line truncated to maxLen", () => {
    const content = "First line\nSecond line\nThird line";
    expect(getSectionSummary(content, 20)).toBe("First line…");
  });

  it("returns full first line if within maxLen", () => {
    expect(getSectionSummary("Short", 20)).toBe("Short");
  });
});
```

**🟢 GREEN — Make it pass**

```typescript
// src/markdown.ts
export function parseSections(
  output: string,
): { title: string; content: string }[] {
  const sections: { title: string; content: string }[] = [];
  const parts = output.split(/^## /m);
  for (const part of parts) {
    const newlineIdx = part.indexOf("\n");
    if (newlineIdx === -1) {
      const title = part.trim();
      if (title) sections.push({ title, content: "" });
      continue;
    }
    const title = part.slice(0, newlineIdx).trim();
    const content = part.slice(newlineIdx + 1).trim();
    if (title) sections.push({ title, content });
  }
  return sections;
}

export function getSectionSummary(content: string, maxLen = 100): string {
  const firstLine =
    content
      .split("\n")
      .find((l) => l.trim())
      ?.trim() ?? "";
  if (firstLine.length <= maxLen) return firstLine;
  return firstLine.slice(0, maxLen - 1) + "…";
}
```

**🔵 REFACTOR**

None needed.

---

## ~~Step 5: Extract `getPiInvocation()` and subprocess spawning~~ ✅

**🔴 RED — Write a failing test**

```typescript
describe("getPiInvocation", () => {
  it("returns current script with args when argv[1] exists", () => {
    // Mock process.argv[1] to a real file
    const result = getPiInvocation(["--mode", "json"]);
    expect(result.command).toBe(process.execPath);
    expect(result.args[1]).toContain("--mode");
  });

  it("returns 'pi' command on generic runtime", () => {
    // Mock execPath to 'node'
    const result = getPiInvocation(["query"]);
    expect(result.command).toBe("pi");
  });
});
```

**🟢 GREEN — Make it pass**

```typescript
// src/subprocess.ts
import * as fs from "node:fs";
import * as path from "node:path";

export function getPiInvocation(args: string[]): {
  command: string;
  args: string[];
} {
  const currentScript = process.argv[1];
  if (currentScript && fs.existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }
  const execName = path.basename(process.execPath).toLowerCase();
  const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
  if (!isGenericRuntime) {
    return { command: process.execPath, args };
  }
  return { command: "pi", args };
}
```

**🔵 REFACTOR**

Add `SpawnOptions` type for consistency.

---

## Step 6: Extract shared types

**🔴 RED — Write a failing test**

```typescript
// types.test.ts
import type { SubagentResult, UsageStats } from "./types";

describe("types", () => {
  it("SubagentResult has all required fields", () => {
    const result: SubagentResult = {
      exitCode: 0,
      output: "",
      stderr: "",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0,
        contextTokens: 0,
        turns: 0,
      },
    };
    expect(result.exitCode).toBeDefined();
  });
});
```

**🟢 GREEN — Make it pass**

```typescript
// src/types.ts
export interface UsageStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens: number;
  turns: number;
}

export interface SubagentResult {
  exitCode: number;
  output: string;
  stderr: string;
  usage: UsageStats;
  model?: string;
  errorMessage?: string;
}

export interface SpawnOptions {
  cwd: string;
  args: string[];
  signal?: AbortSignal;
  timeoutMs?: number;
  systemPrompt?: string;
  onUpdate?: (text: string) => void;
}
```

**🔵 REFACTOR**

Add `extendUsage()` helper to merge usage stats.

---

## ~~Step 7: Export all from index.ts~~ ✅

**🔴 RED — Write a failing test**

```typescript
// index.test.ts
import * as shared from "./index";

describe("index exports", () => {
  it("exports resolveRealCwd", () => {
    expect(typeof shared.resolveRealCwd).toBe("function");
  });
  it("exports formatTokens", () => {
    expect(typeof shared.formatTokens).toBe("function");
  });
  // ... all other exports
});
```

**🟢 GREEN — Make it pass**

```typescript
// src/index.ts
export { resolveRealCwd } from "./cwd";
export { formatTokens, formatUsageLine } from "./format";
export { parseSections, getSectionSummary } from "./markdown";
export { getPiInvocation } from "./subprocess";
export type { SubagentResult, UsageStats, SpawnOptions } from "./types";
```

**🔵 REFACTOR**

Re-export from individual files for cleaner public API.

---

## ~~Step 8: Refactor `explore` extension to use shared package~~ ✅

**🔴 RED — Integration test**

Create `explore/integration.test.ts` that imports and uses the extension:

```typescript
import exploreExtension from "./index";

describe("explore extension", () => {
  it("can be loaded without errors", () => {
    // Mock ExtensionAPI and verify registration works
  });
});
```

**🟢 GREEN — Make it pass**

1. Update `explore/package.json` to depend on `shared`:

```json
{
  "dependencies": {
    "@pi-ext/shared": "workspace:*"
  }
}
```

2. Replace local implementations with imports:

```typescript
import {
  resolveRealCwd,
  formatTokens,
  parseSections,
  getSectionSummary,
  formatUsageLine,
  getPiInvocation,
  type SubagentResult,
} from "@pi-ext/shared";
```

3. Remove duplicate function definitions from `explore/index.ts`

**🔵 REFACTOR**

Remove unused imports. Verify no dead code remains.

---

### ~~Step 9: Refactor `librarian` extension to use shared package~~ ✅

**🔴 RED — Integration test**

Similar to Step 8 for librarian.

**🟢 GREEN — Make it pass**

1. Add dependency on `@pi-ext/shared`
2. Replace imports and remove duplicates

**🔵 REFACTOR**

Same as Step 8.

---

### ~~Step 10: Refactor `wt-worktree` extension to use shared package~~ ✅

**🔴 RED — Integration test**

Similar to Step 8 for wt-worktree.

**🟢 GREEN — Make it pass**

1. Add dependency on `@pi-ext/shared`
2. Replace imports and remove duplicates

**🔵 REFACTOR**

Note: `wt-worktree` has additional helpers (`formatDuration`, `execCommand`, `createWorktree`, etc.) that are specific to worktree operations and should remain in the extension.

---

### ~~Step 11: Verify all extensions work~~ ✅

**🔴 RED — Write a failing test**

```bash
# Run all extensions' integration tests
bun test --dir ./shared
bun test --dir ./explore
bun test --dir ./librarian
bun test --dir ./wt-worktree
```

**🟢 GREEN — Make it pass**

Ensure all tests pass. If any fail, debug and fix.

**🔵 REFACTOR**

Clean up any remaining duplication or inconsistencies.

---

## Summary

| Step | Test                            | Implementation                        |
| ---- | ------------------------------- | ------------------------------------- |
| 1    | Package structure tests         | shared/package.json, workspace config |
| 2    | cwd.test.ts                     | resolveRealCwd() in shared/src/cwd.ts |
| 3    | format.test.ts                  | formatTokens(), formatUsageLine()     |
| 4    | markdown.test.ts                | parseSections(), getSectionSummary()  |
| 5    | subprocess.test.ts              | getPiInvocation()                     |
| 6    | types.test.ts                   | TypeScript interfaces                 |
| 7    | index.test.ts                   | Export all from index.ts              |
| 8    | explore/integration.test.ts     | Refactor explore to use shared        |
| 9    | librarian/integration.test.ts   | Refactor librarian to use shared      |
| 10   | wt-worktree/integration.test.ts | Refactor wt-worktree to use shared    |
| 11   | All tests pass                  | Final verification                    |

---

## Progress Log

> This section is maintained by the tdd-implement skill. Do not edit manually.

**Status:** All steps complete ✅ — archived

| Step | 🔴 RED | 🟢 GREEN | 🔵 REFACTOR |
| ---- | ------ | -------- | ----------- |
| 1    | ✅     | ✅       | ✅          |
| 2    | ✅     | ✅       | ✅          |
| 3    | ✅     | ✅       | ✅          |
| 4    | ✅     | ✅       | ✅          |
| 5    | ✅     | ✅       | ✅          |
| 6    | ✅     | ✅       | ✅          |
| 7    | ✅     | ✅       | ✅          |
| 8    | ✅     | ✅       | ✅          |
| 9    | ✅     | ✅       | ✅          |
| 10   | ✅     | ✅       | ✅          |
| 11   | ✅     | ✅       | ✅          |

---

## Notes

- **Bun test runner**: Use `bun test` as the test framework (already available with Bun)
- **Workspace dependencies**: Use `bun add @pi-ext/shared -w <extension>` to add workspace dependencies
- **The `renderCall` pattern**: The component reuse pattern `(context.lastComponent as Text | undefined) ?? new Text(...)` could also be extracted to a shared helper
- **Integration tests**: Since extensions interact with external systems (pi subprocess, APIs), integration tests should mock heavy dependencies where possible
- **Unused functions after refactoring**: `formatDuration()` and `execCommand()` in wt-worktree are specific to worktree ops, keep them there
