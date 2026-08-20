---
name: herdr
description: "Control herdr from inside it. Manage workspaces, tabs, panes, and agents — split panes, start agents, submit prompts, read output, wait for state changes — all via CLI commands that talk to the running herdr server over a local unix socket. Use when running inside herdr (HERDR_ENV=1)."
---

# herdr

You are running inside herdr, a terminal workspace manager for AI coding agents. Workspaces contain tabs, tabs contain panes, each pane is a terminal. `HERDR_ENV=1` is set when running inside herdr.

**IDs** are stable strings: workspace `w14`, tab `w14:t1`, pane `w14:p1`. Re-read from `list` commands after closing items.

**Agent status** (`agent_status`): `idle` (alive, at prompt) | `working` (streaming) | `blocked` (waiting on input) | `done` (process exited, output unread) | `unknown`

Key distinction: `idle` = still alive. `done` = process terminated. Wait for `idle` with interactive agents (pi), `done` with batch processes.

## Commands

### Discover

```bash
herdr pane current        # your pane (focused:true)
herdr pane list [--workspace w14]
herdr agent list          # all detected agents + status
herdr workspace list
herdr status              # client/server version, protocol
```

### Agents (preferred over raw pane commands for agent work)

```bash
herdr agent start worker --kind pi --pane w15:p1    # start pi in an idle shell pane, waits for readiness
herdr agent prompt w15:p1 "explore the test setup" --wait --until idle --timeout 300000
herdr agent wait w15:p1 --until idle --timeout 60000
herdr agent read w15:p1 --source recent --lines 100
```

- `agent start`: pane must be at an interactive shell prompt — on a fresh pane, gate on the prompt marker yourself first (see shell-init gotcha). Kinds: `pi`, `claude`, `codex`, `gemini`, `cursor`, `devin`, `opencode`, `copilot`, `kimi`, `droid`, `amp`, `grok`, and more (`herdr agent start --help`). Readiness detection is built in — no output-matching needed. Agent CLI args pass through after `--` (e.g. `-- --approve` for pi).
- `agent prompt --wait`: from a non-working state, the agent must start working within 5s of submission or it fails with `agent_prompt_stalled`. Then matches `idle|done|blocked` by default, or exact `--until` states. Avoid `--until idle` here (see fast-turn gotcha below) — the default set already includes idle.
- `agent wait`: state-based, returns immediately if already in a matching state. Default matches `idle|done|blocked`; repeat `--until` for multiple states. Without `--timeout`, waits indefinitely.
- Also: `agent list`, `agent get`, `agent focus`, `agent rename`, `agent send-keys`, `agent attach` (attach to the agent's terminal directly), `agent explain` (debug detection).

### Panes

```bash
herdr pane split --current --direction right --no-focus [--cwd PATH] [--ratio 0.5] [--env KEY=VALUE]
herdr pane run w14:p2 "npm run dev"        # send-text + Enter
herdr pane read w14:p2 --source recent --lines 50
herdr pane wait-output w14:p2 --match "ready on port 3000" --timeout 30000
herdr pane wait-output w14:p2 --regex "server.*ready" --source recent-unwrapped --timeout 30000
herdr pane close w14:p2
herdr pane rename w14:p2 "dev server"
herdr pane focus --current --direction left   # focus a neighbor
herdr pane resize --current --direction left --amount 0.1
herdr pane zoom --current                     # toggle zoom
herdr pane swap --current --direction right
herdr pane move w14:p2 --tab w14:t2           # or --new-tab / --workspace
herdr pane layout | process-info | neighbor | edges
```

**Sources** (read / wait-output): `visible` (viewport), `recent` (scrollback as rendered, default), `recent-unwrapped` (soft wraps joined — safest for matching), `detection` (read only).

`wait-output` searches existing output immediately, then polls. Exit code `1` on timeout.

**Self-match gotcha**: matching searches the full scrollback including echoed command lines. If the match string appears in the command you sent (or in your own pane), it matches instantly. Match on text only the target output produces, or restrict with `--lines`.

### Tabs & workspaces

```bash
herdr tab create --workspace w14 [--label "logs"] [--cwd PATH] [--env KEY=VALUE] [--no-focus]
herdr tab rename w14:t2 "logs"
herdr tab focus w14:t2
herdr tab close w14:t2

herdr workspace create --cwd /path/to/project --label "api server" [--env KEY=VALUE] [--no-focus]
herdr workspace focus w15
herdr workspace rename w14 "api"
herdr workspace close w15
```

### Worktrees, sessions, notifications

```bash
herdr worktree create --cwd /repo --branch feat-x [--label "feat-x"]   # git worktree → new workspace
herdr worktree open --path ../repo-worktrees/feat-x
herdr worktree list
herdr worktree remove --workspace w15 [--force]

herdr session list                 # named persistent sessions
herdr session attach <name>

herdr notification show "Title" --body "text" --position top-right [--sound done|none]
```

For parallel work on repos managed by wt (worktrunk), prefer wt-created worktrees — they get project hooks and the `wt merge` lifecycle. See the delegation recipe below.

### Integrations & raw API

```bash
herdr integration status           # per-agent state hook versions
herdr integration install pi       # install/update the hook (lets herdr track agent status)
herdr api snapshot                 # live session snapshot (JSON)
herdr api schema --json            # bundled protocol schema
```

Keep the pi integration current — outdated hooks misreport `agent_status`. Check with `herdr integration status`.

## Recipes

### Run server, wait for ready

```bash
NEW=$(herdr pane split --current --direction right --no-focus | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])')
herdr pane wait-output "$NEW" --match "❯" --source recent-unwrapped --timeout 30000   # shell ready (see shell-init gotcha)
herdr pane run "$NEW" "npm run dev"
herdr pane wait-output "$NEW" --match "ready" --timeout 30000
herdr pane read "$NEW" --source recent --lines 20
```

### Spawn interactive agent and give it a task

```bash
NEW=$(herdr pane split --current --direction right --no-focus | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])')
herdr pane wait-output "$NEW" --match "❯" --source recent-unwrapped --timeout 30000   # shell ready (see shell-init gotcha)
herdr agent start worker --kind pi --pane "$NEW"
herdr agent prompt "$NEW" "explore the test setup in src/" --wait --timeout 300000
herdr agent read "$NEW" --source recent --lines 100
```

### Prompt an existing agent in two steps

```bash
herdr agent prompt w13:p1 "review the test coverage in src/api/"
herdr agent wait w13:p1 --until idle --timeout 300000   # or --until blocked to answer a question
herdr agent read w13:p1 --source recent --lines 100
```

### Delegate to a helper agent in a wt worktree

Parallel work without leaving your pane. wt creates the worktree (hooks run: trust, setup, copy-ignored), herdr adopts it as a workspace, a pi helper works there, `wt merge` lands the result with verification.

**Prereq (once per repo, interactive):** hooks must be pre-approved or non-interactive switches fail with `Cannot prompt for approval` — `wt config approvals add --yes`.

```bash
# 1. Create worktree, stay in cwd. JSON is the LAST stdout line (hook logs precede it)
JSON=$(wt switch --create feat-x --no-cd --format json | tail -1)
WT_PATH=$(echo "$JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin)["path"])')

# 2. Adopt as unfocused workspace
RES=$(herdr worktree open --path "$WT_PATH" --no-focus)
WS=$(echo "$RES" | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["workspace"]["workspace_id"])')
PANE=$(echo "$RES" | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["root_pane"]["pane_id"])')

# 3. Spawn helper, give task, read result. --approve pre-trusts project-local .pi files:
# a fresh worktree has no saved pi trust decision, and its startup trust dialog blocks prompting
herdr pane wait-output "$PANE" --match "❯" --source recent-unwrapped --timeout 30000  # shell ready (see shell-init gotcha)
herdr agent start helper --kind pi --pane "$PANE" -- --approve
herdr agent prompt "$PANE" "task description..." --wait --timeout 600000
herdr agent read "$PANE" --source recent --lines 100

# 4. After human review, merge from anywhere and clean up (wt -C targets the worktree)
wt -C "$WT_PATH" merge
herdr workspace close "$WS"    # merge.remove already deleted the checkout
```

Gotchas:

- **Shell-init race**: on a freshly created pane (`pane split`, `tab create`, `worktree open`), `agent start` / `pane run` may inject their command before the shell finishes initializing — the keystrokes echo above the MOTD, bash discards them, and the launch hangs at `launch_pending` with a bare prompt. Gate on the prompt marker first: `pane wait-output <pane> --match "❯" --source recent-unwrapped --timeout 30000` (match the last char of your prompt, something the MOTD never prints; new panes can be fully empty for a second or more before any output).
- **Trust dialog stall**: a fresh worktree has no saved pi trust decision, so pi shows its project-trust dialog at startup — while `agent start` already reports ready. The first `agent prompt` then fails `agent_prompt_stalled`. Prevent it with `-- --approve` on `agent start` (trusts project-local files for that run; use only for repos you control). If already stuck, `agent read` the pane and accept the dialog before prompting.
- The first `agent prompt` after `agent start` may fail `agent_prompt_stalled` from a genuine pi cold start (misses the 5s working-state window). Retry once.
- **Fast-turn wait stall**: `agent prompt --wait --until idle` on a turn that finishes quickly stalls for the full `--timeout`, then returns the final state as success. Default states (`idle|done|blocked`) return promptly — prefer them. For exact-state needs, use the two-step pattern (`agent prompt`, then `agent wait --until idle`) — `agent wait` matches immediately if the state is already settled.
- `--wait` blocks the parent; for fire-and-forget, drop `--wait` and poll with `agent wait`, or notify via `herdr notification show "$WS idle"`.
- `blocked` helpers are asking a question — `agent read`, then answer via another `agent prompt`.
- Switch hooks run synchronously (`mise run setup` can take minutes on a fresh worktree).
- Linked worktrees share the main repo's `.git/config`. Tell helpers to never run `git config` (their test identity leaks into your commits — use `git -c` or env vars) and to prefer plain clones under /tmp for isolated experiments.

## Notes

- JSON output: `workspace *`, `tab *`, `pane list|get|current|split|layout|process-info|neighbor|edges|wait-output`, `agent list|get|wait|prompt`
- Text output: `pane read`, `agent read` (not JSON; `--ansi` for rendered ANSI snapshot)
- Silent on success: `pane send-text`, `pane send-keys`, `pane run`, `agent send-keys`
- Parse new IDs from `workspace create` (`result.workspace`/`result.tab`/`result.root_pane`), `tab create` (`result.tab`/`result.root_pane`), `pane split` (`result.pane.pane_id`)
- `pane split` pane is optional — positional id, `--pane <ID>`, or `--current`
- Escape key: `herdr pane send-keys w14:p1 esc Enter` — `esc` is canonical; multi-key sends supported
