---
name: bug
description: >
  Rapid-fire bug intake — turn one or many small bugs into enriched, de-duplicated
  forge issues after a single batch approval. Use for small bugs and UI
  inconsistencies. Do NOT use for features or anything needing design decisions —
  that's grill-me + file-issue.
---

# Bug

Take a batch of small bugs as one-liners, lightly enrich each from the codebase, de-dupe against the forge, and file one issue per bug — one approval for the whole batch. Sibling of grill-me/file-issue: no interview, no deep triage.

**Do NOT activate** for features or work with open design decisions — run grill-me instead.

## Process

### 1. Detect the forge

Same as file-issue: `git remote -v` → `gh` (github.com) or `glab` (gitlab\*). Ambiguous → ask.

### 2. Parse intake into bugs

Split the user's input into N discrete one-liners. N bugs in, N issues out — never a "polish batch" mega-issue. Each issue must be independently verifiable by a worker.

### 3. Dupe check

For each bug, search existing issues — open **and** closed (a closed match usually means regression):

```bash
gh search issues --repo <owner/repo> "<component keywords + symptom>"
```

- **High-confidence dupe** (same component + same symptom) → auto-skip, note the issue ref.
- Weaker near-match → keep, mention the ref in the summary.
- Report every skip in the final summary.

### 4. Light enrichment

Per non-skipped bug — seconds, not deep triage:

- Locate suspected files/components (grep the codebase).
- Sharpen repro / expected / actual; infer steps from code where possible.
- If the bug stays unclear after inspection → park it with a targeted question. Parked bugs never block the rest.

Ask all parked questions in one message, alongside the approval summary.

### 5. Draft + one batch gate

Write each body to `/tmp/bug-1.md` … `/tmp/bug-N.md`:

```markdown
## Bug

[1–2 sentences]

## Repro

1. [steps]

**Expected:** [behavior]
**Actual:** [behavior]

## Suspected location

[real file paths / components found during enrichment]

## Notes

[regression signal, near-dupes, environment details — or "none"]
```

Then show one compact table — never full bodies:

```
| File | Title | Status |
| ---- | ----- | ------ |
```

Status is `ready`, `parked (question)`, or `skipped (dupe of #12)`. Push nothing before explicit approval of the table. On approval, push all ready issues — answered parked bugs included; still-unanswered ones stay parked.

### 6. Ensure the label exists

```bash
gh label create agent-planned --description "Planned by agent (grill-me alignment)" --color 5319E7 || true
glab label create --name agent-planned --color "#5319E7" --description "Planned by agent (grill-me alignment)" || true
```

### 7. Create + report

```bash
gh issue create --title "<title>" --body-file /tmp/bug-1.md --label agent-planned
glab issue create -t "<title>" -d "$(cat /tmp/bug-1.md)" -l agent-planned
```

Report:

```
| # | Title |
| - | ----- |
```

Plus the ready-to-paste supervisor invocation (e.g. `/skill:supervisor --gh 12,15`), any parked bugs with their open questions, and the dupe-skip list.

## Rules

1. One approval gates the whole batch — not one per bug.
2. Always one issue per bug; never batch related bugs into one issue.
3. Auto-skip only high-confidence dupes; every skip is reported with its ref.
4. Enrichment is light: locate + sharpen. Unclear after that → ask, don't guess.
5. Never render full bodies in chat — files plus the table.
6. Parked bugs never block ready ones.
