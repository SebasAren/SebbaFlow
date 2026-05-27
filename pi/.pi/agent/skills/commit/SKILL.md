---
name: commit
description: Reflects on session findings, updates .claude/rules/ if needed, then commits using jj. Use when asked to commit, when the user says "commit", or after completing a set of changes.
---

# Commit with Reflection

Reflect on the session, persist findings as rules if warranted, then commit with jj.

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

**What does NOT belong:** derivable implementation details, ephemeral fix recipes, anything already in AGENTS.md/README.md/CONVENTIONS.md, historical narrative.

## Step 3: Run jj fix

```bash
jj fix
```

If errors, surface them. Fix and re-run, or skip if user says so.

## Step 4: Commit

Generate conventional commit message from `jj diff`. No shelling out to another LLM.

```bash
jj commit -m "<type>(<scope>): <description>"
```

The bash wrapper intercepts `jj commit`/`jj ci` to run pre-commit hooks.

For selective commits:
```bash
jj split --paths <specific-files>
jj commit -m "<message for selected files>"
```
