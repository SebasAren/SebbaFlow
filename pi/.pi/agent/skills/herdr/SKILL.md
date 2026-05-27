---
name: herdr
description: "Control herdr from inside it. Manage workspaces and tabs, split panes, spawn agents, read output, and wait for state changes — all via CLI commands that talk to the running herdr instance over a local unix socket. Use when running inside herdr (HERDR_ENV=1)."
---

# herdr

You are running inside herdr, a terminal-native agent multiplexer. Workspaces contain tabs, tabs contain panes, each pane is a terminal.

**IDs** — workspace: `1`, tab: `1:1`, pane: `1-2`. IDs compact when items close — re-read from `list` commands, don't assume stability.

**Agent status** (`agent_status`): `idle` (alive, at prompt) | `working` (streaming) | `blocked` (waiting on input) | `done` (process exited, output unread) | `unknown`

Key distinction: `idle` = still alive. `done` = process terminated. Use `--status idle` for interactive agents (pi), `--status done` for batch agents (claude scripts).

For raw protocol/API reference, see [`SOCKET_API.md`](./SOCKET_API.md).

## Commands

### Discover

```bash
herdr pane list          # all panes, focused one is yours
herdr workspace list     # all workspaces
```

### Tab management

```bash
herdr tab list --workspace 1
herdr tab create --workspace 1 [--label "logs"]
herdr tab rename 1:2 "logs"
herdr tab focus 1:2
herdr tab close 1:2
```

### Read another pane

```bash
herdr pane read 1-1 --source recent --lines 50
```

Sources: `visible` (viewport), `recent` (scrollback as rendered), `recent-unwrapped` (soft wraps joined — matches what `wait output` sees).

### Split and run

```bash
NEW_PANE=$(herdr pane split 1-2 --direction right --no-focus | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])')
herdr pane run "$NEW_PANE" "npm run dev"
```

Directions: `right`, `down`. `--no-focus` keeps your pane focused.

### Wait for output

```bash
herdr wait output 1-3 --match "ready on port 3000" --timeout 30000
herdr wait output 1-3 --match "server.*ready" --regex --timeout 30000
```

Matching uses unwrapped text — pane width doesn't break matches. Exit code `1` on timeout.

### Wait for agent status

```bash
herdr wait agent-status 1-1 --status idle --timeout 60000   # interactive agent
herdr wait agent-status 1-1 --status done --timeout 60000   # batch agent
```

**Watches for transitions only.** If agent is already in target state, wait hangs. Check `pane list` first if uncertain.

### Send text / keys

```bash
herdr pane send-text 1-1 "hello"
herdr pane send-keys 1-1 Enter
herdr pane run 1-1 "echo hello"    # send-text + Enter
```

### Workspace management

```bash
herdr workspace create --cwd /path/to/project [--label "api server"] [--no-focus]
herdr workspace focus 2
herdr workspace rename 1 "api server"
herdr workspace close 2
```

### Close a pane

```bash
herdr pane close 1-3
```

## Recipes

### Run server, wait for ready

```bash
NEW_PANE=$(herdr pane split 1-2 --direction right --no-focus | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])')
herdr pane run "$NEW_PANE" "npm run dev"
herdr wait output "$NEW_PANE" --match "ready" --timeout 30000
herdr pane read "$NEW_PANE" --source recent --lines 20
```

### Spawn interactive agent (pi) and give task

```bash
herdr pane split 1-2 --direction right --no-focus
# parse new pane id from split response
herdr pane run "$NEW_PANE" "pi"
herdr wait output "$NEW_PANE" --match "pi v" --timeout 30000
herdr pane run "$NEW_PANE" "explore the test setup in src/"
herdr wait agent-status "$NEW_PANE" --status idle --timeout 300000
herdr pane read "$NEW_PANE" --source recent --lines 100
```

### Spawn batch agent (claude)

```bash
herdr pane split 1-2 --direction right --no-focus
herdr pane run 1-3 "claude"
herdr wait output 1-3 --match ">" --timeout 15000
herdr pane run 1-3 "review the test coverage in src/api/"
herdr wait agent-status 1-3 --status done --timeout 300000
herdr pane read 1-3 --source recent --lines 100
```

## Notes

- JSON output: `workspace list`, `workspace create`, `tab list`, `tab create`, `tab get`, `tab focus`, `tab rename`, `tab close`, `pane list`, `pane get`, `pane split`, `wait output`, `wait agent-status`
- Text output: `pane read` (not JSON). Use `--format ansi` or `--ansi` for rendered ANSI snapshot.
- Silent on success: `pane send-text`, `pane send-keys`, `pane run`
- Parse new IDs from `workspace create` (`result.workspace`/`result.tab`/`result.root_pane`), `tab create` (`result.tab`/`result.root_pane`), `pane split` (`result.pane.pane_id`)
- `HERDR_ENV=1` is set when running inside herdr
- Pi startup: match `"pi v"` (early) or `"[Skills]"` (after full load)
