# Worktrunk (wt)

Git worktree management: `wt switch --create <branch>` creates a worktree, runs project hooks, and cd's into it. `wt merge` squash-merges back with verification. Agents can delegate work into wt worktrees — see the herdr skill (`pi/.pi/agent/skills/herdr/SKILL.md`).

## Layout & stow

- Config: `wt/.config/worktrunk/` → `~/.config/worktrunk/` (per-file symlinks: `config.toml`, `generate-commit-msg.sh`)
- Runtime state: `approvals.toml` + `approvals.toml.lock` live **only** in `~/.config/worktrunk/` as real files — never in the repo (gitignored as a safety net)
- **Fresh clone gotcha**: `mkdir -p ~/.config/worktrunk` before `stow wt`, or stow whole-dir links would fold runtime state into the repo
- Binary comes from Homebrew (`homebrew/Brewfile`)

## config.toml

```toml
worktree-path = "~/.local/share/worktrees/{{ repo }}/{{ branch | sanitize }}"

[commit.generation]
command = "bash ~/.config/worktrunk/generate-commit-msg.sh"   # pipes wt's prompt to pi

[commit]
stage = "all"

[merge]
squash = true      # Always squash-merge
commit = true      # Auto-commit after squash
rebase = true      # Rebase before merge
remove = true      # Remove worktree after merge
verify = true      # Run verification before merge
ff = true          # Fast-forward when possible
```

Worktrees live under `~/.local/share/worktrees/<repo>/<branch>`, not inside the repo.

## Project hooks (this repo)

Project hook config: `.config/wt.toml` in the repo root. All hook commands must be **pre-approved once** (`wt config approvals add --yes`, interactive) before they run non-interactively — approvals are stored in the global runtime `~/.config/worktrunk/approvals.toml`.

| Lifecycle   | Command                                         |
| ----------- | ----------------------------------------------- |
| pre-start   | `mise trust`, `mise run setup`                  |
| post-start  | `wt step copy-ignored`                          |
| post-switch | tmux rename-window (inline, no-op outside tmux) |
| pre-commit  | `mise run pre-commit`                           |
| pre-merge   | `mise run check`                                |

## Gotcha: `wt merge` can leave the main repo "bare"

Observed (wt 0.74.0): `wt merge` targeting `main` from a linked worktree sets `core.bare = true` on the main `.git/config` (needed to move the checked-out target ref) — if the flip-back is lost (background worktree removal racing), the main checkout stays "bare": `git status` fails with `must be run in a work tree`, the merge lands only the ref (index/worktree keep pre-merge content).

Fix: `git config core.bare false`, then `git restore --source=HEAD --staged --worktree -- <files changed by the merge>`. Check after any `wt merge`: `git rev-parse --is-bare-repository` must print `false`.
