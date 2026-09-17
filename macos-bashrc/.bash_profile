# .bash_profile
# macOS Terminal launches login shells, which read .bash_profile instead of
# .bashrc. Source .bashrc here so interactive config (aliases, .bashrc.d/,
# mise, etc.) loads in every new Terminal window/tab.

if [ -f ~/.bashrc ]; then
    . ~/.bashrc
fi
