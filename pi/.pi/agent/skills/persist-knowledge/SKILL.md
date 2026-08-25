---
name: persist-knowledge
description: >
  Gate and persist learnings as rules in .claude/rules/. Use when reflecting on
  a session at commit time, collecting findings after a supervisor run, or
  saving a learning mid-session. Owns the bar for what earns a rule.
---

# Persist Knowledge

Collect findings, gate them against the bar, persist the worthy ones as rules. Input-agnostic — findings may come from a solo session, worker final reports, or the user pointing at a learning.

**Worker guard:** if your prompt declares you a worker in a wt worktree (supervisor run or herdr delegation), stop — you never persist. Surface your findings in your final report; the supervisor gates persistence.

## Step 1: Collect findings

Depending on the caller:

- **Solo session** — review what happened: surprises, workarounds, things that fought back
- **Supervisor run** — worker final reports (findings field) + the supervisor's own observations: merge conflicts, red gates, stalls, tooling races
- **Standalone** — the learning(s) the user pointed at

## Step 2: Apply the bar

A finding earns a rule only if it's:

1. **External constraints not visible in code** — env vars, CI quirks, version gates, undocumented SDK shapes
2. **Design decisions whose absence would invite churn** — conventions a future contributor would undo

**Derivability test:** if an agent could learn it by reading one file, it's not a rule. Code is authoritative.

If nothing passes, say so — done.

## Step 3: Present to user

save all / pick / skip.

## Step 4: Write rules

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

Writes are left uncommitted — the caller's commit flow lands them (the `commit` skill, the supervisor's end-of-run atomic commit, or the user directly).
