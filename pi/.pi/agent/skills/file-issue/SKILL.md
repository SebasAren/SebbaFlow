---
name: file-issue
description: Turn a grill-me alignment summary into forge issues (GitHub/GitLab) for supervisor to implement.
---

# File Issue

Convert an alignment summary (from grill-me, or equivalent agreed context) into one or more issues on the repo's forge. Issues are the plan format — no local plan artifacts. Supervisor consumes them later via `/skill:supervisor --gh 12,15` / `--glab 12,15`.

**Do NOT activate** without an agreed plan (run grill-me first if alignment is unclear). Interactive by design: nothing is pushed without user approval.

## Process

### 1. Detect the forge

```bash
git remote -v
```

- `github.com` → `gh`
- `gitlab*` → `glab`
- Ambiguous or neither → ask the user. (A repo's AGENTS.md may pin the forge.)

### 2. Choose granularity

Ask the user (this is the interactive decision point):

- **Single issue** — one detailed issue covering the whole aligned feature.
- **Decompose** — split into N worker-sized issues, each independently implementable and verifiable. Cross-reference ordering constraints in each body's Dependencies line.

### 3. Draft the body/bodies

Template — keep all sections; write "none" if a section is empty:

```markdown
## What we're building

[1–2 sentences, from the alignment summary]

## Key decisions

- [Decision]: [Resolution] — [rationale]

## Design context

**Current state:** [what exists today — files, behavior, constraints]

**Desired state:** [what should exist after this issue lands]

**Patterns:** [existing code to imitate, conventions to follow]

## Steps

- [ ] [Concrete step — real file paths, function names, commands]
- [ ] [...]

## Open questions

Resolve during implementation:

- [ ] [Question + how to decide]

## Dependencies

[Prose only, when ordering matters — e.g. "Implement after the schema migration
issue; touching the same tables." Omit the section entirely if independent.]
```

Steps are **worker guidance**, not enforcement — the verification gate is supervisor's pre-merge hook (`mise run check`). Write steps concrete enough that a fresh worker in a fresh worktree can act on them without re-litigating decisions.

### 4. Render and confirm

Show the user the full body (or all bodies in decompose mode, with their titles). Revise until approved. **Do not push before approval.**

### 5. Ensure the label exists

`issue create` hard-fails on unknown labels, so create first (idempotent — `|| true` swallows the "already exists" error):

```bash
gh label create agent-planned --description "Planned by agent (grill-me alignment)" --color 5319E7 || true
glab label create --name agent-planned --color "#5319E7" --description "Planned by agent (grill-me alignment)" || true
```

### 6. Create the issue(s)

```bash
gh issue create --title "<title>" --body-file /tmp/issue.md --label agent-planned
glab issue create -t "<title>" -d "$(cat /tmp/issue.md)" -l agent-planned
```

In decompose mode: create all issues in dependency order, then report the full list.

### 7. Report

```
| # | Title | Mode |
| - | ----- | ---- |
```

Include the ready-to-paste supervisor invocation, e.g. `/skill:supervisor --gh 12,15`.

## Rules

1. Nothing pushed without explicit user approval.
2. No local staging — the forge is the single source of truth.
3. Dependencies are prose for the supervisor to read, never machine syntax.
4. One concept per issue in decompose mode; each issue must be independently verifiable.
5. Open questions ship as implementation notes, never as blockers.
