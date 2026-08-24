---
name: commit
description: Reflect on session, update rules, commit with git.
---

# Commit with Reflection

Reflect on the session, persist findings as rules if warranted, then commit with git.

## Step 1: Reflect on Findings

Review the session. A finding earns a rule only if it's:

1. **External constraints not visible in code** — env vars, CI quirks, version gates, undocumented SDK shapes
2. **Design decisions whose absence would invite churn** — conventions a future contributor would undo

**Derivability test:** if an agent could learn it by reading one file, it's not a rule. Code is authoritative.

If nothing notable found, skip to Step 4.

Otherwise present findings to user: save all / pick / skip.

## Step 2: Update or Create Rules

Read `.claude/rules/` first. Append to existing file or create new `<slug>.md`:

```markdown
---
description: Short description
---

- Finding 1
- Finding 2
```

For path-scoped rules, add `globs: ["pattern/**/*.ext"]`.

**Rules for rules:**

- One topic per file, bullet points, specific not vague
- Short rules (<300 bytes) merge into broader rules — avoid sprawl
- Rules vs skills: passive gotchas → rules, action-oriented procedures → skills
- File-specific notes → directory `AGENTS.md`, not global rules
- **Prune as you go** — scan for stale entries when editing, delete in same commit
- **No hard-coded counts or inventories** — test totals, extension lists, key lists rot on every addition. Same for README/AGENTS/CONVENTIONS prose updated during the session: point at the authoritative source (`.secrets.tpl`, task lists, catalogs) or approximate ("50+") instead.

**What does NOT belong:** derivable implementation details, ephemeral fix recipes, anything already in AGENTS.md/README.md/CONVENTIONS.md, historical narrative.

## Step 3: Commit

Run `mise run format` (auto-format) and fix any errors, or skip if the user says so.

Generate a conventional commit message from the diff. No shelling out to another LLM. Stage what belongs in this commit and commit it — the pre-commit hook (`.githooks/pre-commit`) runs lint, typecheck, and tests, so the commit only lands if they pass. For selective commits, stage only the specific files.
