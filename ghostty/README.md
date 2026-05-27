# Ghostty Configuration

⚠️ **Deprecated**: Ghostty has been replaced by [Kitty](../kitty/README.md) as the primary terminal. Kept for reference.

Fast, native, GPU-accelerated terminal emulator. Replaces WezTerm for better Bluefin/Flatpak integration and native image rendering support inside tmux (pi coding agent).

## Install (Bluein / Fedora Atomic)

```bash
FEDORA_VERSION=$(rpm -E %fedora)
sudo wget https://copr.fedorainfracloud.org/coprs/alternateved/ghostty/repo/fedora-"$FEDORA_VERSION"/alternateved-ghostty-fedora-"$FEDORA_VERSION".repo -O /etc/yum.repos.d/_copr:alternateved:ghostty.repo
sudo rpm-ostree install ghostty
```

Reboot to activate the layered package.

## Stow

```bash
stow ghostty
```

## Why Ghostty over WezTerm Flatpak

| Issue | WezTerm Flatpak | Ghostty Native |
|-------|-----------------|----------------|
| Auto-start tmux | Broken (sandboxed shell env) | Works natively |
| Inline images in tmux | Kitty protocol blocked by tmux | ✅ Pi-tested fix for tmux |
| Keyboard protocol | Needs `enable_kitty_keyboard` | Native Kitty protocol |
| Bluefin integration | Flatpak friction | rpm-ostree layer |

## Config Highlights

- **Theme:** Catppuccin Mocha (built-in, one line)
- **Font:** JetBrains Mono 14pt with ligatures
- **Window:** No decorations (tmux handles chrome)
- **Keys:** Font-size controls (`Ctrl+=/-/0`) + pi Linux fix (`Alt+Backspace`)

## Tmux Integration

Ghostty is purely a terminal emulator — it does not try to replace tmux. Native tabs/splits are available but ignored in favor of tmux window management.

## Docs

- Full config reference: `ghostty +show-config --default --docs | less`
- Online: https://ghostty.org/docs/config
