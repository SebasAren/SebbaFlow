# .bashrc
# Bluefin base bashrc — inlined from:
#   https://github.com/ublue-os/bluefin (Fedora default .bashrc)
#   https://github.com/projectbluefin/common (bling.sh)
# Apply on non-bluefin systems (e.g. bazzite) to replicate the experience.

# Source global definitions
if [ -f /etc/bashrc ]; then
    . /etc/bashrc
fi

# User specific environment
if ! [[ "$PATH" =~ "$HOME/.local/bin:$HOME/bin:" ]]; then
    PATH="$HOME/.local/bin:$HOME/bin:$PATH"
fi
export PATH

# Uncomment the following line if you don't like systemctl's auto-paging feature:
# export SYSTEMD_PAGER=

# User specific aliases and functions
if [ -d ~/.bashrc.d ]; then
    for rc in ~/.bashrc.d/*; do
        if [ -f "$rc" ]; then
            . "$rc"
        fi
    done
fi
unset rc

# --- Bluefin bling (inlined from bling.sh) ---

# Prevent double-sourcing
if [ "${BLING_SOURCED:-0}" -eq 0 ]; then
    BLING_SOURCED=1

    # ls aliases (eza)
    if [ "$(command -v eza)" ]; then
        alias ll='eza -l --icons=auto --group-directories-first'
        alias l.='eza -d .*'
        alias ls='eza'
        alias l1='eza -1'
    fi

    # ugrep for grep
    if [ "$(command -v ug)" ]; then
        alias grep='ug'
        alias egrep='ug -E'
        alias fgrep='ug -F'
        alias xzgrep='ug -z'
        alias xzegrep='ug -zE'
        alias xzfgrep='ug -zF'
    fi

    # bat for cat
    if [ "$(command -v bat)" ]; then
        alias cat='bat --style=plain --pager=never'
    fi

    _BLING_SHELL="$(basename "$(readlink /proc/$$/exe)")"

    # Initialize direnv before bash-preexec to avoid PROMPT_COMMAND conflicts
    # See: https://github.com/rcaloras/bash-preexec/pull/143
    if [ "${_BLING_SHELL}" = "bash" ]; then
        [ -f "/etc/profile.d/bash-preexec.sh" ] && . "/etc/profile.d/bash-preexec.sh"
        [ -f "/usr/share/bash-prexec" ] && . "/usr/share/bash-prexec"
        [ -f "/usr/share/bash-prexec.sh" ] && . "/usr/share/bash-prexec.sh"
        [ -f "${HOMEBREW_PREFIX}/etc/profile.d/bash-preexec.sh" ] && . "${HOMEBREW_PREFIX}/etc/profile.d/bash-preexec.sh"
    fi

    [ "$(command -v direnv)" ] && eval "$(direnv hook "${_BLING_SHELL}")"

    # Atuin shell integration is disabled by default (matching upstream)
    # To enable, uncomment the following line:
    # [ "$(command -v atuin)" ] && eval "$(atuin init "${_BLING_SHELL}")"

    [ "$(command -v starship)" ] && eval "$(starship init "${_BLING_SHELL}")"
    [ "$(command -v zoxide)" ] && eval "$(zoxide init "${_BLING_SHELL}")"

    # mise activation is handled by ~/.bashrc.d/mise (from the bashrc stow)
    # If not using the bashrc stow, add: eval "$(mise activate bash)"
fi

# LLM gaming toggle
alias llmon='systemctl --user start llama-vulkan.service && echo "🟢 LLM started"'
alias llmoff='systemctl --user stop llama-vulkan.service && echo "🔴 LLM stopped"'
alias llmtoggle='~/.local/bin/llama-toggle'
