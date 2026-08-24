# SebbaFlow

[![test](https://github.com/SebasAren/SebbaFlow/actions/workflows/test.yml/badge.svg)](https://github.com/SebasAren/SebbaFlow/actions/workflows/test.yml)
[![GNU Stow](https://img.shields.io/badge/managed%20with-GNU%20Stow-blue)](https://www.gnu.org/software/stow/)
[![mise](https://img.shields.io/badge/runtimes-mise-green)](https://mise.jdx.dev/)
[![Pi Agent](https://img.shields.io/badge/AI-Pi%20Agent%20Extensions-orange)](https://github.com/earendil-works/pi-mono)

Linux workstation config, managed with [GNU Stow](https://www.gnu.org/software/stow/) for symlink-based installation.

Includes [Pi agent extensions](#pi-agent-extensions) that delegate codebase exploration and documentation lookup to cheaper models via subagents, and search past session transcripts between sessions.

## What's Inside

| Directory          | Tool          | Purpose                                                                                                                               |
| ------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `kitty/`           | **Kitty**     | GPU-accelerated terminal + native multiplexer (replaces tmux + Ghostty). Inline images in pi Just Work™ → [details](kitty/README.md)  |
| `herdr/`           | **Herdr**     | Terminal workspace manager for AI coding agents (shell is running inside it). Config only — runtime state stays in `~/.config/herdr/` |
| `pi/`              | **Pi Agent**  | Coding assistant with 9 custom extensions (explore subagent, librarian research subagent, and more)                                   |
| `nvim/`            | Neovim        | Lazy.nvim, 15 LSP servers, blink.cmp AI completion (Codestral + Minuet-AI) → [details](nvim/README.md)                                |
| `tmux/`            | Tmux          | (Legacy) Alt-based keybindings, Tokyo Night theme → [details](tmux/README.md)                                                         |
| `ghostty/`         | Ghostty       | (Legacy) GPU-accelerated terminal. Replaced by Kitty                                                                                  |
| `bashrc/`          | Bash          | Modular shell config: aliases, secrets, fzf, mise                                                                                     |
| `wt/`              | **Worktrunk** | Git worktree CLI — parallel work + agent delegation → [details](wt/AGENTS.md)                                                         |
| `homebrew/`        | Homebrew      | `brew-sync` CLI + Brewfile for personal packages                                                                                      |
| `obsidian/`        | Obsidian      | Wiki search, issue tracker, and wiki maintenance tools                                                                                |
| `bluefin-bashrc/`  | Bash          | Bluefin base `.bashrc` with inlined bling                                                                                             |
| `usage-dashboard/` | Dashboard     | Pi token-usage stats (`pitchfork start usage-dash` → localhost:4813)                                                                  |
| `docs/`            | Astro         | CV site rendering this repo's knowledge files (GitHub Pages)                                                                          |
| `mise/`            | mise          | Global mise config (herdr, pi, pitchfork pins); repo runtimes pinned in `mise.toml`                                                   |

## Prerequisites

- **OS**: Linux (Fedora/RHEL preferred)
- **Shell**: Bash 4+
- **Git**: 2.30+
- **Homebrew** (Linuxbrew): installed to `/home/linuxbrew/.linuxbrew/`

## Quick Setup

### 1. Install runtimes with mise

```bash
mise install
```

This installs Python, Node, Bun, and tooling (ruff, StyLua, shellcheck, prettier) as defined in `mise.toml`. The Lua interpreter and luacheck come from Homebrew (bottled, no compiler needed).

### 2. Stow packages into `~/.config/`

GNU Stow creates symlinks from the repo to your home directory. Each top-level directory is a "package."

```bash
# Install specific tools
stow kitty nvim bashrc

# Install everything
stow */

# Dry run (see what would be linked)
stow -n nvim

# Uninstall a package
stow -D nvim
```

**How it works**: Stow mirrors the directory structure. `nvim/.config/nvim/` gets symlinked to `~/.config/nvim/`, so edits in the repo take effect immediately.

### 3. Set up Neovim

```bash
# Install plugins (headless)
nvim --headless "+Lazy! sync" +qa
```

LSP servers are managed by Mason (`:Mason` in Neovim). The config auto-installs servers on first use.

### 4. Set up shell secrets

Secrets (API keys) are resolved lazily via [Proton Pass CLI](https://proton.me/pass). Install it:

```bash
curl -fsSL https://proton.me/download/pass-cli/install.sh | bash
```

Then create `~/.secrets.tpl` from the template:

```bash
cp bashrc/.secrets.tpl ~/.secrets.tpl
# Edit to add your API keys
```

Secrets are only resolved when tools like `pi` or `nvim` actually need them — not on shell startup.

### 5. Install (legacy) Tmux plugins

On first launch, TPM auto-installs. If it doesn't:

```
prefix + I    # (Ctrl+a, then Shift+i)
```

Note: Kitty is the preferred terminal; tmux is kept for SSH fallback sessions only.

## Pi Agent Extensions

Custom extensions for the [Pi](https://github.com/earendil-works/pi-mono) coding assistant, written in TypeScript/Bun. Each extension is a self-contained module registering tools, commands, and TUI renderers.

> **Full documentation**: [`pi/.pi/README.md`](pi/.pi/README.md)

### Extension Overview

| Extension          | Purpose                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| **explore**        | Subagent-powered codebase reconnaissance with pre-search, file indexing, and semantic reranking |
| **librarian**      | Documentation research subagent (Exa web search + Context7 library docs + session history)      |
| **tdd-tree**       | TDD kickoff point labeling in the session tree                                                  |
| **context7**       | Up-to-date library documentation lookup (internal-only subagent dep)                            |
| **exa-search**     | Web search and page fetch via Exa API (internal-only subagent dep)                              |
| **claude-rules**   | `.claude/rules/` parser with picomatch glob matching                                            |
| **extract-share**  | Extract and share assistant messages as PNG or markdown                                         |
| **usage-tracker**  | Token usage statistics (`/usage`) feeding the usage dashboard                                   |
| **session-memory** | Search/read past session transcripts (internal-only librarian dep)                              |

### Explore Subagent Architecture

The explore extension combines query planning, in-memory file indexing, semantic reranking, and a read-only subagent to answer codebase questions.

```
User query
  │
  ├─► Query Planner ─► intent (define|use|arch|change) + entities + scope hints
  │
  ├─► File Index (LRU-cached, per repo)
  │     ├─ git ls-files → symbol extraction → import graph
  │     └─ Multi-signal heuristic scoring
  │
  ├─► Cohere Reranker (synthetic docs, no raw content)
  │     └─ Tiered results: Highly (≥60%) / Probably (≥30%) / Mentioned (≥10%)
  │
  └─► Subagent (read-only: read, grep, find, ls, bash)
        └─ Structured output: Files Retrieved / Key Code / Summary
```

Supports parallel exploration (up to 4×), scout-then-deepen patterns, and real-time index invalidation on edits.

**Example:**

```
> explore "how does the explore extension build its file index?"

[PRE-SEARCH RESULTS]
Query analysis: arch | entities: explore, extension, index | scope: extensions/explore

## Highly Relevant (read these first)
1. `./explore/index.ts` — score 92% — exact entity: explore
2. `./shared/src/subagent.ts` — score 67% — import proximity

## Summary
The explore extension builds an in-memory file index using `git ls-files`,
extracts symbols via Tree-sitter AST parsing, and builds a reverse import graph
for proximity scoring...
```

See [`pi/.pi/README.md`](pi/.pi/README.md) for the full architecture deep-dive, design decisions, and development guide.

## Architecture Decisions

### Why GNU Stow?

Stow is minimal and transparent — it just creates symlinks. No daemons, no complex state. The directory structure _is_ the config. This means:

- Git tracks everything naturally
- No build step or compilation
- Easy to add/remove packages (`stow -D pkg`)
- Works with any XDG-compliant tool

### Why mise instead of asdf/nvm/pyenv?

[mise](https://mise.jdx.dev/) is a single tool that replaces multiple version managers (nvm, pyenv, rbenv, etc.). It's fast, supports `.tool-versions` compatibility, and has built-in task running (`mise run format-lua`).

### Why Proton Pass for secrets?

Secrets should never be committed to git. Proton Pass CLI provides encrypted secret injection via templates (`~/.secrets.tpl`). The lazy resolution pattern in `.bashrc.d/secrets` means API keys are only fetched when a tool actually needs them, keeping shell startup fast.

### Why subagents for exploration and research?

Running the main model (e.g. Claude) to grep through files burns tokens on output the parent doesn't need to see. The explore and librarian subagents delegate to a cheaper model (configurable via `CHEAP_MODEL`) with a focused toolset, returning a structured summary instead of raw tool output. This keeps the parent's context smaller and cuts token cost on reconnaissance work — the exact savings depend on model choice and query.

## Tool Details

### Neovim

→ **[Full details in `nvim/README.md`](nvim/README.md)**

Lazy.nvim with 15 LSP servers, blink.cmp completion (Codestral + Minuet-AI), conform.nvim formatting, nvim-dap debugging, and neotest testing. Requires Neovim 0.11+.

### Tmux (Legacy)

→ **[Full details in `tmux/README.md`](tmux/README.md)**

Alt-based daily keybindings (no prefix for common ops), vi copy mode with `wl-copy`, Tokyo Night theme.

### Kitty

→ **[Full details in `kitty/README.md`](kitty/README.md)**

GPU-accelerated terminal that replaces both Ghostty and tmux. Provides native tabs/splits (no prefix needed — all Alt-based like tmux), Tokyo Night theme, and **native Kitty Graphics Protocol support** which makes pi inline images work without passthrough hacks.

### Shell (Bash)

Modular config in `bashrc/.bashrc.d/`. Each file handles one concern:

| File      | Purpose                       |
| --------- | ----------------------------- |
| `config`  | Editor, fzf bindings          |
| `alias`   | Short aliases                 |
| `mise`    | Activate mise runtime manager |
| `secrets` | Lazy Proton Pass integration  |
| `fnox`    | fnox reencryption helper      |

### Homebrew

Personal Homebrew packages tracked in a Brewfile, synced between machines via `brew-sync` (stowed to `~/.local/bin/`):

```bash
brew-sync              # export: regenerate Brewfile from installed packages
brew-sync install     # import: install packages from Brewfile
brew-sync full        # both: regenerate + install
```

On Bluefin, system packages from `/usr/share/ublue-os/homebrew/*.Brewfile` are excluded automatically.

## Development

### Linting and Formatting

Run via mise tasks:

```bash
mise run format-lua     # Format Lua with StyLua
mise run lint-lua       # Lint Lua with luacheck
mise run format-python  # Format Python with ruff
mise run lint-python    # Lint Python with ruff
mise run lint-shell     # Lint shell scripts with shellcheck
```

### Testing

The TypeScript surface (Pi agent extensions and standalone CLIs) is covered by 50+ [`bun test`](https://bun.sh/docs/cli/test) files, executed on every push by GitHub Actions (see [`.github/workflows/test.yml`](.github/workflows/test.yml)).

| Location                                                        | Style                                                                                              |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `pi/.pi/agent/extensions/**/*.test.ts`                          | Unit tests co-located with source; `integration.test.ts` per extension covers load/register cycles |
| `pi/.local/bin/tdd-plan.test.ts` + `pi/.local/bin/lib/`         | End-to-end CLI tests via `execSync` against the `tdd-plan` binary                                  |
| `obsidian/.local/lib/wiki-search/wiki-search.test.ts`           | Unit tests with real filesystem fixtures for the `wiki-search` CLI                                 |
| `obsidian/.local/lib/wiki-core/` + `obsidian/.local/lib/issue/` | Unit tests for wiki frontmatter I/O and issue tracker CLI                                          |

`tests/` holds a local-only plenary Lua suite (run via `tests/run.sh`, requires nvim) — not part of `mise run test` or CI.

**Run locally:**

```bash
# Full suite
mise run test

# Individual test groups:
cd pi/.pi/agent/extensions && bun test --parallel
bun test pi/.local/bin/tdd-plan.test.ts
bun test obsidian/.local/lib/wiki-search/wiki-search.test.ts
bun test obsidian/.local/lib/wiki-core/wiki-core.test.ts
bun test obsidian/.local/lib/issue/cli.test.ts
bun test obsidian/.local/lib/issue/issue.test.ts
```

**Mocking conventions**: External SDKs (`exa-js`, `@upstash/context7-sdk`, `@earendil-works/pi-coding-agent`) are mocked via shared factories in `pi/.pi/agent/extensions/shared/src/test-mocks.ts` — tests never hit the network and need no API keys. See `.claude/rules/pi-extensions.md` for the full rationale.

### Pre-commit Checks

Run `mise run pre-commit` before committing — it executes format + lint + typecheck + tests. The version-controlled hook at `.githooks/pre-commit` invokes it via `core.hooksPath` (set by `mise run setup`).

## Repository Structure

```
.
├── pi/.pi/                      # Pi agent
│   ├── agent/extensions/        # 9 custom extensions (+ shared library)
│   └── README.md                # Extension documentation
├── kitty/.config/kitty/         # Kitty (terminal + multiplexer)
│   └── kitty.conf               # Main config
├── herdr/.config/herdr/         # Herdr (terminal workspace manager)
│   └── config.toml              # Main config (single-file link; state stays local)
├── nvim/.config/nvim/           # Neovim
│   ├── lua/config/              # Core config (LSP, keymaps, diagnostics)
│   ├── lua/plugins/             # Plugin specs (Lazy.nvim)
│   └── lsp/                     # Per-server LSP configs
├── tmux/.config/tmux/           # Tmux (legacy)
│   ├── tmux.conf                # Main config
├── ghostty/.config/ghostty/     # Ghostty (legacy)
│   └── config.ghostty           # Ghostty config
├── bashrc/                      # Bash
│   ├── .bashenv                 # Global env vars
│   └── .bashrc.d/               # Modular sourced scripts
├── wt/                         # Worktrunk (wt)
│   ├── AGENTS.md               # Package docs (hooks, stow layout)
│   └── .config/worktrunk/      # wt config (state stays outside repo)
├── homebrew/                    # brew-sync CLI + Brewfile
├── usage-dashboard/             # Pi usage stats dashboard (pitchfork usage-dash)
├── docs/                        # CV site (Astro, GitHub Pages)
├── tests/                       # Local plenary Lua suite (tests/run.sh)
├── mise/.config/mise/           # Global mise config (herdr, pi, pitchfork pins)
├── mise.toml                    # Runtime versions
├── .mise/tasks/                 # mise tasks (pre-commit, format, lint, test, etc.)
├── AGENTS.md                    # Agent-specific guide
└── CONVENTIONS.md               # Development conventions
```

## License

Personal configuration. Use at your own discretion.
