---
description: CI and test portability gotchas
globs:
  - "**/*.test.ts"
  - ".github/workflows/*.yml"
---

- **System dependencies must be explicit in CI** — Tools that shell out to system binaries (e.g., `rg` / ripgrep) are not pre-installed on `ubuntu-latest` runners. Add an install step (e.g., `sudo apt-get install -y ripgrep`) to the workflow or tests will fail with `ENOENT`.
- **Shell-out helpers must not silently swallow errors** — When a test utility wraps `spawnSync`, returning a default value (e.g., `""`) on `result.error` or non-zero exit hides the real failure and produces false positives. Throw the error so the test fails with a clear message instead of misleading results.
- **Tests must not depend on local-only paths** — Never assume `~/Documents/wiki/wiki` (or any local path) exists in CI. Integration tests that call `main()` should create a temp directory with test fixtures and pass it via the environment override (e.g., `WIKI_DIR: tmpDir`), or assert behavior that gracefully handles an empty/absent directory.
- **Integration tests go in `integration.test.ts`** — Tests that call real binaries or external APIs belong in a separate file excluded from `mise run test` via `bun test --parallel --path-ignore-patterns="**/integration.test.ts"`. Run them manually when needed.
- **Bun test uses `--path-ignore-patterns`** (not `--exclude`) to skip test files by glob pattern.

## Test directories and `mise run test`

All test directories must be listed in `.mise/tasks/test`. When adding a new test directory, add a `bun test` block there. Current directories:

| Directory                          | Scope                                              |
| ---------------------------------- | -------------------------------------------------- |
| `pi/.pi/agent/extensions/`         | Pi extension unit tests (with `--coverage`)        |
| `pi/.local/bin/tdd-plan.test.ts`   | TDD plan CLI                                       |
| `pi/.local/bin/lib/`               | TDD plan library (verify gate)                     |
| `obsidian/.local/lib/wiki-search/` | Wiki search (with `--coverage`)                    |
| `obsidian/.local/lib/wiki-core/`   | Wiki frontmatter I/O (with `--coverage`)           |
| `obsidian/.local/lib/issue/`       | Issue tracker CLI and commands (with `--coverage`) |

Integration tests (`**/integration.test.ts`) are excluded from CI via `--path-ignore-patterns` — run them manually.

`tests/` at the repo root holds a local-only plenary Lua suite (run via `tests/run.sh`, requires nvim) — not wired into `mise run test`.
