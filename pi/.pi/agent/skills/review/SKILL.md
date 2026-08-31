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
- **Worker context** (wt worktree, per the supervisor skills): run this before reporting done — fix every 🔴, decline 🟡 with a one-line reason in your report. If the helper spawn fails, self-review inline **and disclose it** in the report — never silently.

## Delegation (herdr)

1. Resolve your callback address (delegated workers already have one — `issue-36`; a plain session may need to name itself), then spawn a reviewer in a split pane (same cwd → same git state and repo trust; no worktree needed):

```bash
PANE=$(herdr pane current | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])')
SELF=$(herdr agent get "$PANE" | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["agent"]["name"] or "")')
[ -n "$SELF" ] || { SELF="rev-$RANDOM"; herdr agent rename "$PANE" "$SELF"; }   # names: [a-z][a-z0-9_-]{0,31}

OUT=$(mktemp --suffix=.md)
NEW=$(herdr pane split --current --direction right --no-focus --env PI_REVIEW_HELPER=1 | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])')
herdr pane wait-output "$NEW" --match "❯" --source recent-unwrapped --timeout 30000  # shell ready
NAME="reviewer-$(basename "$(git rev-parse --show-toplevel)" | cut -c1-23)"  # agent names: server-global, must fit 32 chars — the prefix handles digit-leading slugs, cut handles long ones (collides only on a shared 23-char prefix)
herdr agent start "$NAME" --kind pi --pane "$NEW" -- --model zai/glm-5.3   # reviewer model pinned in-repo
```

2. Submit the review task fire-and-forget — no `--wait` — then **end your turn**; the reviewer's callback wakes you:

```bash
herdr agent prompt "$NEW" "Delegated read-only review. Run /skill:review <target> — review inline (PI_REVIEW_HELPER=1 marks you as the helper), do not delegate. Write the full review to $OUT. Your delegator is $SELF, your slug is $NAME. First action: herdr agent prompt $SELF 'CALLBACK $NAME started: on it'. Last action of the turn: herdr agent prompt $SELF 'CALLBACK $NAME done: review written to $OUT'. Never use --wait on callbacks."
```

- `<target>` = the user's arg (empty for working-tree changes), resolved by the helper in the shared cwd.
- `agent_blocked` on submission → the reviewer sat at a dialog: `agent read "$NEW"`, resolve, resubmit.
- A `question` callback → answer via `herdr agent prompt "$NEW" "<answer>"` (no `--wait`); the reviewer's next callback reports the outcome.

3. On the `done` callback: `read "$OUT"` and present the review as your answer. If the file is missing, fall back to `herdr agent read "$NEW" --source recent --lines 300`.

4. Clean up: `herdr pane close "$NEW"`.

If any herdr step fails hard, review inline instead of debugging herdr. A worker doing so must disclose the self-review in its done-report.

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
