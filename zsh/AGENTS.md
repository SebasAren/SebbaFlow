# Zsh Configuration

Modular zsh config, parallel to the `bashrc` stow. Entry point: `.zshenv`
(env vars, sourced by zsh for every invocation), then `.zshrc` sources all
files in `.zshrc.d/`.

## Structure

```
.zshenv              # Global env vars (XDG, EDITOR, LESS, Homebrew shellenv)
.zshrc                # Sources everything in .zshrc.d/
.zshrc.d/             # sourced in glob (alphabetical) order
  00-plugins          # zinit bootstrap + plugin set + compinit + prompt/nav tools
  alias               # Short aliases
  fnox                # fnox reencryption helper
  mise                # Activates mise/fnox/pitchfork (guarded, zsh variant)
  secrets             # Lazy Proton Pass integration (same as bashrc's)
```

`00-plugins` is numbered so it sources first — it runs `compinit`, which
defines `compdef`. Anything sourcing a tool's zsh completion (`mise completion
zsh` starts with `#compdef mise` and calls `compdef _mise 'mise'`) must come
after it, or the shell prints `zsh: command not found: compdef` on start.

## Why zinit instead of Oh My Zsh

Oh My Zsh eagerly sources its whole framework plus every enabled plugin on
every shell start, which adds up. [zinit](https://github.com/zdharma-continuum/zinit)
lazy-loads and only pulls in what `plugins` actually declares:

- `zsh-users/zsh-completions` — extra completion definitions
- `zsh-users/zsh-autosuggestions` — fish-style history suggestions
- `zsh-users/zsh-syntax-highlighting` — must load last; it wraps zle widgets
  the other plugins define

Zinit self-installs on first shell start (clones into
`${XDG_DATA_HOME}/zinit/zinit.git`) — no separate setup step needed, but the
first new shell will pause briefly for the `git clone`.

Prompt (Starship), directory jumping (zoxide), and env loading (direnv) are
each activated only if installed (`command -v` guard) — same convention as
`bashrc/.bashrc.d/mise`.

## Conventions

Same as [`bashrc/AGENTS.md`](../bashrc/AGENTS.md): one concern per file, guard
tool activation with `command -v`, functions override binaries via a
`_toolname_bin` captured path.

## Usage

```bash
stow zsh    # install
stow -D zsh # uninstall — removes the symlinks
```

Then make zsh (if not already) or point it at this config — zsh already
reads `~/.zshenv`/`~/.zshrc` by default, no shell switch needed on macOS.
