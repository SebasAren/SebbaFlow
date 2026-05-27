---
name: review
description: Read-only code review of jj changes. Analyze a bookmark, change ID, or range, categorize findings, and produce a formatted review — without touching the jj tree. Use when the user says "review", "review this change", "review main..feature", or wants a code review before merging.
---

# Review (Read-Only)

Analyze jj changes and produce categorized findings — no tree manipulation, no brain commits, no side effects.

## When to Activate

- User says "review this", "review <bookmark>", "review <change-id>"
- `/skill:review <arg>` — accepts:
  - A jj bookmark name: `main`, `feature-branch`
  - A change ID (partial or full): `nx`, `kowqznzo`
  - A range: `abc::def`, `main..feature`
- User wants a code review of any local or remote change

**Do NOT activate** for trivial changes (< 5 files, < 50 lines) — just review inline.

## Prerequisites

- `jj` must be installed and the repo must be a jj repo

## Workflow

### Step 1: Resolve the target

Accept any of these formats and resolve to a diff:

```bash
# Bookmark — diff against its parent or merge base
jj diff -r 'bookmark'

# Change ID
jj diff -r 'change-id'

# Range — combined diff
jj diff --from 'A' --to 'B'
```

Also read the commit description(s):

```bash
jj log -r 'bookmark' -T 'description' --no-graph
jj log -r 'change-id' -T 'description' --no-graph
```

### Step 2: Read the diff

```bash
jj diff --stat          # overview
jj diff                 # full diff
```

### Step 3: Review file by file

For each file in the diff, read the full file using the `read` tool for context. Do NOT review from the diff alone.

For each finding, classify:

| Category | Emoji | Meaning |
|----------|-------|---------|
| **Must fix** | 🔴 | Bug, security issue, broken logic, will cause failure |
| **Suggestion** | 🟡 | Better approach, missing edge case, improvement opportunity |
| **Nit** | 🟢 | Style, naming, minor cleanup — discretionary |

For each finding, note:
- **File and line range**
- **What the issue is**
- **Why it matters** (one sentence)
- **Suggested fix** (concrete, not vague)

### Step 4: Produce the review

#### Determine the verdict

| Verdict | When |
|---------|------|
| **Request Changes** | Any 🔴 findings |
| **Comment** | Only 🟡 findings, no 🔴 |
| **Approve** | Only 🟢 findings, or no findings at all |

#### Format

```markdown
## Review: <change description>

**Verdict:** Request Changes / Comment / Approve

**Summary:** <1–2 sentence overview of what this change does and your assessment>

---

### 🔴 Must Fix

**`file.ts:42–55`** — <what>
<why it matters>
```suggestion
<concrete fix>
```

### 🟡 Suggestions

**`file.ts:88`** — <what>
<suggested alternative>

### 🟢 Nits

**`file.ts:12`** — <what>

---

**Files reviewed:** <count>/<total>
```

## Guidelines

- **Read full files, not just diffs.** Context matters. A diff can look correct but be broken in context.
- **Be thorough but not pedantic.** Focus on correctness, edge cases, and maintainability. Don't bikeshed on naming unless it's genuinely confusing.
- **Categorize honestly.** Not everything is 🔴. If it works but could be better, that's 🟡. If it's just style, that's 🟢.
- **Give concrete suggestions.** "Consider a different approach" is useless. Show the code.
- **Respect "I just want to approve this."** If the user wants a quick pass, do a quick pass. Don't force a deep review on a trivial change.

## Usage

```
/skill:review                            # Review current change
/skill:review main                       # Review bookmark against parent
/skill:review kowqznzo                   # Review specific change
/skill:review abc::def                   # Review range of commits
```
