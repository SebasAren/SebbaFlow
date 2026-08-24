# Obsidian

Stowed scripts for the personal wiki at `~/Documents/wiki/`, based on [Andrej Karpathy's LLM wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).

## What's Here

| Path                                 | Description                                            |
| ------------------------------------ | ------------------------------------------------------ |
| `.local/bin/wiki-search`             | Hybrid BM25 + vector search CLI with Cohere reranking  |
| `.local/lib/wiki-search/`            | Search engine implementation (BM25, embeddings, cache) |
| `.local/bin/issue`                   | Issue tracker CLI (create, list, move, block, close)   |
| `.local/lib/issue/`                  | Issue tracker implementation                           |
| `.local/lib/wiki-core/`              | Shared frontmatter, I/O, and constants for wiki tools  |
| `Documents/wiki/templates/issue.md`  | Templater template for creating issues from Obsidian   |
| `Documents/wiki/issues-dashboard.md` | Dataview dashboard for issue tracking                  |

## Search Engine (`wiki-search`)

Three search modes:

1. **Hybrid** (default) — BM25 keyword scoring + 4096-dim vector embeddings with configurable alpha blend
2. **BM25-only** — Cached keyword search, no API key needed
3. **Semantic** — Vector-only search for conceptual queries

All modes use cached indexes rebuilt incrementally when the wiki changes. Reranking via `cohere/rerank-4-fast` through OpenRouter.

### Library

| File           | Purpose                                                 |
| -------------- | ------------------------------------------------------- |
| `cli.ts`       | Argument parsing, cache management, mode routing        |
| `search.ts`    | `hybridSearch()`, ripgrep helpers, `rerank()`           |
| `bm25.ts`      | BM25 ranking implementation                             |
| `vector.ts`    | Cosine similarity, embedding API client                 |
| `cache.ts`     | Incremental index builds, staleness detection, manifest |
| `text.ts`      | Markdown stripping, tokenization                        |
| `constants.ts` | Model names, API URLs, tuning parameters                |

## Issue Tracker

File-based issue tracker stored in `~/Documents/wiki/wiki/issues/`. Issues are markdown files with YAML frontmatter (`type`, `status`, `project`, `tags`, `created`, `blocked-by`).

### Entry Points

- **CLI**: `issue new <slug> --project <name>`, `issue list`, `issue move`, `issue block`, `issue close`
- **Obsidian**: Templater template creates issues via hotkey, Dataview dashboard renders status views

### Views (Dataview)

The `issues-dashboard.md` provides: Backlog, In Progress, Done, Blocked, and By Project tables.

## Stow

```bash
stow obsidian    # install
stow -D obsidian # uninstall
```
