---
name: supervisor
description: Fan out parallel tasks to pi workers in wt worktrees via herdr — spawn, babysit, verify, merge serially. Inside herdr only.
---

# Supervisor

Orchestrate up to 3 parallel pi workers, each in its own wt worktree adopted as a herdr workspace. **You (the invoking session) are the supervisor**: you spawn, monitor, resolve conflicts, and merge — serially. Workers never merge.

**Do NOT activate** outside herdr (`HERDR_ENV=1`), or for a single task (just delegate — see the herdr skill's worktree recipe).

## Hard limits

| Rule                                                                                   | Why                                                     |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Max **3** concurrent workers, **one repo** per run (invoking cwd)                      | Shared `.git`; merges serialize                         |
| Workers **never merge** — supervisor owns all merges, one at a time                    | Concurrent merges are the `core.bare` corruption window |
| **Never trust worker self-report** — only `wt merge`'s `pre-merge` verification counts | Structural gate, not agent honesty                      |
| **Never force a merge past a red gate**                                                | A red gate is a failed attempt, not an obstacle         |
| **2 red verifications → park**; **1 bounce** of a blocked question → surface to human  | Token ceiling                                           |
| Auto-land green merges — human reviews the final result                                | Per agreement: verification is the gate                 |

## Worker prompt

The constitution lives in the `/skill:worker` skill — never paste rules inline. Every worker prompt = this preamble + task text:

```
You are a worker in a wt worktree. Load the /skill:worker skill and follow it.
Never run: <repo-specific live-state commands — e.g. dotfiles: stow>.
```

## Input modes

1. **Explicit list** — tasks given at invocation, one worker each.
2. **Forge issues** — `gh issue list` / `glab issue list` (pull titles + bodies into task text; note issue number in the branch slug). Issues created via `/skill:file-issue` fit this mode by design.
3. **Decompose one objective** — split into tasks; each task gets a one-line dependency declaration (`depends: none` / `depends: <task-slug>`). Schedule in dependency order — a worker starts only when its deps are **merged**.

## Lifecycle

### 0. Prereqs (once per repo, interactive)

```bash
wt config approvals add --yes    # hooks must be pre-approved or non-interactive runs fail
herdr integration status         # pi hook current (outdated = misreported agent_status)
```

### 1. Spawn a worker per runnable task

```bash
JSON=$(wt switch --create "$SLUG" --no-cd --format json | tail -1)   # JSON is the LAST stdout line
WT_PATH=$(echo "$JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin)["path"])')
RES=$(herdr worktree open --path "$WT_PATH" --no-focus)
WS=$(echo "$RES" | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["workspace"]["workspace_id"])')
PANE=$(echo "$RES" | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["root_pane"]["pane_id"])')

herdr pane wait-output "$PANE" --match "❯" --source recent-unwrapped --timeout 60000  # shell ready (shell-init race)
herdr agent start "$SLUG" --kind pi --pane "$PANE" -- --approve
herdr agent prompt "$PANE" "<preamble + task text>" --wait --timeout 600000
```

Gotchas (details in the herdr skill): `-- --approve` pre-trusts the fresh worktree; first prompt may fail `agent_prompt_stalled` (cold start) → retry once; default wait states — don't add `--until idle`; `wt` hooks run synchronously (`mise run setup` can take minutes).

### 2. Monitor — keep min(3, runnable queue) busy

- `herdr agent list` to poll; spawn the next runnable task as soon as a worker finishes.
- **Blocked** = the worker is asking a question: `agent read`, answer via `agent prompt --wait`. Bounce once; second block → surface to human.
- Worker finished → its task enters the **merge queue**; note the findings field of its report for step 5.

### 3. Merge — serially, one at a time

```bash
wt -C "$WT_PATH" merge    # pre-merge hook runs mise run check — the only gate
```

- **Green** → squash-merge lands, worktree removed. If the task came from a forge issue, close it with the landed SHA:
  `gh issue close <N> --comment "Landed <sha>"` · GitLab (no close-comment flag): `glab issue note <N> -m "Landed <sha>"` then `glab issue close <N>`.
  Then close the orphaned herdr workspace: `herdr workspace close "$WS"` (parked tasks keep theirs for inspection). Sanity-check the main checkout:
  `git rev-parse --is-bare-repository` must print `false` — if not, see the bare-repo fix in `wt/AGENTS.md`.
- **Red** → failed attempt: prompt the worker to fix (that's attempt 1), re-merge. Still red after **2 attempts** → park: keep worktree + branch, report, move on.
- **Conflict** → the **supervisor** resolves it in the worker's worktree (the worker skill forbids rebase): rebase onto main there via `wt -C "$WT_PATH"` / `git -C`, fix, commit, re-merge (re-verification runs automatically). Escalations: semantic conflict (symbol renamed/moved under the worker's code) → bounce to the worker, it has context; unresolvable → park for human.
- After each merge, report one status line: task, result, branch.

### 4. Report

```markdown
| Task | Worktree | State | Attempts | Result |
| ---- | -------- | ----- | -------- | ------ |
```

States: `working | blocked | queued-merge | parked | merged`. Parked items: path to worktree, how to inspect (`herdr workspace list` → attach), what failed.

### 5. Reflect — persist learnings

The run is incomplete until learnings are persisted or explicitly skipped. Collect:

- **Worker final reports** — the findings field
- **Your own observations** — merge conflicts, red gates, stalls, tooling races

Invoke `/skill:persist-knowledge` (it gates; the user picks). Then land gated rules on main as their own atomic commit — after the last merge, or directly if nothing landed. **Runs even when everything parked**: red gates and stalls are the densest learnings.

Process learnings about supervisor/herdr/wt itself (spawn races, hook timing) go in the final report to the user only — skills are human-authored, never agent-edited.

## Failure modes

- **Parked task** — worktree + branch preserved; scrollback via `herdr agent read`; resumable by prompting the worker again.
- **herdr/wt step fails hard** — do not debug the tooling mid-run; park the task, surface the error, continue other workers.

## Usage

```
/skill:supervisor "task A" "task B" "task C"    # explicit tasks
/skill:supervisor --gh 12,15                    # GitHub issues (also: --glab)
/skill:supervisor "implement plan.md"           # decompose (deps required)
```

PR-flow variant (forge landing, auto-merge): `/skill:supervisor-pr`.
