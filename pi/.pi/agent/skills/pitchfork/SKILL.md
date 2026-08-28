---
name: pitchfork
description: Query code quality status from pitchfork background watchers (tests, lint, typecheck, format). Use when you want to check if tests pass, code is formatted, or lint is clean — without running checks manually.
---

# Pitchfork Quality Watchers

Background daemons that run code quality checks on file change. Check status instead of running commands manually.

## Commands

```bash
pitchfork list                          # all daemons, status, health
pitchfork logs <daemon> --raw -n 50     # latest output
pitchfork logs --raw -n 30              # all logs at once
pitchfork logs <daemon> --raw --since 5min  # recent only (avoid stale logs)
pitchfork logs <daemon> --raw --grep FAIL   # jump straight to failure lines
pitchfork start --all                   # start all
pitchfork restart <daemon>              # restart stale daemon
pitchfork stop --all                    # stop all
pitchfork logs --clear                  # clear history for fresh session
```

Daemons are defined in `pitchfork.toml` at project root.

## Interpreting Output

**Empty output = clean.** No lines means last run passed.

Otherwise read raw logs directly:

- **Test runners**: `FAIL`/`PASS` summary at bottom
- **Linters**: error count, issues by file
- **Type checkers**: `error TS...` lines
- **Format checkers**: lists files needing formatting

## Workflow

1. Make changes
2. `pitchfork logs <daemon> --raw --since 5min`
3. Fix issues if found (watchers auto re-run on file change)
4. Commit when green

Always use `--since` to avoid stale errors from previous runs. Clear history with `--clear` for fresh sessions.
