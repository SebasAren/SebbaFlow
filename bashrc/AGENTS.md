# Bash Configuration

Modular shell config. Entry point: `.bashenv` (global vars), then all files in `.bashrc.d/` are sourced.

## Structure

```
.bashenv              # Global env vars (EDITOR, XDG_CONFIG_HOME)
.bashrc.d/
  config              # Sources .bashenv, fzf key bindings
  alias               # Short aliases
  mise                # Activates mise runtime manager
  fnox                # fnox reencryption helper
```

## Secrets

No shell-level secret injection. `pi` and its extensions read credentials
from pi's built-in auth (`~/.pi/agent/auth.json`, written by `/login`).

## Conventions

- One concern per file
- `set -euo pipefail` in scripts
- Use `command -v` to check tool availability
- Shell functions override binaries by storing the real path in `_toolname_bin`
