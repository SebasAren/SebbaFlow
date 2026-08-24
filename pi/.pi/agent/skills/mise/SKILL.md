---
name: mise
description: Manage development tools, tasks, and environment variables with mise (mise-en-place). Use when installing or switching tool versions, running project tasks, configuring per-project environments, or editing mise.toml files.
---

# Mise (mise-en-place)

Unified tool version manager, task runner, and environment manager. Replaces asdf, nvm, pyenv, direnv, and make.

## Essential Commands

```bash
# Tool management
mise install                        # Install all tools from mise.toml
mise use node@24                    # Add/update tool in project config
mise use --global python@3.12       # Add/update tool globally
mise ls                             # List installed tools
mise ls-remote node                 # Available versions
mise upgrade                        # Update all to latest
mise prune                          # Remove unused versions

# Tasks
mise run                            # List available tasks
mise run build                      # Run a task
mise run build -- --flag arg        # Pass arguments
mise tasks                          # List with descriptions

# Environment
mise env                            # Show env vars
mise set KEY=value                  # Set env var in project config

# Config
mise edit                           # Interactive TUI config editor
mise edit --global                  # Edit global config
mise config                         # Show merged config
mise doctor                         # Diagnose issues
mise trust                          # Trust project config
```

## Config Files

| File                         | Purpose                              |
| ---------------------------- | ------------------------------------ |
| `~/.config/mise/config.toml` | Global defaults                      |
| `mise.toml` (project root)   | Project tools, tasks, env            |
| `mise.local.toml`            | Machine overrides (gitignored)       |
| `mise.{ENV}.toml`            | Per-environment (dev, staging, prod) |

Precedence: system < global < project < local < environment-specific

## TOML Reference

```toml
[tools]
node = "24"
python = "3.12.*"
"aqua:astral-sh/ruff" = "latest"    # Backend: aqua, cargo, npm, pipx, go, ubi

[tasks.build]
description = "Build the project"
run = "cargo build"
alias = "b"

[tasks.test]
depends = ["build"]                 # Run build first
run = "cargo test"
sources = ["src/**/*.rs"]           # Caching inputs
outputs = ["target/debug/myapp"]    # Caching outputs

[env]
DATABASE_URL = "postgres://localhost/mydb"

[vars]
test_args = "--headless"            # Template variables: {{vars.test_args}}
```

File tasks: executable scripts in `.mise/tasks/` with `#MISE description="..."` header.

## Notes

- Shell integration (`eval "$(mise activate bash)"`) needed for auto env loading
- Without it, use `mise env` or `mise exec`
- Full docs: https://mise.jdx.dev
