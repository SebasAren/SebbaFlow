---
name: commit
description: Reflect on session, update rules, commit with git.
---

# Commit with Reflection

Reflect on the session, persist findings as rules if warranted, then commit with git.

## Step 1: Reflect

Invoke the `/skill:persist-knowledge` skill — it owns the bar (what earns a rule), the rules format, and the write. Skip only if reflection already ran this session (e.g. a supervisor run's end-of-run reflection just persisted, or the user says there's nothing).

If nothing was persisted, skip to Step 2.

## Step 2: Commit

Run `mise run format` (auto-format) and fix any errors, or skip if the user says so.

Generate a conventional commit message from the diff. No shelling out to another LLM. Stage what belongs in this commit and commit it — the pre-commit hook (`.githooks/pre-commit`) runs lint, typecheck, and tests, so the commit only lands if they pass. For selective commits, stage only the specific files. Rules written in Step 1 land in their own atomic commit.
