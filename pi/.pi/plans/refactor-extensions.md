# Refactor Pi Extensions: Extract Shared Code & Split Large Files

## Problem

The `pi/.pi/agent/extensions/` workspace has 8 extensions with ~4,400 lines of code across monolithic `index.ts` files. Key issues:

- **Duplicate subagent runner**: `wt-worktree` has its own 120-line `runSubagent` that duplicates `shared/src/subagent.ts`
- **Identical renderers**: `explore` and `librarian` share ~80 lines of near-identical `renderResult` code
- **Repeated boilerplate**: Every extension repeats `renderCall` patterns, API key checks, and tool registration scaffolding
- **Monolithic files**: 5 extensions exceed 340 lines, mixing schemas, logic, rendering, and registration in one file
- **Underutilized shared package**: Only 3 of 8 extensions import from `@pi-ext/shared`

### Current State

| Extension      | Lines | Uses `shared` | Max line in file |
| -------------- | ----- | ------------- | ---------------- |
| wt-worktree    | 630   | partial       | 630              |
| exa-search     | 606   | no            | 606              |
| librarian      | 384   | yes           | 384              |
| context7       | 384   | no            | 384              |
| fuzzy-edit     | 370   | no            | 370              |
| claude-rules   | 343   | no            | 343              |
| explore        | 281   | yes           | 281              |
| worktree-scope | 205   | no            | 205              |
| shared/src/    | 695   | —             | 368              |

---

## Phase 1: New Shared Modules

### 1.1 `shared/src/rendering.ts` — Subagent Result Renderer

Extract the section-based renderer duplicated between `explore` and `librarian`. Both extensions have ~80 lines of identical `renderResult` logic:

- Parse output into sections via `parseSections()`
- Show streaming/partial state with `⏳` icon
- Expanded view: icon + header + section dividers + markdown content + usage line
- Collapsed view: icon + section summaries (or sentence bullets as fallback) + usage + expand hint

**New exports:**

```ts
/** Renders a subagent tool result with section-based expanded/collapsed views.
 *  Shared by explore, librarian, and any future subagent tools. */
export function renderSubagentResult(
  options: RenderSubagentResultOptions,
): Component;

/** Renders a subagent tool call with model tag and query preview. */
export function renderSubagentCall(
  options: RenderSubagentCallOptions,
): Component;

/** The context.lastComponent reuse pattern used in almost every renderCall. */
export function reuseOrCreateText(context: { lastComponent?: Component }): Text;
```

**Estimated reduction:** ~130 lines removed (80 from librarian + 80 from explore, replaced by ~30 lines of calls).

### 1.2 `shared/src/api-key.ts` — API Key Helper

Extract the pattern used by `exa-search` and `context7`:

```ts
/** Check for an API key, log a warning if missing, return key or undefined. */
export function checkApiKey(name: string, envVar: string): string | undefined;

/** Assert an API key is present, throwing a helpful error if not. */
export function requireApiKey(name: string, envVar: string): string;
```

**Estimated reduction:** ~20 lines across 2 extensions.

### 1.3 Update `shared/src/index.ts`

Add new exports:

```ts
export { checkApiKey, requireApiKey } from "./api-key";
export {
  renderSubagentResult,
  renderSubagentCall,
  reuseOrCreateText,
} from "./rendering";
```

### 1.4 Add `@mariozechner/pi-coding-agent` and `@mariozechner/pi-tui` to shared dependencies

The rendering module needs TUI components and `getMarkdownTheme`. Add these as `peerDependencies` in `shared/package.json` so downstream extensions don't need to import them separately for rendering.

---

## Phase 2: Refactor `wt-worktree` to Use Shared `runSubagent`

### Current Problem

`wt-worktree/index.ts` (630 lines) has a hand-rolled `runSubagent` (~120 lines) that duplicates `shared/src/subagent.ts` logic:

- Process spawning with `getPiInvocation`
- JSONL line parsing for `message_end` events
- Usage accumulation (input, output, cacheRead, cacheWrite, cost, turns)
- Abort signal handling with SIGTERM → SIGKILL escalation
- Timeout handling
- Temp file cleanup in `finally`

### Changes

1. **Delete the local `runSubagent` function** from `wt-worktree/index.ts`
2. **Import `runSubagent` from `@pi-ext/shared`**
3. **Move the `WORKER_SYSTEM_PROMPT` constant** — keep it in wt-worktree (it's domain-specific)
4. **Adjust the call signature** — the shared `runSubagent` takes an options object, so adapt the wt-worktree caller:
   - Pass `systemPrompt: WORKER_SYSTEM_PROMPT`
   - Pass `baseFlags: ["--no-session", "--no-prompt-templates"]` (wt-worktree needs extensions loaded)
   - Pass `timeoutMs: 600_000`
   - Pass `env: { [CHILD_ENV_VAR]: "1" }`
   - Pass `debugLabel: "wt-worktree"`

**What stays in wt-worktree:**

- `generateBranchName()`
- `formatDuration()`
- `execCommand()` (used for wt CLI calls, not pi subprocess)
- `createWorktree()`, `mergeWorktree()`, `removeWorktree()` — wt CLI wrappers
- Tool schema, execute logic, renderCall/renderResult
- The orchestration flow (create → run → merge → cleanup)

**Estimated reduction:** ~120 lines removed.

---

## Phase 3: Split Large Extensions into Module Files

Split each extension >200 lines from a single `index.ts` into a directory structure. The `package.json` `"pi".extensions` entry point changes from `./index.ts` to the new entry.

### Target Structure (each extension)

```
extension-name/
  package.json
  tsconfig.json
  index.ts          # registerTool() wiring + entry point (~50-80 lines)
  tools/
    <tool-name>.ts  # schema + execute logic for one tool
  render.ts         # TUI renderCall/renderResult functions
  utils.ts          # extension-specific helpers (optional)
```

### 3.1 `wt-worktree/` (target: ~430 lines across files, down from 630)

| File        | Contents                                                                                                               | Est. Lines |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- | ---------- |
| `index.ts`  | Extension registration, execute orchestration, entry point                                                             | 180        |
| `wt-cli.ts` | `execCommand()`, `createWorktree()`, `mergeWorktree()`, `removeWorktree()`, `generateBranchName()`, `formatDuration()` | 120        |
| `render.ts` | `renderCall()`, `renderResult()` (collapsed + expanded)                                                                | 130        |

Note: The local `runSubagent` is already removed in Phase 2.

### 3.2 `exa-search/` (target: ~600 lines across files, same total but navigable)

| File            | Contents                                                            | Est. Lines |
| --------------- | ------------------------------------------------------------------- | ---------- |
| `index.ts`      | Extension registration, both tool definitions, command registration | 80         |
| `web-search.ts` | SearchParams schema, execute logic, search-specific helpers         | 180        |
| `web-fetch.ts`  | FetchParams schema, execute logic, fetch-specific helpers           | 180        |
| `render.ts`     | renderCall + renderResult for both tools, shared types              | 160        |

### 3.3 `context7/` (target: ~380 lines across files)

| File        | Contents                                                  | Est. Lines |
| ----------- | --------------------------------------------------------- | ---------- |
| `index.ts`  | Extension registration, client init, command registration | 60         |
| `search.ts` | SearchParams schema, execute logic                        | 120        |
| `docs.ts`   | DocsParams schema, execute logic                          | 120        |
| `render.ts` | renderCall + renderResult for both tools, shared types    | 80         |

### 3.4 `fuzzy-edit/` (target: ~360 lines across files)

| File             | Contents                                                     | Est. Lines |
| ---------------- | ------------------------------------------------------------ | ---------- |
| `index.ts`       | Extension registration, execute with fallback chain          | 80         |
| `fuzzy-match.ts` | `tabFuzzyReplace()`, `lineFuzzyMatch()`, normalize functions | 120        |
| `diff.ts`        | `generateDiff()` with context line logic                     | 100        |
| `schema.ts`      | `editSchema`, `prepareArguments()`                           | 50         |

### 3.5 `claude-rules/` (target: ~330 lines across files)

| File        | Contents                                                                                      | Est. Lines |
| ----------- | --------------------------------------------------------------------------------------------- | ---------- |
| `index.ts`  | Extension registration, event handlers (session_start, before_agent_start, tool_result, etc.) | 80         |
| `parser.ts` | `parseFrontmatter()`, `parseInlineArray()`                                                    | 80         |
| `rules.ts`  | `ClaudeRule` type, `loadRules()`, `findMarkdownFiles()`, `createMatcher()`                    | 100        |
| `types.ts`  | `ClaudeRule` interface                                                                        | 10         |

### 3.6 `explore/` (target: ~260 lines across files)

| File           | Contents                                                        | Est. Lines |
| -------------- | --------------------------------------------------------------- | ---------- |
| `index.ts`     | Extension registration, execute logic, command registration     | 100        |
| `render.ts`    | renderCall + renderResult (using shared `renderSubagentResult`) | 50         |
| `constants.ts` | `EXPLORE_SYSTEM_PROMPT`, `EXPLORE_BASE_FLAGS`                   | 60         |

### 3.7 `librarian/` (target: ~350 lines across files)

| File           | Contents                                                           | Est. Lines |
| -------------- | ------------------------------------------------------------------ | ---------- |
| `index.ts`     | Extension registration, execute logic, command registration        | 100        |
| `render.ts`    | renderCall + renderResult (using shared `renderSubagentResult`)    | 50         |
| `constants.ts` | `LIBRARIAN_SYSTEM_PROMPT`, `LIBRARIAN_BASE_FLAGS`, `CHILD_ENV_VAR` | 80         |

### 3.8 `worktree-scope/` — No changes

At 205 lines it's already a reasonable size. The file is cohesive (detection + scoping + event handling). Leave as-is.

---

## Phase 4: Wire Up Imports & Verify

### 4.1 Update `package.json` entry points

Extensions with new directory structure need `"pi".extensions` pointing to `./index.ts` (unchanged path, but now the entry point is thin).

### 4.2 Update `shared/package.json` dependencies

Add `peerDependencies` for TUI packages needed by the new rendering module:

```json
{
  "peerDependencies": {
    "@mariozechner/pi-coding-agent": "^0.65.0",
    "@mariozechner/pi-tui": "^0.65.0"
  }
}
```

### 4.3 Add missing `shared` dependency to extensions

Extensions that should depend on `shared` after refactoring:

- `exa-search` — if it uses the API key helper
- `context7` — if it uses the API key helper

### 4.4 Verify

- `bun install` — workspace links resolve
- Each extension loads without errors (manual check or `pi --load-extension` test)
- Renderers produce identical output (visual check in TUI)

---

## Execution Order

The phases are ordered by dependency — each builds on the previous:

1. **Phase 1** (shared modules) — no extension changes yet, just new shared code
2. **Phase 2** (wt-worktree refactor) — depends on Phase 1.3 (shared exports)
3. **Phase 3** (file splitting) — depends on Phase 1 (shared rendering) for explore/librarian
4. **Phase 4** (wiring & verification) — final integration check

Within Phase 3, the extensions can be split independently in any order.

### Suggested commit strategy

One commit per phase, or one commit per extension within Phase 3:

```
feat(shared): add rendering, api-key helpers
refactor(wt-worktree): use shared runSubagent
refactor(explore): split into modules, use shared renderer
refactor(librarian): split into modules, use shared renderer
refactor(exa-search): split into modules
refactor(context7): split into modules
refactor(fuzzy-edit): split into modules
refactor(claude-rules): split into modules
chore: update dependencies and entry points
```

---

## Expected Outcome

| Metric                            | Before                    | After                                      |
| --------------------------------- | ------------------------- | ------------------------------------------ |
| Total lines (extensions)          | ~4,400                    | ~4,200 (net -200 from duplication removal) |
| Largest single file               | 630 lines                 | ~180 lines                                 |
| Files >300 lines                  | 5                         | 0                                          |
| Extensions using `@pi-ext/shared` | 3 of 8                    | 5 of 8                                     |
| Duplicated subagent runner        | yes (wt-worktree)         | no                                         |
| Duplicated renderer code          | yes (explore ≈ librarian) | no                                         |
| Max lines per module file         | 630                       | ~180                                       |
