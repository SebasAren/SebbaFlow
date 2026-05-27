---
name: knowledge-audit
description: >
  Review agent-facing knowledge (rules, AGENTS.md, CONVENTIONS.md, README.md,
  domain docs) for staleness and accuracy. Use when the user asks to audit, clean,
  or prune knowledge. Also use when they're confused by a rule/doc that seems wrong
  — treat that as the starting point for a broader audit.
---

# Knowledge Audit

Audit every agent-facing knowledge file in the repo for staleness, accuracy, and usefulness. Stale knowledge is worse than no knowledge — it sends sessions in the wrong direction. Knowledge files include:

- `.claude/rules/*.md` — auto-injected rules
- `AGENTS.md` at any depth (root and per-package)
- `CONVENTIONS.md` — code-style source of truth
- `README.md` — human-facing but agents read it too
- `docs/domain/*.md` if the repo uses that pattern

## Scope Selection

When the user triggers this skill, determine scope:

| User says                                           | Scope                                       |
| --------------------------------------------------- | ------------------------------------------- |
| "audit rules", "check rules", "review rules"        | `.claude/rules/` only                       |
| "audit docs", "check docs", "review docs"           | `docs/**` and `*.md` reference docs only    |
| "audit AGENTS", "audit conventions"                 | Just the named file(s)                      |
| "audit knowledge", "audit everything", "full audit" | All knowledge files (default for ambiguous) |

When in doubt prefer the full audit — partial scopes miss cross-file contradictions, which is where most rot lives.

## Audit Process

### Step 1: Enumerate files

Discover all knowledge files in scope. Don't hardcode paths — find them:

```bash
# Rules
ls .claude/rules/ 2>/dev/null

# AGENTS.md at any depth (root + per-package)
fd -t f '^AGENTS\.md$' || find . -name AGENTS.md -not -path '*/node_modules/*'

# Convention / readme / domain docs at the root and one level down
ls CONVENTIONS.md README.md 2>/dev/null
fd -t f '^(CONVENTIONS|README)\.md$' --max-depth 3 || find . -maxdepth 3 \( -name CONVENTIONS.md -o -name README.md \)
ls docs/domain/ 2>/dev/null
```

### Step 2: Audit each file

For **each file**, load it with `read` and run through the [Audit Checklist](#audit-checklist). Record findings — don't rely on memory.

Process files in parallel groups where possible (multiple `read` calls in parallel, then process each).

### Step 3: Cluster findings by topic, then prioritize

Before listing findings file-by-file, **cluster them by topic across files**. Per-file audits catch each instance of rot in isolation; topical clustering reveals the systemic issue.

Example: if "git hooks" appears in `README.md`, `CONVENTIONS.md`, and `AGENTS.md` and they contradict each other, that's one finding ("git-hooks knowledge is incoherent — pick one truth"), not three.

Then categorize:

Categorize all findings:

| Category           | Severity      | Action                                                               |
| ------------------ | ------------- | -------------------------------------------------------------------- |
| **CONTRADICTION**  | 🔴 Critical   | Rule/doc says X, code does Y. Must fix.                              |
| **DEAD REFERENCE** | 🔴 Critical   | References a file/API/config that no longer exists                   |
| **OBSOLETE**       | 🟡 Warning    | Feature was removed, pattern is no longer used, convention changed   |
| **DUPLICATE**      | 🟡 Warning    | Two files say essentially the same thing — merge or remove           |
| **STALE EXAMPLE**  | 🟡 Warning    | Code example uses deprecated APIs or old patterns                    |
| **VAGUE**          | 🟢 Suggestion | Too abstract to be useful — needs concrete examples or should be cut |
| **BLOAT**          | 🟢 Suggestion | Large file where most content is unused — trim or split              |
| **HEALTHY**        | ✅ No action  | Current, accurate, and useful                                        |

If findings are extensive, prioritize the 🔴 Critical items first when presenting.

### Step 4: Present findings

Show the audit summary grouped by file:

```markdown
## Knowledge Audit — [Rules | Docs | Rules & Docs]

| File               | Status            | Finding                                            |
| ------------------ | ----------------- | -------------------------------------------------- |
| `rules/auth.md`    | 🔴 Contradiction  | Says tokens expire in 24h, actual code uses 1h     |
| `rules/testing.md` | ✅ Healthy        | Up to date and referenced during work              |
| `docs/old-api.md`  | 🔴 Dead reference | References `/api/v1/` endpoint removed in refactor |
```

Files with no issues still get a row marked ✅ Healthy so the user sees what was checked.

### Step 5: Propose actions

For each non-healthy finding, propose a specific action:

- **Fix**: Edit the file to match reality (show the before/after)
- **Archive**: Move to `docs/archive/` or `docs/domain/archive/` with a date stamp
- **Merge**: Combine two similar files into one
- **Delete**: Remove entirely (for files where nothing is salvageable)
- **Trim**: Cut outdated sections, leave the good parts

## Audit Checklist

Apply these checks to every file:

### 🔍 Contradiction checks

- Does the file describe APIs, configs, or patterns that contradict what the codebase actually does?
- Cross-reference: `grep` for symbols, file paths, or API names mentioned in the file. Do they still exist?
- Check env vars, config keys, command names, and file paths — these are the most likely to drift.

### 🔍 Dead reference checks

- Does the file reference other files, modules, or directories that no longer exist?
- Does it mention env vars, npm packages, or CLI tools that have been removed?
- For every `mise run X` mentioned, verify the task exists with `mise tasks ls` (or `ls .mise/tasks/`). Renamed tasks are a common rot source.
- For every shell command (`bunx tsc --noEmit`, `npx X`, etc.), verify it still matches the project's actual workflow — these often go stale when a task runner replaces direct CLI calls.

### 🔍 Obsolete pattern checks

- Does the file describe a pattern that's been replaced by a newer convention?
- Check for deprecated Vue/Nuxt/Prisma/tRPC patterns: Nuxt 2 syntax, Options API, Prisma 4→5 migrations, deprecated test framework patterns.
- Compare against the actual codebase — search for the described pattern and see if it's still used.

### 🔍 Duplicate checks

- Is any content substantially duplicated across knowledge files? Check **all axes**, not just rules-vs-docs:
  - `.claude/rules/global.md` ↔ `AGENTS.md` ↔ `CONVENTIONS.md` (code-style sections often triplicated)
  - Root `AGENTS.md` ↔ subdirectory `AGENTS.md` (per the docs-structure rule, subdirectories must not duplicate global info)
  - `README.md` ↔ `AGENTS.md` (setup steps and tool tables drift apart)
- Duplicates create maintenance debt — when one gets updated and the other doesn't, they contradict.
- When a duplicate is found, identify which file should be the **source of truth** and reduce the others to a one-line link.

### 🔍 Example freshness checks

- Code examples: Do the APIs shown still exist in the current versions?
- Shell commands: Do they still work?
- Config snippets: Still valid syntax?

### 🔍 Usefulness checks

- Would this file actually help a future session? Be honest.
- Is it too vague to act on? ("Always write tests" without specifics)
- Is it so large nobody will read it? (Flags for splitting or archiving)

### 🔍 Derivability checks (rule files only)

Rule files load into context on every matching session — every bullet must earn its load cost. For each bullet ask:

- **Could an agent learn this by reading one file?** If yes, the code is already authoritative; the bullet is duplicate documentation that will rot. Cut it.
- **Is this an external constraint not visible in code?** (env vars, CI quirks, version gates, vendor API limits, undocumented SDK shapes) → keep.
- **Is this a design decision whose absence would invite churn?** (e.g. "system prompt is declarative — no ALL CAPS register") → keep.
- **Is this just a snapshot of current implementation?** (scoring weights, regex captures, which fields a function reads) → cut. The code is the source of truth.

This is the same bar the commit skill applies when _adding_ rules — apply it in reverse to existing bullets.

## Execution Guidelines

- **Be thorough but fair.** Don't flag minor style differences as contradictions. Focus on substantive accuracy issues.
- **Verify before flagging.** Before calling something a contradiction, actually check the code. Don't guess.
- **Cite evidence.** When flagging an issue, cite the specific line in the rule/doc AND the actual code that contradicts it.
- **Respect file roles.** Rules (`.claude/rules/`) are auto-injected and pay context cost on every load — apply the derivability bar. AGENTS.md is the agent-facing index/overview. CONVENTIONS.md is the per-language source of truth. README.md is human-facing setup. Docs (`docs/domain/`) are deep reference. Each role implies what _should_ live there and what shouldn't.
- **Check cross-references.** Rules often say "read `docs/domain/X.md` before implementing." Verify those docs exist and are current.
- **Batch reads.** When reading multiple files, do it in parallel — don't read one at a time unnecessarily.
- **Synthesize across files, don't just summarize per file.** A bullet that's stale in one file is often stale in two more. The topical pass in Step 3 is where systemic rot becomes visible.

## Applying Changes

After presenting findings, ask the user which actions to take. Apply approved changes:

- **Edits**: Use `edit` to update in place — keep diffs minimal and precise
- **Archives**: Move files with `mv`, preserving the original date
- **Merges**: Use `write` for the consolidated file, then remove the originals
- **Deletes**: Use `rm` (or `git rm` for tracked files) only after explicit user approval

Present all changes before applying. Wait for user confirmation.

### Commit hygiene

Don't bundle the whole audit into one mega-diff. Make **one atomic commit per finding category** so each is reviewable and revertable independently. Typical breakdown:

- One commit per dead-reference cluster (e.g. "remove stale git-hooks references across README/CONVENTIONS/AGENTS")
- One commit per consolidation (e.g. "make CONVENTIONS.md the single source for code style")
- One commit per file deletion or archive
- One commit per content restoration (if you're un-doing a previous over-trim)

Use `jj commit -m "<message>"` between groups to create atomic commits.

## Usage

```
/skill:knowledge-audit              # Audit all knowledge files (default)
/skill:knowledge-audit rules        # Audit .claude/rules/ only
/skill:knowledge-audit docs         # Audit docs/** reference docs only
/skill:knowledge-audit AGENTS.md    # Audit a specific named file
```
