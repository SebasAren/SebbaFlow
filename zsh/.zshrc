#!/bin/zsh
# Modular zsh config. .zshenv already ran (env vars); this sources everything
# in ~/.zshrc.d/ for interactive setup (aliases, plugins, tool activation).

if [ -d ~/.zshrc.d ]; then
    for rc in ~/.zshrc.d/*; do
        if [ -f "$rc" ]; then
            . "$rc"
        fi
    done
fi
unset rc

# Machine-specific hooks below are guarded so the file stays portable across
# machines that lack them (Linux/Bluefin, fresh clones).

# libpq (psql, createdb) for frits-intake worktree scripts
[[ -d /opt/homebrew/opt/libpq/bin ]] && export PATH="/opt/homebrew/opt/libpq/bin:$PATH"

# when inside herdr, patch claude executable (herdr-nono.zsh is local-only)
if [[ "$HERDR_ENV" == "1" && -r "${XDG_CONFIG_HOME:-$HOME/.config}/zsh/herdr-nono.zsh" ]]; then
  source "${XDG_CONFIG_HOME:-$HOME/.config}/zsh/herdr-nono.zsh"
fi

# Docker Desktop CLI completions
if [[ -d "$HOME/.docker/completions" ]]; then
  fpath=("$HOME/.docker/completions" $fpath)
  autoload -Uz compinit
  (( ${+_comps[docker]} )) || compinit
fi

if command -v wt >/dev/null 2>&1; then eval "$(command wt config shell init zsh)"; fi

[[ -r "$HOME/fritsctl/shell/hook.zsh" ]] && source "$HOME/fritsctl/shell/hook.zsh"

# asdf shims are put on PATH in .zshrc.d/mise (asdf 0.16+ has no asdf.sh)
