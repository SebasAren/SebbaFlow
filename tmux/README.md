# Tmux Configuration

## Setup

```bash
stow tmux
tmux  # TPM auto-installs plugins on first run
```

## Keybindings

All daily bindings use `Alt` — no prefix needed.

| Key                 | Action                              |
| ------------------- | ----------------------------------- |
| `Alt+h/j/k/l`       | Navigate panes (left/down/up/right) |
| `Alt+Shift+h/j/k/l` | Resize panes                        |
| `Alt+v`             | Split horizontally                  |
| `Alt+s`             | Split vertically                    |
| `Alt+n`             | New window                          |
| `Alt+1..9`          | Switch to window by number          |
| `Alt+<` / `Alt+>`   | Move window left/right              |
| `Alt+{` / `Alt+}`   | Swap pane with prev/next            |

### Prefix (`Ctrl+a`) — rare ops only

| Key | Action              |
| --- | ------------------- |
| `r` | Reload config       |
| `I` | Install TPM plugins |
| `U` | Update TPM plugins  |

### Copy mode (enter with `prefix+[`)

| Key | Action          |
| --- | --------------- |
| `v` | Begin selection |
| `y` | Yank selection  |

## Plugins

- **tmux-sensible** — community defaults
- **tmux-yank** — system clipboard support
- **tokyo-night** — theme (matches nvim)
