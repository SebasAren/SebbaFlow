# Bash Configuration

Modular shell config. Entry point: `.bashenv` (global vars), then all files in `.bashrc.d/` are sourced.

## Structure

```
.bashenv              # Global env vars (EDITOR, XDG_CONFIG_HOME)
.bashrc.d/
  config              # Sources .bashenv, fzf key bindings
  alias               # Short aliases
  mise                # Activates mise runtime manager
  secrets             # Lazy Proton Pass integration
  tmux                # Auto-attach/create tmux sessions
  fnox                # fnox reencryption helper
.secrets.tpl          # Template for secret injection
```

## Secrets (`secrets`)

Lazy resolution via Proton Pass CLI. API keys are **not** loaded on shell startup.

- `pass-cli` is wrapped: only `login`/`logout` subcommands allowed directly
- `_ensure_secrets` resolves `~/.secrets.tpl` via `pass-cli inject` on first call
- `nvim` and `pi` are wrapped to call `_ensure_secrets` before launching

Template format (`~/.secrets.tpl`):
```bash
export EXA_API_KEY='{{ pass://API/Exa/API Key }}'
export CONTEXT7_API_KEY='{{ pass://API/Context7/API Key }}'
```

## Conventions

- One concern per file
- `set -euo pipefail` in scripts
- Use `command -v` to check tool availability
- Shell functions override binaries by storing the real path in `_toolname_bin`
