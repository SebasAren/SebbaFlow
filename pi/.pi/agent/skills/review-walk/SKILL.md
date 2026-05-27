---
name: review-walk
description: Interactive chunk-by-chunk code review using jj.
---

# Review Walk (Interactive)

Based on [Ben Gesoff's review workflow](https://ben.gesoff.uk/posts/reviewing-large-changes-with-jj/).

## Workflow

### Step 1: Set up

```bash
jj duplicate <target>
jj edit <duplicated-change-id>
jj new --no-edit --insert-before @ -m 'review: <description>'
```

Note both IDs:
- **Review commit** (`@-`) — accumulates approved code
- **Duplicate** (`@`) — unreviewed diff

### Step 2: Chunk the diff

```bash
jj diff --stat
jj diff
jj log -r '@' -T 'description' --no-graph
```

Group into logical chunks by: semantic concern, dependency order, file proximity, risk level. Present the plan, let the user adjust.

### Step 3: Walk through chunks

For each chunk:
1. Read the full files, show the diffs (`jj diff -- <paths>`)
2. Summarize changes, flag issues (bugs, design concerns, edge cases)
3. Ask the user to approve, edit, flag, or skip

On approval:
```bash
# VISUAL=true prevents editor popup when squashing empties @
VISUAL=true jj squash --from @ --to @- -- <file1> <file2>

# Hunk-level:
jj squash -i
```

Show progress:
```bash
jj diff --stat          # remaining
jj show @- --stat       # approved so far
```

### Step 4: Finish

```bash
jj interdiff --from <original-change-id> --to @-
```

Produce summary with: findings, changes made, approved chunks, unreviewed items, verdict.

**Teardown:**
```bash
# No changes made — abandon both
jj abandon --from @- --to @

# Changes made — abandon original, keep review commit
# Never squash review commit into original — both add the same files from scratch,
# which creates a conflict.
jj abandon <original-change-id>
jj abandon @
```

### Pausing

```bash
jj edit main              # pause
jj edit <duplicate-id>    # resume
```

## Usage

```
/skill:review-walk                       # current change
/skill:review-walk main                  # bookmark
/skill:review-walk kowqznzo              # change ID
/skill:review-walk abc::def              # range
```
