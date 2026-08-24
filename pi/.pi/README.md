# Pi Agent Extensions

Custom extensions for the [Pi](https://github.com/earendil-works/pi-mono) AI coding assistant, written in TypeScript/Bun. Each extension is a self-contained module that registers tools, commands, and TUI renderers into the Pi session.

## Extension Catalog

### Subagent Extensions

These spawn a separate (cheaper/faster) model to handle reconnaissance, research, or knowledge capture — keeping the parent agent focused on the actual task.

| Extension     | Purpose                                                                                    | Config                            |
| ------------- | ------------------------------------------------------------------------------------------ | --------------------------------- |
| **explore**   | Codebase reconnaissance with pre-search, file indexing, and semantic reranking             | `CHEAP_MODEL` env var             |
| **librarian** | Research via Exa web search + Context7 library docs + past session history                  | `EXA_API_KEY`, `CONTEXT7_API_KEY` |

### Research & Documentation

| Extension      | Purpose                                               | Config             |
| -------------- | ----------------------------------------------------- | ------------------ |
| **context7**   | Up-to-date library documentation search and retrieval | `CONTEXT7_API_KEY` |
| **exa-search** | Web search and page content fetching via Exa API      | `EXA_API_KEY`      |

### Knowledge Management

| Extension          | Purpose                                                                            |
| ------------------ | ---------------------------------------------------------------------------------- |
| **session-memory** | `session_search`/`session_read` over past session transcripts (librarian-internal) |

### Workflow & Session

| Extension         | Purpose                                                                           |
| ----------------- | --------------------------------------------------------------------------------- |
| **tdd-tree**      | TDD kickoff point labeling in the session tree for structured plan execution      |
| **extract-share** | Extract assistant messages as PNG or markdown for sharing                         |
| **usage-tracker** | Token usage statistics (`/usage`) feeding the usage dashboard                      |
| **claude-rules**  | `.claude/rules/` parser with picomatch glob matching and path-scoped rule loading |

### Shared Library

| Package    | Purpose                                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| **shared** | `runSubagent()` runner with retry logic, loop detection, budget management, usage tracking; rendering utilities; test mocks |

---

## Explore Subagent — Deep Dive

The explore extension is the most sophisticated subagent in the suite. It performs intelligent codebase reconnaissance before the parent agent even starts reading files.

### How It Works

```
User query  (e.g. "how does the worktree scope extension detect worktree boundaries?")
  │
  ├─► Query Planner
  │     Decomposes natural language into structured intent:
  │     intent: arch | entities: [worktree, scope, extension] | scope hints | file patterns
  │
  ├─► File Index  (LRU-cached per repo, max 5 repos)
  │     ├─ Enumerates files via `git ls-files` (fallback: `find`)
  │     ├─ Extracts symbols, imports, exports, JSDoc descriptions via Tree-sitter AST parsing
  │     ├─ Builds reverse import graph (importedBy)
  │     └─ Multi-signal heuristic scoring:
  │          path match (+2), symbol match (+4-8), entity match (+6-12),
  │          description-entity boost (+4), intent boost (+3-4),
  │          import proximity (+1-4), second-order proximity (+1)
  │
  ├─► Semantic Reranker  (Cohere rerank-v4-fast via OpenRouter)
  │     ├─ Builds synthetic documents: path | description | exports | symbols
  │     │  (no raw file content → avoids import-noise contamination)
  │     └─ Tiers: Highly Relevant (≥60%) / Probably Relevant (≥30%) / Mentioned (≥10%)
  │
  └─► Subagent  (read-only tools: read, grep, find, ls, bash)
        Runs on a cheaper model (configurable via CHEAP_MODEL).
        Structured output: Files Retrieved / Key Code / Summary.
```

### Key Design Decisions

| Decision                                        | Rationale                                                                                                                                                              |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Synthetic documents for reranking               | First 500 chars of source files are mostly imports. Building documents from `path + description + exports + symbols` gives the reranker clean semantic signal.         |
| No snippet injection                            | First 50 lines of TS/JS files are almost always import blocks, biasing the subagent toward wrong initial guesses. The reranker-ordered tier list is sufficient signal. |
| 5-second build cap with truncation warning      | Large repos shouldn't block the pipeline. The cap is surfaced in results so the subagent knows the index may be incomplete.                                            |
| Real-time invalidation on edits                 | When the parent agent edits a file, it's dropped from the index so subsequent explores see fresh data.                                                                 |
| LRU cache bounded at 5 repos                    | Long sessions across many repos don't leak memory.                                                                                                                     |
| Intent precedence: change > use > arch > define | "How is X used?" queries get caller weighting (use), not entry-point boosting (arch).                                                                                  |
| Second-order proximity                          | Files two hops from top matches in the `importedBy` graph get a small boost, surfacing consumer-of-consumer files.                                                     |
| `spawnSync` with array args everywhere          | Eliminates shell metacharacter bugs — no shell escaping needed.                                                                                                        |

### Usage Patterns

```bash
# Parallel exploration (4 simultaneous queries)
explore(query="Neovim LSP configuration", directory="nvim/.config/nvim/lsp/")
explore(query="Shell secret resolution", directory="bashrc/.bashrc.d/")
explore(query="Shell secret resolution", directory="bashrc/.bashrc.d/")
explore(query="Git hook pipeline", directory="scripts/hooks/")

# Scout-then-deepen for large codebases
explore(query="authentication flow", thoroughness="quick")
# → discovers relevant files, then:
explore(query="authentication flow", thoroughness="thorough", files=["auth/handler.ts", "auth/middleware.ts"])
```

---

## Librarian Subagent — Deep Dive

The librarian extension provides external documentation research by spawning a subagent with access to three distinct sources. It keeps raw search results out of the main agent's context window — the subagent consumes them internally and returns only a synthesized answer.

### How It Works

```
User query  (e.g. "how do I use TanStack Query's optimistic updates?")
  │
  ├─► Web Search (Exa)
  │     Searches the web for relevant pages, documentation, and tutorials.
  │     Returns: search results with titles, URLs, and snippets.
  │
  ├─► Library Docs (Context7)
  │     Queries curated library documentation for API references, examples,
  │     changelogs, and migration guides. Can target a specific library.
  │     Returns: structured documentation chunks.
  │
  ├─► Past Sessions (session-memory)
  │     session_search/session_read over rendered transcripts of previous
  │     sessions in the current working directory (live session excluded).
  │     Returns: matches with session handle + message number, transcript ranges.
  │
  └─► Subagent  (tools: web_search, web_fetch, context7_search, context7_docs, session_search, session_read)
        Synthesizes findings from all three sources into a coherent answer.
        Configured with context-appropriate budgets (60 calls / 240s timeout).
        Structured output: Sources / Findings / Open Threads.
```

### Source Selection

| Source        | When it's used                                        | Example queries                                      |
| ------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| Web Search    | General web research, tutorials, blog posts           | "react server components best practices"             |
| Library Docs  | Specific API lookups, migration guides                | "next.js 14 config options"                          |
| Past Sessions | Prior work, decisions, debugging history in this repo | "what did we decide about the session-memory tools?" |

### Key Design Decisions

| Decision                              | Rationale                                                                                                                                                                                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Subagent synthesizes, not parent      | Raw search results are verbose and context-heavy. The subagent consumes them and returns only the relevant synthesized answer.                                                                                                                |
| `noExtensions: true` + explicit paths | Extensions like `herdr-agent-state` could leak idle-detection hooks into the subagent session. Librarian loads only its required extensions explicitly.                                                                                                                 |
| Internal-only extensions              | `exa-search`, `context7`, and `session-memory` register their tools only when loaded by the librarian subagent, using `PI_LIBRARIAN_LOAD` env var gating. See [Internal-Only Extensions docs](extensions/AGENTS.md#internal-only-extensions). |
| Budget tailored to source mix         | 60 max tool calls / 240s timeout — conservatively sized for chaining searches across multiple sources.                                                                                                                                        |

### Usage Patterns

```bash
# Parallel research across different libraries
librarian(query="Lucide icon sizing and customization")
librarian(query="Tailwind CSS v4 container queries")
librarian(query="Framer Motion page transitions")

# Targeted library lookup
librarian(query="useCallback vs useMemo", library="react")

# Focused search
librarian(query="TanStack Query optimistic updates", focus="examples")
librarian(query="Next.js 15 upgrade guide", focus="changelog")
```

---

## When to Use Which: explore vs librarian

| Scenario                                                       | Tool          | Why                                                            |
| -------------------------------------------------------------- | ------------- | -------------------------------------------------------------- |
| Find files, trace dependencies, understand local architecture  | **explore**   | Has file index, syntax-aware reranking, reads local source.    |
| Look up an API, library docs, or best practices                | **librarian** | Has web search and library docs.                                |
| Check if an existing implementation exists in the repo         | **explore**   | Searches actual source files and symbols.                      |
| Research how to use a package or framework                     | **librarian** | Searches docs, examples, and tutorials online.                 |
| Scout a large codebase before editing                          | **explore**   | Scout-then-deepen pattern with `thoroughness="quick"`.         |
| Recall past work, decisions, or debugging history in this repo | **librarian** | Has session_search/session_read under the hood.                |
| Need both local context and external docs                      | **both**      | Call explore + librarian in parallel for independent concerns. |

---

## Architecture

### Shared Subagent Runner

All subagent-based extensions (explore, librarian) use `runSubagent()` from `@pi-ext/shared`, which provides:

- **Retry logic**: Same-model retries with exponential backoff, then fallback to a secondary model
- **Loop detection**: Detects when the subagent repeats the same tool calls
- **Budget management**: Configurable max tool calls and timeout
- **Usage tracking**: Aggregates input/output tokens, cost, context tokens, and turns

### Extension Lifecycle

```
Extension loads
  ├─ pi.registerTool()       → adds tool to agent's available tools
  ├─ pi.registerCommand()    → adds /command to TUI
  └─ pi.on("tool_call")      → subscribes to tool events (e.g. explore invalidation)
```

### Development

```bash
cd pi/.pi/agent/extensions

# Typecheck all extensions
for dir in */; do [ -f "$dir/tsconfig.json" ] && npx tsc --noEmit -p "$dir/tsconfig.json"; done

# Run all tests
bun test --parallel

# Run specific extension tests
bun test --parallel explore/
```

### Adding a New Extension

1. Create directory with `index.ts`, `package.json`, `tsconfig.json`
2. Write tests first (`index.test.ts` or `integration.test.ts`)
3. Implement the extension
4. Add to workspace `package.json` `workspaces` array
5. Verify tests pass and types check