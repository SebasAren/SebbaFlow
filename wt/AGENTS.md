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

| Lifecycle   | Command                                              |
| ----------- | ---------------------------------------------------- |
| pre-start   | `mise trust`, `mise run setup`                       |
| post-start  | `wt step copy-ignored`, `wtx up \|\| true`           |
| post-switch | tmux rename-window (inline, no-op outside tmux)      |
| pre-commit  | `mise run pre-commit`                                |
| pre-merge   | `sandbox/.local/bin/wtx check`, `wtx down \|\| true` |

`wtx` (sandbox lifecycle, issue #74) hooks are best-effort (`\|\| true`) — a sandbox failure must never block switching or merging. The pre-merge check is the exception: it is the merge gate itself (in-image `mise run check`, issue #75) and must fail the merge when the sandbox cannot be reached. It invokes `sandbox/.local/bin/wtx` by repo-relative path (wt runs pre-merge hooks with cwd = worktree root), so the gate works from any checkout without a host-side wtx deploy. All exact hook strings need pre-approval before they run non-interactively: run `wt config approvals add --yes` (takes no positional argument — approve interactively, or `--all`); approvals live in the global runtime `~/.config/worktrunk/approvals.toml`. Lifecycle + service docs: `sandbox/README.md`.

## Postmortem: one-time `core.bare` corruption (mechanism removed upstream)

One-time incident: a `wt merge` left the main checkout with `core.bare = true`. Old mechanism was flip-bare → local push → flip back; wt ≥ 0.72 instead moves refs via compare-and-swap `update-ref` (no config write). Verified on 0.74.0 by killing merges mid-flight and racing concurrent merges: zero flips; a staging-weird pre-commit hook aborts mid-pipeline but leaves the main repo untouched.

Cheap insurance after any merge: `git rev-parse --is-bare-repository` must print `false`. If not: `git config core.bare false`, then `git restore --source=HEAD --staged --worktree -- <files changed by the merge>`.
