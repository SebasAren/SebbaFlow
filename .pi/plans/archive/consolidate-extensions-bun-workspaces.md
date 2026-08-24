# Plan: Consolidate Pi Extensions into Bun Workspaces Monorepo

## Context

The 5 pi extensions (`context7`, `exa-search`, `explore`, `librarian`, `claude-rules`) plus standalone `questionnaire.ts` are currently independent npm packages with duplicated `node_modules/` (~900MB total). All share identical devDependencies. The goal is to consolidate into a Bun workspaces monorepo with a single hoisted `node_modules/`, unified `tsconfig.json`, and `bun.lockb`.

**Constraints:**

- Pi auto-discovers extensions at `~/.pi/agent/extensions/*/index.ts` and `~/.pi/agent/extensions/*.ts`
- Pi loads extensions via jiti, which resolves `node_modules/` upward (parent dirs)
- The `"pi": { "extensions": [...] }` field in package.json is used by pi's package system — for local workspace packages it's still needed for discovery
- `questionnaire.ts` is a standalone file with no dependencies — stays at the root level
- `claude-rules` has `picomatch` but NOT the shared pi devDependencies — needs them added

## Architecture

```
~/.pi/agent/extensions/
├── package.json              # Root: workspaces config, shared devDependencies
├── bun.lockb                 # Bun lockfile
├── tsconfig.base.json        # Shared TypeScript config
├── questionnaire.ts          # Standalone (unchanged)
├── claude-rules/
│   ├── package.json          # Workspace package: picomatch + @types/picomatch
│   ├── tsconfig.json         # Extends ../tsconfig.base.json
│   └── index.ts
├── context7/
│   ├── package.json          # Workspace package: @upstash/context7-sdk
│   ├── tsconfig.json         # Extends ../tsconfig.base.json
│   └── index.ts
├── exa-search/
│   ├── package.json          # Workspace package: exa-js
│   ├── tsconfig.json         # Extends ../tsconfig.base.json
│   └── index.ts
├── explore/
│   ├── package.json          # Workspace package (no runtime deps)
│   ├── tsconfig.json         # Extends ../tsconfig.base.json
│   └── index.ts
└── librarian/
    ├── package.json          # Workspace package (no runtime deps)
    ├── tsconfig.json         # Extends ../tsconfig.base.json
    └── index.ts
```

Key design decisions:

- **Shared devDependencies hoisted to root**: `@mariozechner/pi-*`, `@sinclair/typebox`, `@types/node`
- **Runtime deps stay in workspace packages**: `@upstash/context7-sdk`, `exa-js`, `picomatch`
- **`tsconfig.base.json`** at root, each workspace extends it
- **No node_modules inside workspace packages** — all hoisted to root
- **`questionnaire.ts` stays untouched** — no package.json needed (imports resolve from parent)

---

### ~~Step 1: Create shared tsconfig.base.json~~ ✅

**🔴 RED — Verify current state**

```
Confirm that the 5 tsconfig.json files exist and are nearly identical.
Run: grep -c '"target"' */tsconfig.json — should show 5 matches.
This establishes the baseline before change.
```

**🟢 GREEN — Create the file**

```
Create tsconfig.base.json at extensions/ root:
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "types": ["node"]
  }
}
```

**🔵 REFACTOR — Skip**

```
Clean by definition — single new file.
```

---

### ~~Step 2: Update workspace tsconfig.json files to extend base~~ ✅

**🔴 RED — Verify current tsconfigs**

```
For each extension, confirm tsconfig.json exists and has full config:
  cat context7/tsconfig.json — should show full compilerOptions
This confirms the files we're about to change.
```

**🟢 GREEN — Replace each tsconfig.json**

```
For each of the 5 extensions, replace tsconfig.json with:
{
  "extends": "../tsconfig.base.json",
  "include": ["index.ts"]
}
Note: librarian's slightly different config (ES2022 target, outDir) normalizes to the base.
```

**🔵 REFACTOR — Skip**

```
No duplication remains — each file is 4 lines.
```

---

### ~~Step 3: Update workspace package.json files~~ ✅

**🔴 RED — Verify current package.json files**

```
For each extension, confirm package.json exists and lists its dependencies.
Run: cat context7/package.json — should show @upstash/context7-sdk.
This confirms the state before change.
```

**🟢 GREEN — Update each workspace package.json**

```
Remove shared devDependencies from each workspace package.json.
Keep only extension-specific runtime deps.

context7/package.json:
{
  "name": "@pi-ext/context7",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "dependencies": { "@upstash/context7-sdk": "^0.3.0" },
  "pi": { "extensions": ["./index.ts"] }
}

exa-search/package.json:
{
  "name": "@pi-ext/exa-search",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "dependencies": { "exa-js": "^1.0.0" },
  "pi": { "extensions": ["./index.ts"] }
}

explore/package.json:
{
  "name": "@pi-ext/explore",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "pi": { "extensions": ["./index.ts"] }
}

librarian/package.json:
{
  "name": "@pi-ext/librarian",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "pi": { "extensions": ["./index.ts"] }
}

claude-rules/package.json:
{
  "name": "@pi-ext/claude-rules",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "dependencies": { "picomatch": "^4.0.2" },
  "pi": { "extensions": ["./index.ts"] }
}
Note: claude-rules loses @types/picomatch (types come from the package itself in v4).
```

**🔵 REFACTOR — Skip**

```
Each file is minimal — only what's unique to that extension.
```

---

### ~~Step 4: Create root package.json with workspaces~~ ✅

**🔴 RED — Confirm no root package.json exists**

```
Run: ls -la package.json — should fail or show no file.
Confirms clean slate.
```

**🟢 GREEN — Create root package.json**

```
Create extensions/package.json:
{
  "name": "pi-extensions",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "workspaces": [
    "claude-rules",
    "context7",
    "exa-search",
    "explore",
    "librarian"
  ],
  "devDependencies": {
    "@mariozechner/pi-ai": "^0.65.0",
    "@mariozechner/pi-coding-agent": "^0.65.0",
    "@mariozechner/pi-tui": "^0.65.0",
    "@sinclair/typebox": "^0.34.0",
    "@types/node": "^24.0.0"
  }
}
```

**🔵 REFACTOR — Skip**

```
Single new file, no duplication.
```

---

### ~~Step 5: Clean old artifacts and install with Bun~~ ✅

**🔴 RED — Verify current node_modules**

```
Run: du -sh */node_modules — should show 5 directories totaling ~900MB.
Confirms what we're about to remove.
```

**🟢 GREEN — Remove old artifacts and install**

```
1. Remove all per-extension node_modules/ and lock files:
   rm -rf */node_modules */package-lock.json

2. Install with Bun from extensions/ root:
   bun install

3. Verify single root node_modules/ created:
   ls -d node_modules — should exist
   ls */node_modules — should NOT exist (hoisted)
```

**🔵 REFACTOR — Verify deduplication**

```
Run: du -sh node_modules — should be ~200-250MB (down from 900MB).
Run: du -sh . — should be ~250-300MB (down from 900MB).
```

---

### ~~Step 6: Verify all extensions load correctly~~ ✅

**🔴 RED — Smoke test each extension**

```
For each extension, verify TypeScript resolves by checking imports:
  bun run --bun context7/index.ts   (should not crash on imports)
  bun run --bun exa-search/index.ts
  bun run --bun explore/index.ts
  bun run --bun librarian/index.ts
  bun run --bun claude-rules/index.ts

These will fail at runtime (no ExtensionAPI) but should parse and resolve imports.
If import resolution fails, the step fails.
```

**🟢 GREEN — Fix any resolution issues**

```
If any extension fails to resolve imports:
- Check that the dependency is in the root package.json (for shared deps)
- Check that the dependency is in the workspace package.json (for runtime deps)
- Re-run `bun install`
```

**🔵 REFACTOR — Clean up**

```
Remove any stale files:
- package-lock.json files (replaced by bun.lockb)
- Any leftover .npmrc files
```

---

### ~~Step 7: Add .gitignore for bun artifacts~~ ✅

**🔴 RED — Check current .gitignore**

```
Check if extensions/ has a .gitignore or if the repo root covers node_modules.
Run: cat ../../.gitignore (or wherever the repo gitignore is).
If node_modules is already gitignored at repo level, this step may be unnecessary.
```

**🟢 GREEN — Ensure bun.lockb and node_modules are ignored**

```
If needed, add to extensions/.gitignore:
  node_modules/
  bun.lockb
Or verify the repo root .gitignore already covers these.
Note: bun.lockb IS binary and should be committed for reproducibility.
Only node_modules needs to be ignored.
```

**🔵 REFACTOR — Skip**

```

```

---

### ~~Step 8: Integration test — reload pi and verify tools~~ ✅

**🔴 RED — Verify pi picks up all extensions**

```
Start pi with verbose logging or check extension loading:
- Run `/reload` in a pi session
- Check that all 6 extensions are discovered:
  - context7 (2 tools)
  - exa-search (1 tool)
  - explore (1 tool)
  - librarian (1 tool)
  - claude-rules (event handlers)
  - questionnaire (1 tool)
```

**🟢 GREEN — Fix any loading issues**

```
If an extension fails to load:
- Check jiti resolution path (it should walk up to root node_modules/)
- Verify `"extends": "../tsconfig.base.json"` resolves correctly
- Check that `"pi": { "extensions": [...] }` is still present in workspace package.json
```

**🔵 REFACTOR — Final cleanup**

```
- Remove any empty directories
- Verify no stale package-lock.json remains
- Confirm bun.lockb is generated at root
```

---

## Summary

| Step | Test/Verify                                    | Implementation                                        |
| ---- | ---------------------------------------------- | ----------------------------------------------------- |
| 1    | Count current tsconfig files                   | Create `tsconfig.base.json`                           |
| 2    | Verify current full tsconfigs                  | Replace 5 tsconfigs with `extends` references         |
| 3    | Verify current package.json deps               | Strip shared deps from 5 workspace package.json       |
| 4    | Confirm no root package.json                   | Create root `package.json` with workspaces            |
| 5    | Measure current node_modules (900MB)           | `rm -rf */node_modules`, `bun install`, verify ~250MB |
| 6    | `bun run` each extension for import resolution | Fix any resolution issues                             |
| 7    | Check .gitignore coverage                      | Add `node_modules/` to gitignore if needed            |
| 8    | `/reload` in pi, verify 6 extensions load      | Fix any loading issues                                |

## Notes

- **Bun workspaces hoist dependencies** to root `node_modules/` by default, so jiti's upward resolution will find shared deps
- **`questionnaire.ts`** needs no changes — it imports from `@mariozechner/pi-*` which resolve from the root `node_modules/`
- **`claude-rules`** currently lacks `@types/node` — the root devDependencies cover this now
- **`@pi-ext/` scope** prevents name collisions and makes the monorepo structure clear in `bun pm ls`
- **No build step** — pi loads via jiti directly, this change is purely about dependency management
- **Rollback**: if something breaks, restore `package-lock.json` + `node_modules/` per extension via `npm install` in each dir
- **`bun.lockb`** should be committed — it's the reproducible lockfile (binary format, like pnpm-lock.yaml)
- **Disk savings**: ~900MB → ~250MB (roughly 650MB saved from deduplication)

## Progress Log

- [x] Step 1: Create shared tsconfig.base.json — completed (9206efb)
- [x] Step 2: Update workspace tsconfigs to extend base — completed (bbaa1ca)
- [x] Step 3: Update workspace package.json files — completed (e267305)
- [x] Step 4: Create root package.json with workspaces — completed (7d4c847)
- [x] Step 5: Clean old artifacts and install with Bun — completed (59dcd94)
- [x] Step 6: Verify all extensions load correctly — completed (verification only)
- [x] Step 7: Add .gitignore for bun artifacts — completed (already covered)
- [x] Step 8: Integration test — completed (all 6 extensions PASS)
