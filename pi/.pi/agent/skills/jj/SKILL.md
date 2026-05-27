---
name: jj
description: Correct patterns for using jj (jujutsu) version control. Load this when you need to create revisions, move between changes, or perform any jj operation. Complements the commit skill (which handles commit-time concerns like message generation and rule reflection).
---

# jj Patterns

## Core Model

No staging area. Every change in the working copy is already part of the current revision (`@`).

`jj new` finalizes the current working copy and opens a fresh empty one on top.

## Anti-Pattern: Empty Commits

**Never run `jj new` followed immediately by `jj commit`.** That produces an empty commit — `jj new` tucks changes into the revision below, then opens a new empty `@`.

| Situation | Command |
|-----------|---------|
| Changes exist, commit them | `jj commit -m "..."` |
| No changes yet, start new work | `jj new -m "..."` |
| Just committed, start next step | `jj new` (no `-m`) |

## Before Running Commands

```bash
jj log -r '@ | @-' --limit 2
jj diff --stat
```

- Changes visible → in `@`. `jj commit` finalizes them.
- `@` empty → `jj commit` does nothing. Use `jj new` or start working.

## Common Operations

```bash
jj log --limit 5                    # view current revision
jj undo                             # undo last operation

# Squash
jj squash                           # @ into @-
jj squash -r <rev>                  # specific rev into parent
jj squash --from <rev>              # move rev's changes into @
jj squash --from <rev> --use-destination-message  # skip editor
jj squash --from <rev> -m "msg"     # new description inline

# Squash a range into one
jj edit <base-revision>
jj squash --from <rev-1>
jj squash --from <rev-2>
jj describe -m "feat(scope): combined"
jj abandon <empty-descendants>

# Edit previous revision
jj edit <revision-id>               # changes go there
jj edit @-                          # back to tip
```

## Relationship to Other Skills

- **commit** — reflection, rules, message generation. Use when user says "commit".
- **jj** (this skill) — mechanics of jj operations.
- **tdd-plan** — calls `jj new` at step start, `jj commit` at step end.
