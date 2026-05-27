# AGENTS.md

SebbaFlow — AI-augmented development environment, managed with GNU Stow. For human setup, see [README.md](README.md).

## How Stow Works

Files in `tool-name/.config/tool/` symlink to `~/.config/tool/`. Edit files **in the repo** — changes reflect immediately via symlinks.

```bash
stow nvim tmux bashrc    # install
stow -D nvim              # uninstall
stow -n nvim              # dry-run
stow */                    # install all
```

## Structure

```
nvim/.config/nvim/         # Neovim            → nvim/README.md
bashrc/                    # Bash config        → bashrc/AGENTS.md
tmux/.config/tmux/         # Tmux (deprecated, kept for fallback)
ghostty/.config/ghostty/   # Ghostty (deprecated, kept for fallback)
kitty/.config/kitty/       # Kitty             → kitty/README.md
wt/.config/worktrunk/      # Worktrunk (deprecated, replaced by jj)
jj/.config/jj/             # jj (jujutsu) version control
pi/.pi/                    # Pi agent           → pi/.pi/README.md
homebrew/                  # brew-sync CLI      → homebrew/AGENTS.md
obsidian/                  # Wiki & issue tools  → obsidian/AGENTS.md
bluefin-bashrc/            # Bluefin base bashrc → bluefin-bashrc/AGENTS.md
mise.toml                  # Runtime versions
.mise/tasks/              # Mise tasks (lint, format, check, etc.)
```

Tool directories may have an `AGENTS.md` (path-scoped agent instructions) or a `README.md` (human-facing details with architecture context). Some have both.

## Global Conventions

- **Edit in repo**, never in symlink targets
- **Git**: conventional commits (`feat:`, `fix:`, `chore:`), atomic changes
- **Secrets**: never commit; use `~/.secrets.tpl` with Proton Pass CLI
- **Code style** (Lua, Python, Shell, TypeScript): see [CONVENTIONS.md](CONVENTIONS.md)

## Where to Look

| Task | Location |
|------|----------|
| Neovim plugin | `nvim/.config/nvim/lua/plugins/` |
| Neovim docs | `nvim/README.md` |
| LSP server config | `nvim/.config/nvim/lsp/*.lua` |
| Shell aliases | `bashrc/.bashrc.d/alias` |
| Shell secrets | `bashrc/.bashrc.d/secrets` |
| Tmux config | `tmux/.config/tmux/tmux.conf` (legacy) |
| Tmux docs | `tmux/README.md` (legacy) |
| Kitty config | `kitty/.config/kitty/kitty.conf` |
| Kitty docs | `kitty/README.md` |
| Mise tasks | `.mise/tasks/` |
| Ghostty config | `ghostty/.config/ghostty/config.ghostty` |
| Ghostty docs | `ghostty/README.md` |
| jj config | `jj/.config/jj/config.toml` |
| Pre-commit checks | `.githooks/pre-commit` runs `mise run pre-commit` (via `core.hooksPath`) |
| Quality watchers | `pitchfork.toml` — use `/skill:pitchfork` to check live status |
| Pi extensions | `pi/.pi/agent/extensions/` (see its `AGENTS.md`) |
| Pi extension docs | `pi/.pi/README.md` |
| explore tool (local codebase) | Codebase reconnaissance — files, dependencies, architecture |
| librarian tool (external docs) | Documentation research — web, library docs, personal wiki |
| Tests | `pi/.pi/agent/extensions/**/*.test.ts`, `pi/.local/bin/tdd-plan.test.ts`, `obsidian/.local/lib/wiki-search/wiki-search.test.ts` |
| CI | `.github/workflows/test.yml` |
| Homebrew packages | `homebrew/Brewfile` |
| brew-sync CLI | `homebrew/.local/bin/brew-sync` |

## Tasks (`mise run`)

| Task | What | When |
|------|------|------|
| `mise run setup` | Bootstrap all dependencies | First run, after clone |
| `mise run pre-commit` | Format + lint + typecheck + test | Before committing |
| `mise run format` | Auto-format all code | Standalone formatting |
| `mise run format-check` | Verify formatting (no changes) | CI / pre-merge |
| `mise run lint` | Lint all code (no changes) | Standalone linting |
| `mise run typecheck` | TypeScript type check | Standalone check |
| `mise run test` | Run all tests | Standalone test |
| `mise run check` | Full verification (format-check + lint + typecheck + test) | Pre-merge gate |

Fine-grained tasks are also available: `format-lua`, `format-python`, `format-ts`, `format-check-lua`, `format-check-python`, `format-check-ts`, `lint-lua`, `lint-shell`, `lint-python`, `lint-ts`.
