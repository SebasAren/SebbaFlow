---
name: review
description: Read-only code review of jj changes.
---

# Review (Read-Only)

Analyze jj changes and produce categorized findings. No tree manipulation, no side effects.

**Do NOT activate** for trivial changes (< 5 files, < 50 lines) — just review inline.

## Workflow

### Step 1: Resolve target

```bash
jj diff -r 'bookmark'                # bookmark
jj diff -r 'change-id'               # change ID
jj diff --from 'A' --to 'B'          # range
jj log -r 'target' -T 'description' --no-graph
```

### Step 2: Read the diff

```bash
jj diff --stat
jj diff
```

### Step 3: Review file by file

Read full files with `read` tool — do NOT review from diffs alone.

Classify each finding:

| Category | Emoji | Meaning |
|----------|-------|---------|
| **Must fix** | 🔴 | Bug, security issue, broken logic |
| **Suggestion** | 🟡 | Better approach, missing edge case |
| **Nit** | 🟢 | Style, naming, minor cleanup |

For each: file/line range, what, why (one sentence), concrete fix.

### Step 4: Produce review

**Verdict:** Request Changes (any 🔴) | Comment (only 🟡) | Approve (only 🟢 or none)

```markdown
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

### 🟡 Suggestions
**`file.ts:88`** — <what>

### 🟢 Nits
**`file.ts:12`** — <what>

---

**Files reviewed:** <count>/<total>
```

## Usage

```
/skill:review                            # current change
/skill:review main                       # bookmark
/skill:review kowqznzo                   # change ID
/skill:review abc::def                   # range
```
