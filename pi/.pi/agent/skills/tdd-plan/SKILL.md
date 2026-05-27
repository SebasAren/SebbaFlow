---
name: tdd-plan
description: Plan and implement features with TDD.
---

# TDD Plan & Implement

Plan a feature using strict TDD discipline, then execute step-by-step. Each step follows Red-Green-Refactor: establish a failing condition, make it pass with minimal code, then refactor. Structural steps (schema, config, scaffolding) skip RED and go straight to implementation + validation.

Uses **jj** for version control. Each step creates a new revision with `jj new`, commits with `jj commit`, and at plan end all revisions are squashed into one feature commit.

## Process

Determine the mode from user input:

1. **Plan mode** — user describes a feature (no plan slug) → [Planning](#planning)
2. **Implement mode** — user provides a slug, or says "implement"/"continue" → [Implementation](#implementation)
3. **Unclear** → run `tdd-plan list` and ask

## CLI Reference

```bash
tdd-plan create <slug> --title <title> --steps <text> [--steps-file <path>] [--context <text>] [--architecture <text>] [--notes <json>]
tdd-plan edit <slug> [--title <title>] [--steps <text>] [--steps-file <path>] [--context <text>] [--architecture <text>]
tdd-plan design <slug> [--show] [--current-state <text>] [--desired-state <text>] [--patterns <text>] [--decisions <text>] [--questions <text>]
tdd-plan list
tdd-plan show [slug]
tdd-plan phase <slug> <step> <red|green|refactor> <start|done|skip>
tdd-plan complete <slug> <step>
tdd-plan note <slug> <text>
tdd-plan archive <slug>
```

Plans stored in `.pi/plans/<slug>.json`.

---

## Planning

### Steps

1. **Understand the request** — ask clarifying questions if scope is ambiguous
2. **Identify test framework** — check `package.json`, `pyproject.toml`, Makefile, or ask
3. **Explore the codebase** — use `explore` tool with query from user's description
4. **Create a design artifact** — surface findings and open questions for user review:
   ```bash
   tdd-plan create <slug> --title <title> --steps '[{"name":"Placeholder","red":"tbd","green":"tbd","refactor":""}]' --context <context> --architecture <architecture>
   tdd-plan design <slug> \
     --current-state "..." \
     --desired-state "..." \
     --patterns "..." \
     --decisions "..." \
     --questions "..."
   ```
   Present to user for review. If corrections needed, update with `tdd-plan design` and re-present.
5. **Draft steps** — replace placeholder with real RED/GREEN/REFACTOR steps
6. **Update plan** — `tdd-plan edit <slug> --steps "..."`, ask for confirmation

### Steps format (text)

```
STEP 1: Token generation
RED: Write test that generates a JWT with correct claims
GREEN: Implement token generation with jsonwebtoken library
REFACTOR:
---
STEP 2: Add phone_number column
RED: none
GREEN: Add migration to add phone_number column, run schema generation to validate
REFACTOR:
```

- `RED: none` = structural step (no failing condition, just implement + validate)
- `REFACTOR:` can be empty
- `---` separator is optional

### Planning Rules

1. **RED first, unless structural** — most steps start with a failing condition
2. **Small steps** — completable in 5-10 minutes
3. **One concept per step**
4. **Minimal GREEN** — simplest code that works, save abstractions for refactor
5. **Real refactoring only** — only when there's a concrete reason
6. **Concrete over vague** — actual function names, file paths, input/output examples
7. **Include edge cases** — after happy path
8. **Integration tests last**

---

## Implementation

### Setup

1. **Locate plan** — `tdd-plan show <slug>`, or `tdd-plan list` if no slug
2. **Confirm** — show summary, ask if ready
3. **Determine test command** — check `package.json`, `pyproject.toml`, Makefile, or ask
4. **Explore** — `explore` tool with query from plan context/architecture
5. **Set kickoff** — `tdd-set-kickoff({ slug: "<slug>" })`. Call exactly once per plan.
6. **Fresh starts** — user can say "fresh branch from kickoff" to get clean context per step

### Red-Green-Refactor Cycle

At step start:
```bash
jj new
```

#### Structural steps (`RED: none`)

```bash
tdd-plan phase <slug> <step> red skip
# Implement structural change
# Run validation command specified in GREEN
tdd-plan phase <slug> <step> green done
jj fix
jj commit -m "<conventional commit>"
```

#### 🔴 RED

```bash
tdd-plan phase <slug> <step> red start
# Write test / introduce failing condition
# Confirm it fails with expected error
tdd-plan phase <slug> <step> red done
```

If validation passes or fails unexpectedly — stop, report.

#### 🟢 GREEN

```bash
tdd-plan phase <slug> <step> green start
# Write simplest code to pass
# Confirm it passes
tdd-plan phase <slug> <step> green done
jj fix
jj commit -m "<conventional commit>"
```

#### 🔵 REFACTOR (if applicable)

```bash
tdd-plan phase <slug> <step> refactor start
# Apply refactoring, run full validation
tdd-plan phase <slug> <step> refactor done
```

If refactoring was significant, amend: `jj describe -m "<updated message>"`

### User Verification

After committing:
```bash
tdd-plan complete <slug> <step>
```

Show: summary, validation output, revision ID. Then stop and ask what's next.

### Finish

Squash all step revisions into one feature commit:
```bash
jj log  # review stack
jj squash --from <first-step-rev>..<last-step-rev>
jj describe -m "feat(<scope>): <feature description>"
```

Archive if done: `tdd-plan archive <slug>`

## Rules

1. **Never skip RED unless `RED: none`**
2. **Never skip GREEN** — validation must pass before moving on
3. **Minimal GREEN only**
4. **Real refactoring only** — only when plan calls for it
5. **Run validation after every phase**
6. **Stop on unexpected failure** — explain and ask user
7. **One step at a time**
8. **Respect the plan** — if wrong, pause and discuss
9. **Run `jj fix` before commit**
10. **Single kickoff point** — `tdd-set-kickoff` once, use `/kickoff` to return
11. **`jj new` at step start**

## Error Handling

- **Framework not found** → stop and ask
- **Unexpected pass in RED** → report and ask
- **Cannot make GREEN pass after 3 attempts** → stop, suggest simplifying
- **Refactoring breaks validation** → `jj undo`, report, ask
