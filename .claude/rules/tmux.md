---
globs:
  - "tmux/**"
description: Tmux-specific conventions and gotchas
---

- **Config filename is `tmux.conf`** (not `.tmux.conf`), located at `tmux/.config/tmux/tmux.conf`.
- **`display-popup -d` sets start-directory** (not `-c`). `-c` is `target-client` — using it with a path causes "Can't find client" errors. Always use `-d '#{pane_current_path}'` to set popup cwd.
- **fzf args must use bash arrays, not `echo` + `$(...)`**: When passing options with Unicode/special chars (like `--prompt 'switch ▸ '`), `echo` inside `$(...)` gets word-split by the shell. Use a bash array (`FZF_OPTS=(...)`) and expand with `"${FZF_OPTS[@]}"` instead.
- **fzf free-text input needs `--disabled`**: When using fzf for free-text entry (not selecting from a list), `echo "" | fzf --print-query` exits code 1 when the user types text because filtering yields 0 matches. Add `--disabled` to skip filtering so fzf always exits 0. Use `head -1` to grab the query line.
- **`TMUX_PANE` targeting for split-window**: When a process running inside tmux calls `tmux split-window` without `-t`, it splits the _currently focused_ pane — which may be in a different window if the user navigated away. Always use `-t "$TMUX_PANE"` to target the pane where the process is actually running.
