---
name: supervisor-pr
description: Supervisor variant that lands worker output via forge PRs/MRs (gh/glab) with auto-merge. Inside herdr only.
---

# Supervisor — PR flow

Same discipline as supervisor, but workers' work lands on the forge via PR/MR instead of local `wt merge`. Use when you want a forge-native audit trail, or the repo requires review — branch protection is respected via auto-merge.

**Read the _supervisor_ skill first** (your skills index lists its path). Its hard limits, worker rules, Phase 0–2 (prereqs, spawn, monitor), and gotchas apply unchanged. This file defines only the deltas. **Do NOT activate** outside herdr (`HERDR_ENV=1`), for single tasks, or when local landing is wanted (plain supervisor).

## Deltas from supervisor

| Aspect       | supervisor (wt)         | supervisor-pr                                 |
| ------------ | ----------------------- | --------------------------------------------- |
| Landing      | local `wt merge` squash | push + PR/MR + auto-merge on the forge        |
| Gate         | pre-merge hook          | local check pre-push, then CI                 |
| Issues       | closed after merge      | `Closes #N` in PR body; forge closes on merge |
| Merge timing | immediate, serial       | whenever the forge allows (CI + review)       |
| Workers      | commit + report         | same — plus: never touch the forge            |
| Exit         | all merged              | all PRs terminal; worktrees closed            |

## Hard limits (additional)

- **Only the supervisor touches the forge** — push, PR/MR create, auto-merge arm. Workers never run `gh`/`glab`/`git push`.
- **Local gate before push** — run the repo's check in the worktree; if red, the branch never leaves the machine.
- **Watch the first CI verdict before exit** — red → bounce the worker once with the CI log; second red or CI timeout → park. Never trust worker self-report.
- **Branch from local main at spawn** (wt default). Cross-PR interference is the forge's/reviewers' problem, not the supervisor's — do not rebase between open PRs.

## Lifecycle

Phase 0–2 per supervisor, plus:

- **Detect the forge** — `git remote -v`: `github.com` → `gh`, `gitlab*` → `glab`; ambiguous → ask.
- **Auth check** — `gh auth status` / `glab auth status` before spawning.

### 3. Land (replaces `wt merge`)

Per finished worker, serially:

```bash
# 1. Local gate — in the worktree
(cd "$WT_PATH" && mise run check)
# Red → bounce the worker (attempt 1), re-run. Two reds → park (no push).

# 2. Push
git -C "$WT_PATH" push origin HEAD

# 3. Create PR/MR (from the worktree)
(cd "$WT_PATH" && gh pr create --title "<conventional subject>" --body "<summary; 'Closes #N' when task came from an issue>")
(cd "$WT_PATH" && glab mr create --target-branch main -t "<conventional subject>" -d "<summary; 'Closes #N' …>" --yes)

# 4. Arm auto-merge
gh pr merge <N> --auto --squash --delete-branch
glab mr merge <iid> --auto-merge --squash --remove-source-branch --yes
```

- `--auto` erroring usually means an admin hasn't enabled repo auto-merge → try a direct `--squash`; still blocked (protection) → state **`awaiting-review`** — terminal for the run, humans needed.
- **CI verdict** (before exit): `gh pr checks <N> --watch --interval 15` · GitLab: poll `glab ci status --branch <slug>`.
  - **Green** → `armed` (merges as soon as the forge allows; may already have merged).
  - **Red** → bounce the worker once with the CI log; the fix push updates the PR (re-arm if auto-merge was dismissed), re-watch. Second red or timeout → **park**: PR stays open and red, report, move on.
  - **No CI on the repo** → treat `armed` as terminal (CI setup is a separate concern).

### 4. Exit + cleanup

When every task is terminal (`merged | armed | awaiting-review | parked`):

```bash
wt remove <branch>          # per worktree; merged branches deleted, open-PR branches kept (they live on the forge)
herdr workspace close "$WS" # per workspace; parked tasks are already on the forge — nothing to preserve locally
```

Report and **exit — nothing keeps polling**. The forge lands armed PRs; humans review the rest.

```markdown
| Task | PR/MR | State | Result |
| ---- | ----- | ----- | ------ |
```

States: `working | blocked | ci-red (bounced) | parked | awaiting-review | armed | merged`. Parked = red PR open, branch on origin — a future session can pick it up from the branch directly.

## Usage

```
/skill:supervisor-pr --gh 12,15          # forge issues (also: --glab)
/skill:supervisor-pr "task A" "task B"   # explicit tasks
/skill:supervisor-pr "implement plan.md" # decompose
```
