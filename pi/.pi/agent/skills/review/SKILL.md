---
name: review
description: Read-only code review of git changes.
---

# Review (Read-Only)

Analyze git changes and produce categorized findings. No tree manipulation, no side effects.

**Do NOT activate** for trivial changes (< 5 files, < 50 lines) — just review inline.

## Workflow

### Step 1: Resolve target

Resolve what to review: a branch tip, a commit, or a range between commits. For uncommitted work, review the working-tree diff (staged + unstaged).

### Step 2: Read the diff

Get the diff (stat first, then full). For a commit, include its commit message/description.

### Step 3: Review file by file

Read full files with `read` tool — do NOT review from diffs alone.

Classify each finding:

| Category       | Emoji | Meaning                            |
| -------------- | ----- | ---------------------------------- |
| **Must fix**   | 🔴    | Bug, security issue, broken logic  |
| **Suggestion** | 🟡    | Better approach, missing edge case |
| **Nit**        | 🟢    | Style, naming, minor cleanup       |

For each: file/line range, what, why (one sentence), concrete fix.

### Step 4: Produce review

**Verdict:** Request Changes (any 🔴) | Comment (only 🟡) | Approve (only 🟢 or none)

````markdown
## Review: <change description>

**Verdict:** Request Changes / Comment / Approve
**Summary:** <1–2 sentence overview>

---

### 🔴 Must Fix

**`file.ts:42–55`** — <what>
<why it matters>

```suggestion
<concrete fix>
```
````

### 🟡 Suggestions

**`file.ts:88`** — <what>

### 🟢 Nits

**`file.ts:12`** — <what>

---

**Files reviewed:** <count>/<total>

```

## Usage

```

/skill:review # working-tree changes
/skill:review main # branch tip
/skill:review abc1234 # commit hash
/skill:review A..B # range

```

```
