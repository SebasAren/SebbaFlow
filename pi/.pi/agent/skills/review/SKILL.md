---
name: review
description: Read-only code review of git changes. Inside herdr, delegates to a fresh helper agent for unbiased review.
---

# Review (Read-Only)

Analyze git changes and produce categorized findings. No tree manipulation, no side effects.

**Do NOT activate** for trivial changes (< 5 files, < 50 lines) — just review inline.

## Dispatch

- **Inside herdr** (`HERDR_ENV=1`, no helper marker): delegate to a fresh helper agent — an agent that didn't write the code reviews it without session bias. See below.
- **Otherwise** (or if herdr commands fail): review inline using the workflow below.
- **Recursion guard (structural)**: if `PI_REVIEW_HELPER=1` is set, you are the delegated helper — review inline, never spawn another helper.

## Delegation (herdr)

1. Spawn a reviewer in a split pane (same cwd → same git state and repo trust; no worktree needed):

```bash
OUT=$(mktemp --suffix=.md)
NEW=$(herdr pane split --current --direction right --no-focus --env PI_REVIEW_HELPER=1 | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])')
herdr pane wait-output "$NEW" --match "❯" --source recent-unwrapped --timeout 30000  # shell ready
herdr agent start reviewer --kind pi --pane "$NEW"
```

2. Submit the review task and wait:

```bash
herdr agent prompt "$NEW" "Delegated read-only review. Run /skill:review <target> — review inline (PI_REVIEW_HELPER=1 marks you as the helper), do not delegate. Write the full review to $OUT." --wait --timeout 600000
```

- `<target>` = the user's arg (empty for working-tree changes), resolved by the helper in the shared cwd.
- Default wait states (`idle|done|blocked`) return promptly — don't add `--until idle` (fast-turn stall).
- `agent_prompt_stalled` on the first prompt → retry once (pi cold start).
- Returned `blocked` → the helper is asking a question: `herdr agent read "$NEW"`, answer via another `agent prompt --wait`, then wait again.

3. Collect and present: `read "$OUT"` and present the review as your answer. If the file is missing, fall back to `herdr agent read "$NEW" --source recent --lines 300`.

4. Clean up: `herdr pane close "$NEW"`.

If any herdr step fails hard, review inline instead of debugging herdr.

## Workflow (inline)

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
