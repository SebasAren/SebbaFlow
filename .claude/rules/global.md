---
description: Global project conventions — stow, docs structure, and TypeScript/Bun gotchas
---

## Stow Packages (GNU Stow)

- Files in `tool-name/.config/tool/` are symlinked to `~/.config/tool/`
- Always edit files in the repo, never in the symlink target
- Use conventional commits, atomic changes

## Documentation Structure

**AGENTS.md**: Path-scoped, not monolithic. Root AGENTS.md is minimal (overview, conventions, tool index). Subdirectory AGENTS.md covers path-specific config and gotchas only — no global info duplication.

**README.md**: Human-facing entry point. Include architecture decisions (why, not just what), numbered setup steps, and repo structure tree.

**CONVENTIONS.md**: Source of truth for per-language code style (Lua, Python, Shell, TypeScript). Actionable rules with specific tool commands (e.g., `mise run format-lua`), not vague guidance. Don't duplicate its contents in AGENTS.md or rule files — link to it.

**`pi/.pi/agent/APPEND_SYSTEM.md`**: Personal cross-project workflow only (communication preferences). No repo-specific conventions — those go in `.claude/rules/` or `AGENTS.md`.

## TypeScript / Bun gotchas

These are external constraints not visible in code, kept here because they apply across every Bun script in the repo:

- Use `spawnSync` with array args (no shell escaping needed).
- `Bun.escapeShellArg` is undefined in Bun 1.3.x — pass arrays to `spawnSync` instead.
- `Bun.makeTempDir` does not exist — use `mkdtempSync` from `node:fs`.

## Lua Tooling on Bluefin

- mise's `lua` tool (vfox plugin) **always compiles from source** and needs `gcc` — unavailable on Bluefin. Never add `lua` to `mise.toml`.
- Lua interpreter + luacheck come from Homebrew (bottled, no compiler): `brew install luacheck` — it's in `homebrew/Brewfile`.

## Stow Safety

- Add a `.stowrc` at the repo root with `--target=<home-dir>` and `--ignore=` for non-stowable root files. Prevents accidental `stow */` from pointing to wrong targets.

## Shellcheck in `.bashrc.d`

These files intentionally omit `set -euo pipefail` (they are sourced interactively). All three recurring warning types below have been remediated — keep these patterns in mind for new scripts:

- **SC2155**: `export VAR=$(cmd)` → `VAR=$(cmd); export VAR`
- **SC2162**: `read env_key` → `read -r env_key`
- **SC2054**: `FZF_OPTS=(a,b)` → `FZF_OPTS=(a b)` (arrays use spaces, not commas)
