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
