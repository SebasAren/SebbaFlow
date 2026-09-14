#!/bin/zsh
# Environment variables for all zsh invocations (login, interactive, scripts).
# .zshenv is sourced by zsh unconditionally, before .zshrc.

# XDG Base Directory
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
export XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
export XDG_STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}"

# Editor
export EDITOR="${EDITOR:-nvim}"
export VISUAL="$EDITOR"

# Less
export LESS="-R"
export LESSHISTFILE="-"

# Less colors (from lesspipe)
[ -x /usr/bin/lesspipe ] && eval "$(SHELL=/bin/sh lesspipe)"

# Homebrew (if installed) — harmless if a machine-managed .zprofile already
# runs `brew shellenv`; this just makes the package self-contained.
if [ -d "/home/linuxbrew/.linuxbrew" ]; then
  eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
elif [ -d "$HOME/.linuxbrew" ]; then
  eval "$($HOME/.linuxbrew/bin/brew shellenv)"
elif [ -d "/opt/homebrew" ]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
elif [ -d "/usr/local/Homebrew" ]; then
  eval "$(/usr/local/bin/brew shellenv)"
fi
