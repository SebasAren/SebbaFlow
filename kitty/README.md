# Kitty Terminal

GPU-accelerated terminal emulator replacing tmux + Ghostty. Kitty provides native multiplexing (tabs/windows) and natively supports the Kitty Graphics Protocol, enabling pi inline images without tmux passthrough hacks.

## Stow

```bash
cd ~/dotfiles
stow kitty
```

This symlinks:

- `kitty/.config/kitty/kitty.conf` → `~/.config/kitty/kitty.conf`
- `kitty/.config/xdg-terminals.list` → `~/.config/xdg-terminals.list`

## Default terminal

Kitty is set as the GNOME default terminal (`Ctrl+Alt+T`). This is configured via:

1. **`xdg-terminals.list`** — tells `xdg-terminal-exec` (freedesktop spec) which terminal to launch when apps request one
2. **gsettings** — tells GNOME Shell which terminal to open on `Ctrl+Alt+T`

These are applied automatically by stowing and running:

```bash
gsettings set org.gnome.desktop.default-applications.terminal exec kitty
gsettings set org.gnome.desktop.default-applications.terminal exec-arg -
```

## Architecture

Kitty replaces **both** terminal emulator and multiplexer:

| tmux concept         | kitty equivalent                                 |
| -------------------- | ------------------------------------------------ |
| Session              | kitty OS window                                  |
| Window (tab)         | kitty **tab**                                    |
| Pane (split)         | kitty **window**                                 |
| `tmux display-popup` | no native popup — use inline fzf or separate tab |

### Active pane indicator

When splits are open, the shared border is colored to show focus:

- **Active** window border → `#7aa2f7` (blue, matches `url_color`)
- **Inactive** window border → `#292e42` (dark, matches `selection_background`)

This replaces tmux's status-line highlighting.

## Keybindings

All tmux `Alt+` bindings are migrated to kitty directly (no prefix key needed):

| Binding             | Action                                       |
| ------------------- | -------------------------------------------- |
| `Alt+v`             | Split horizontally                           |
| `Alt+s`             | Split vertically                             |
| `Alt+n`             | New tab (with cwd)                           |
| `Alt+h/j/k/l`       | Navigate splits                              |
| `Alt+1..9`          | Switch tabs                                  |
| `Alt+z`             | Toggle zoom / stack layout                   |
| `Alt+Shift+h/j/k/l` | Resize split                                 |
| `Alt+r`             | Reload kitty.conf                            |
| `Alt+Shift+q`       | Close window                                 |
| `Alt+Shift+w`       | Close tab                                    |
| `Alt+[`             | Vi selection mode (kitty_grab kitten)        |
| `Ctrl+Shift+h`      | Scrollback in `less`                         |
| `Alt+Shift+f`       | Hints kitten (quick keyboard text selection) |

## Pi Images

Kitty is natively detected by pi via `KITTY_WINDOW_ID`. Inline images via the `read` tool work **without** `PI_TMUX_IMAGES` or any passthrough configuration.

## Remote Control

Enabled for scripting (`kitty @` commands):

```bash
kitty @ new-tab --cwd /path --tab-title "branch-name"
kitty @ focus-window --match title:"branch-name"
```

The listen socket is at `unix:/tmp/kitty-${USER}`.

## Theme

Tokyo Night (Storm), matching the previous tmux-tokyo-night + Ghostty Catppuccin Mocha setup.

## Known Differences vs tmux

- **No session persistence**: Closing the kitty window kills all tabs. Use `nohup`, `systemd --user`, or `screen` for long-running background processes.
- **No popup overlays**: `display-popup` is tmux-only. Interactive pickers run inline or in a new tab.
- **Vi selection via kitten**: Kitty has no _built-in_ vi copy mode, but the third-party `kitty_grab` kitten provides lightweight vim-like keyboard selection (`Alt+[`). For browsing full scrollback, `Ctrl+Shift+h` opens `less`.
- **No tab swap**: Kitty doesn't have `swap-window`. Drag mouse or use remote-control script.

## References

- [Kitty docs](https://sw.kovidgoyal.net/kitty/)
- [Kitty remote control](https://sw.kovidgoyal.net/kitty/remote-control/)
- [Kitty graphics protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/)
