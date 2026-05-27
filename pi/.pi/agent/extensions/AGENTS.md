# Pi Agent Extensions

TypeScript workspace of extensions for the [Pi coding agent](https://github.com/earendil-works/pi-mono). Each subdirectory is a self-contained extension registered via Pi's extension API.

See [`.claude/rules/pi-extensions.md`](../../../../.claude/rules/pi-extensions.md) for the full authoring/debugging rulebook (Bun gotchas, mock patterns, render conventions, model config, Explore internals). This file covers layout and the test workflow only.

## Workspace Layout

```
pi/.pi/agent/extensions/
├── package.json          # Bun workspaces root
├── tsconfig.base.json    # Shared tsconfig
├── eslint.config.mjs
├── shared/               # @pi-ext/shared — common utilities and test mocks
└── <extension>/          # One directory per extension
    ├── index.ts
    ├── package.json
    ├── tsconfig.json     # Extends ../tsconfig.base.json
    ├── *.test.ts         # Co-located unit tests
    └── integration.test.ts  # Load + register cycle
```

## Tests (471 tests across 45 files)

- **Unit tests**: `*.test.ts` next to the source file (e.g., `fuzzy-edit/fuzzy-match.test.ts`).
- **Integration tests**: one `integration.test.ts` per extension — verifies the extension loads, registers its tools/commands, and handles missing API keys gracefully.
- **Runner**: `bun test --parallel` from this directory (recurses into all workspace packages). No Jest, no Vitest. **Always use `--parallel`** — without it, tests share a single process and env var / mock state leaks between files, causing false failures.

**Shared mocks live in [`shared/src/test-mocks.ts`](shared/src/test-mocks.ts).** Use them for consistency — each factory (`piTuiMock`, `piCodingAgentMock`, `typeboxMock`) covers all exports an extension needs.

## Development Loop

```bash
# From this directory:
bun install

# Typecheck all workspaces
for dir in */; do [ -f "$dir/tsconfig.json" ] && npx tsc --noEmit -p "$dir/tsconfig.json"; done

# Run all tests
bun test --parallel

# Lint
npx eslint .
```

CI runs the same three steps on every push ([`.github/workflows/test.yml`](../../../../.github/workflows/test.yml)).

## Internal-Only Extensions

**`exa-search`** and **`context7`** are internal-only: their tools only register when loaded by the librarian subagent, not by the main agent. This keeps raw search results out of the main agent's context window.

- They use `PI_LIBRARIAN_LOAD` env var (set by librarian's session factory) to gate registration.
- The librarian's `noExtensions: true` + `additionalExtensionPaths` loads them explicitly.
- Tests verify both skip (no env var) and register (env var set) behavior.

⚠️ When adding a new extension that should also be internal-only, follow the same pattern:
  1. Guard the default export with `parseInt(process.env.PI_LIBRARIAN_LOAD || "0", 10) < 1`
  2. Add the extension path to librarian's `additionalExtensionPaths` array
  3. Write tests for both skipped and registered states

## Adding a New Extension

1. Create `<name>/` with `index.ts`, `package.json`, `tsconfig.json` (extend `../tsconfig.base.json`).
2. Write `integration.test.ts` first — mock external deps via `@pi-ext/shared/test-mocks`, verify `registerTool`/`registerCommand` is called.
3. Implement `index.ts`.
4. Add `"<name>"` to the `workspaces` array in [`package.json`](package.json).
5. Run `bun install && bun test --parallel` and the typecheck loop above.
