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

- `agent start`: pane must be at an interactive shell prompt. Kinds: `pi`, `claude`, `codex`, `gemini`, `cursor`, `devin`, `opencode`, `copilot`, `kimi`, `droid`, `amp`, `grok`, and more (`herdr agent start --help`). Readiness detection is built in — no output-matching needed.
- `agent prompt --wait`: from a non-working state, the agent must start working within 5s of submission or it fails with `agent_prompt_stalled`. Then matches `idle|done|blocked` by default, or exact `--until` states.
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
herdr pane run "$NEW" "npm run dev"
herdr pane wait-output "$NEW" --match "ready" --timeout 30000
herdr pane read "$NEW" --source recent --lines 20
```

### Spawn interactive agent and give it a task

```bash
NEW=$(herdr pane split --current --direction right --no-focus | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])')
herdr agent start worker --kind pi --pane "$NEW"
herdr agent prompt "$NEW" "explore the test setup in src/" --wait --until idle --timeout 300000
herdr agent read "$NEW" --source recent --lines 100
```

### Prompt an existing agent in two steps

```bash
herdr agent prompt w13:p1 "review the test coverage in src/api/"
herdr agent wait w13:p1 --until idle --timeout 300000   # or --until blocked to answer a question
herdr agent read w13:p1 --source recent --lines 100
```

## Notes

- JSON output: `workspace *`, `tab *`, `pane list|get|current|split|layout|process-info|neighbor|edges|wait-output`, `agent list|get|wait|prompt`
- Text output: `pane read`, `agent read` (not JSON; `--ansi` for rendered ANSI snapshot)
- Silent on success: `pane send-text`, `pane send-keys`, `pane run`, `agent send-keys`
- Parse new IDs from `workspace create` (`result.workspace`/`result.tab`/`result.root_pane`), `tab create` (`result.tab`/`result.root_pane`), `pane split` (`result.pane.pane_id`)
- `pane split` pane is optional — positional id, `--pane <ID>`, or `--current`
- Escape key: `herdr pane send-keys w14:p1 esc Enter` — `esc` is canonical; multi-key sends supported
