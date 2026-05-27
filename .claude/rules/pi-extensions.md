---
description: Pi extension development conventions, TDD, and gotchas
globs:
  - "pi/*"
  - "pi/**"
---

## Development Workflow

- **Always typecheck before committing**: `cd pi/.pi/agent/extensions && for dir in */; do [ -f "$dir/tsconfig.json" ] && npx tsc --noEmit -p "$dir/tsconfig.json"; done`
- **Always run tests before committing**: `cd pi/.pi/agent/extensions && bun test --parallel`
- **TDD discipline**: Write failing test first (RED) → minimum fix (GREEN) → refactor → typecheck → commit.

## CLI Gotchas

- **stdin piping = batch mode**: `pi < file` processes the file as a non-interactive batch prompt. Use `pi "@$file"` to include file content while staying interactive.
- **`--print` for non-interactive**: Use `pi -p "prompt"` or `--mode json` for scripted use.
- **No `--max-turns` flag**: Monitor the JSON event stream (`tool_execution_start` events) and kill externally when limits are exceeded.

## Bun / TypeScript Gotchas

- **Bun virtual path handling**: Bun virtualizes `process.cwd()` into `/bunfs/...` which doesn't exist for subprocesses. Pass the real cwd via env var (e.g., `PI_REAL_CWD`).
- **Prefer shared mock factories**: Import from `@pi-ext/shared/test-mocks` (`piTuiMock`, `piTuiRenderMock`, `piCodingAgentMock`, `piCodingAgentThemeMock`, `typeboxMock`) for consistency — each factory covers all exports an extension needs.
- **Two tiers of TUI mock**: Most tests need `piTuiMock` (`.text` access). Rendering tests need `piTuiRenderMock` (working `render()` methods). Use `piCodingAgentThemeMock` for asserting on content without ANSI noise.
- **`type: "text"` literal widening**: TypeScript widens `"text"` to `string` in tool result arrays. Use `type: "text" as const` or declare callback with literal type.
- **`renderResult` callback `details`**: The `details` parameter is typed as `unknown`. Cast with `as any` in the callback when accessing extension-specific fields.
- **`renderResult` callback `result` cast**: The `result` parameter is typed as `AgentToolResult<unknown>` because the SDK's `registerTool` generic parameter `TDetails` defaults to `unknown`. When passing to a typed render function, use `result as unknown as Parameters<typeof renderFn>[0]` (e.g. `renderSearchResult(result as unknown as Parameters<typeof renderSearchResult>[0], state, theme)`). This avoids `any`-typed casts and prevents `@typescript-eslint/no-unsafe-*` lint violations.
- **`@types/bun` required for `tsc`**: Add `"types": ["node", "bun"]` to tsconfig.
- **Exclude test files from tsconfig `include`**: Tests that mock modules can conflict with real types. Bun's test runner doesn't typecheck.
- **Bun parser: trailing commas after class expressions in objects**: `class {}` as an object property value must have a trailing comma. Missing comma reports the error on the _next_ property line, not where the comma is missing, making it hard to spot.

## Extension Architecture

- **`turn_end` message shape**: The `turn_end` event's `message` carries `model`, `errorMessage`, `usage`, and `content` fields not declared in the exported `AgentSessionEvent` types. Define a local `SdkTurnEndMessage` interface (or `any`-cast) to access them safely; do not spread `(msg as any)` across multiple lines.
- **`registerCommand` handlers receive `ExtensionCommandContext`, not `ExtensionContext`**. Command context extends base context with session-tree methods (`navigateTree`, `fork`, `newSession`, `waitForIdle`). Passing `ExtensionContext` as the handler param type causes a compile error when calling `navigateTree` — extract shared navigation logic into a helper typed with `ExtensionCommandContext`.
- **`renderCall` component reuse**: Reuse `context.lastComponent` instead of creating new `Text()` each call — causes duplicate renders. Use the inline pattern `(context.lastComponent as Text | undefined) ?? new Text("", 0, 0)` rather than importing `reuseOrCreateText` from `@pi-ext/shared` — the shared helper's return type can trigger `@typescript-eslint/no-unsafe-*` violations through workspace dependency type resolution.
- **Tool errors must be thrown, not returned**: Never catch errors in `execute()` and return them as text content — the framework treats returned results as successful calls. The model can't distinguish a failed edit from a successful one, which breaks retry logic. Always `throw new Error(...)` and let the framework handle error propagation.
- **OpenRouter image generation: `modalities: ["image"]` only**: Including `"text"` in the modalities array causes a 404 (`No endpoints found that support the requested output modalities: image, text`) because no OpenRouter endpoint supports both output modalities simultaneously.
- **Subagent output formatting**: Explore/librarian subagent thinking is concatenated text, not markdown. Split on sentence boundaries (`. `, `: `, `! `, `? `), not newlines. Use `splitIntoSentences()` from `@pi-ext/shared`.
- **Subagent thinking lacks spaces**: Output often has no space after periods. Use `\s*` (not `\s+`) after `[.!?]` in the regex.
- **Subagent sessions must use `noExtensions: true`**: Loading extensions in a subagent session causes `herdr-agent-state.ts` to register its idle-detection hooks in the subagent, leaking false "idle" state transitions to herdr. Use `noExtensions: true` on `DefaultResourceLoader` and list needed extension paths explicitly in `additionalExtensionPaths` (e.g. `path.join(getAgentDir(), "extensions", "exa-search")`). See explore and librarian for the pattern.
- **`parseSections` always creates ≥1 section**: The `splitIntoSentences` fallback only triggers for truly empty output, not "unstructured" text. Use `## Header` sections to exercise the section code path.
- **`@earendil-works/pi-agent-core`**: Installed as a workspace dependency but considered internal. Prefer importing through `@earendil-works/pi-coding-agent` or create local type aliases if you need types not re-exported.
- **`@pi-ext/shared` workspace dep for integration tests**: Even if production code doesn't import from shared, `integration.test.ts` needs `@pi-ext/shared/test-mocks`. Add `"@pi-ext/shared": "workspace:*"` to `package.json dependencies` or the test will throw `Cannot find module '@pi-ext/shared/test-mocks'`.

## Command-only extensions (fire-and-forget)

- **When the operation is a bookmark, not a conversation topic** — skip tool registration entirely. Register a command (`pi.registerCommand`) that calls `runSubagent` directly inside `ctx.ui.custom()` with `BorderedLoader`. The parent model is never involved, saving a full round-trip of token processing.
- **`ctx.ui.custom()` with `{ overlay: true }` creates a focus-capturing modal, not inline content.** — Passive components (like raw `Image` from `pi-tui`) without a working `handleInput()` will freeze the terminal because the user cannot invoke `done()` to dismiss the overlay. For displaying images, return `{ type: "image", ... }` in the tool result content array instead — the framework renders it inline with proper protocol detection and fallback text, identical to the `read` tool.
- **`ctx.ui.notify()` levels**: Only accepts `"error" | "warning" | "info"` — no `"success"` level exists.
- **Double-token-cost anti-pattern**: `sendUserMessage` → parent model → tool → subagent processes conversation tokens twice with zero caching benefit. The serialized format differs from the cached prefix in the parent session (different content, different position), and the fresh subagent has no cache at all. For fire-and-forget operations, call `runSubagent` directly from the command handler instead.

## exa-js Typing

- **`Status` type gaps**: Lacks `error` field — use `any` cast when accessing `s.error?.tag`.
- **Highlights vs text options**: `HighlightsContentsOptions` uses `numSentences`/`highlightsPerUrl`, NOT `maxCharacters`. Calculate `numSentences = Math.ceil(maxChars / 200)`.

## Test Patterns

- **Unit tests**: Co-locate with source (e.g., `render.test.ts` next to `render.ts`).
- **Integration tests**: `integration.test.ts` per extension — tests full load/register cycle.
- **Shared test utilities**: Import from `@pi-ext/shared/test-mocks`.
- **Auto-discovery runner removed**: No longer using `__tests__/all-extensions.test.ts` — it spawned subprocesses with no timeout and caused cross-workspace resolution issues. Run `bun test --parallel` from `pi/.pi/agent/extensions/` instead.
- **Mock pattern**: `mock.module()` from `bun:test` before importing the module under test.

## Pi Skill Design

- **Split skills by concern** — monolithic skills waste context because the full SKILL.md loads on every invocation. Split into focused skills (e.g., `obsidian-wiki-query`, `obsidian-wiki-ingest`, `obsidian-wiki-maintain`) so each loads only what it needs.
- **Skills vs extensions** — Skills are procedural guides (how to ingest, how to lint). For always-available operations like querying/searching, prefer a CLI tool (`~/.local/bin/wiki-search`) over a skill invocation.
- **CLI tools in skills must be framed as bash commands** — Agents interpret bare tool names (e.g., `use wiki-search "..."`) as native tools they don't have access to and skip them. Always wrap CLI invocations in bash code blocks or explicitly say "via the `bash` tool".

## New Extension Checklist

1. Create directory with `index.ts`, `package.json`, `tsconfig.json`
2. Write tests first (`index.test.ts` or `integration.test.ts`)
3. Implement the extension
4. Add to workspace `package.json` `workspaces` array
5. Verify tests pass and types check

> Explore pre-search architecture (synthetic documents, tier thresholds, index caching, reranker config) is fully documented in [`pi/.pi/README.md`](../../pi/.pi/README.md).

## Internal-Only Extensions (Subagent Dependencies)

**`exa-search`** and **`context7`** are internal-only extensions — their tools (`web_search`/`web_fetch`/`context7_search`/`context7_docs`) are registered only when loaded by the **librarian** subagent session, not by the main agent. This keeps raw search tool results out of the main agent's context window.

**How it works:**
1. Each extension checks `process.env.PI_LIBRARIAN_LOAD` at the top of its default export.
2. If the env var is not set (main agent load), the extension returns early without registering anything.
3. The librarian's session factory sets `PI_LIBRARIAN_LOAD` to a refcounted integer before calling `loader.reload()`, then unsets it in a `finally` block.
4. The refcount supports concurrent librarian calls (up to 4 parallel).

**What stays exposed to the main agent:** `wiki_search`, `wiki_read`, `explore`, `librarian`, and all non-external-source tools.
