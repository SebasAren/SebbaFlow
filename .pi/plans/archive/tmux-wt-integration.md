## Plan: Replace tmux-worktree plugin with wt CLI scripts

### Context

Replace the `denesbeck/tmux-worktree` TPM plugin with custom shell scripts that wrap the `wt` (worktrunk) CLI. The new scripts will use tmux popups + fzf to provide:

1. **Create worktree** (`prefix + W`): Pick a branch, name the new branch, then choose to open with `pi` or `$SHELL`
2. **Switch worktree** (`prefix + w`): Pick an existing worktree from fzf, then choose to open with `pi` or `$SHELL`
3. **Remove worktree** (`prefix + X`): Pick a worktree to remove with dirty-state warnings

Scripts live in `tmux/.config/tmux/scripts/` and are stowed to `~/.config/tmux/scripts/`.

### Architecture

```
tmux/.config/tmux/
├── tmux.conf                    # Updated: remove TPM plugin, add keybindings
└── scripts/
    ├── wt-common.sh             # Shared: fzf theme, helpers, tool picker
    ├── wt-create.sh             # Create worktree flow
    ├── wt-switch.sh             # Switch/open worktree flow
    └── wt-remove.sh             # Remove worktree flow
```

Each script runs inside `tmux display-popup`. The tool picker (pi vs shell) uses fzf. Worktrees open as new tmux windows named after the branch.

### Step 1: Create wt-common.sh — shared helpers and fzf theme

**🔴 RED — Write a failing test**

```
Source wt-common.sh and verify functions are defined:
- _wt_fzf_opts returns non-empty fzf arguments
- _wt_tool_picker outputs "pi" or the shell path
- _wt_worktree_list returns JSON from wt list --format=json
Test: `bash -c 'source wt-common.sh && type _wt_fzf_opts && type _wt_tool_picker && type _wt_worktree_list'`
```

**🟢 GREEN — Make it pass**

```
Create tmux/.config/tmux/scripts/wt-common.sh with:
- _wt_fzf_opts(): returns fzf styling flags (--height, --border, --color tokyo-night palette)
- _wt_tool_picker(): fzf menu with "pi" and "$SHELL" options, outputs selection
- _wt_worktree_list(): runs `wt list --format=json` and outputs JSON
- _wt_get_default_branch(): parses wt list JSON for the default branch
- _wt_popup_size(): returns standard popup dimensions (70% x 70%)
```

**🔵 REFACTOR — Clean up**

```
Ensure consistent error handling (set -euo pipefail) and color variables.
```

### Step 2: Create wt-create.sh — create new worktree

**🔴 RED — Write a failing test**

```
Verify wt-create.sh is executable and has correct shebang.
Test: `bash -n wt-create.sh` (syntax check) and `test -x wt-create.sh`
```

**🟢 GREEN — Make it pass**

```
Create tmux/.config/tmux/scripts/wt-create.sh:
1. Source wt-common.sh
2. Get default branch from _wt_get_default_branch
3. Ask for base branch via fzf (list all branches via `git branch -a`)
4. Ask for new branch name via fzf --prompt (free text input)
5. Ask for tool via _wt_tool_picker
6. Run: wt switch --create <branch> --base <base>
7. Open new tmux window with chosen tool in the worktree directory:
   - If "pi": `tmux new-window -n <branch> -c <worktree_path> pi`
   - If shell: `tmux new-window -n <branch> -c <worktree_path>`
```

**🔵 REFACTOR**

```
Skip if clean.
```

### Step 3: Create wt-switch.sh — switch to existing worktree

**🔴 RED — Write a failing test**

```
Verify wt-switch.sh is executable and passes syntax check.
Test: `bash -n wt-switch.sh` and `test -x wt-switch.sh`
```

**🟢 GREEN — Make it pass**

```
Create tmux/.config/tmux/scripts/wt-switch.sh:
1. Source wt-common.sh
2. Get worktree list from _wt_worktree_list
3. If worktrees empty, show message and exit
4. Present fzf picker with worktree branches (mark current with *)
5. Ask for tool via _wt_tool_picker
6. Get worktree path from wt list JSON for selected branch
7. If tmux window named <branch> already exists, switch to it
8. Otherwise open new tmux window with chosen tool:
   - If "pi": `tmux new-window -n <branch> -c <worktree_path> pi`
   - If shell: `tmux new-window -n <branch> -c <worktree_path>`
```

**🔵 REFACTOR**

```
Extract window-opening logic into a shared function in wt-common.sh if duplicated with wt-create.sh.
```

### Step 4: Create wt-remove.sh — remove worktree

**🔴 RED — Write a failing test**

```
Verify wt-remove.sh is executable and passes syntax check.
Test: `bash -n wt-remove.sh` and `test -x wt-remove.sh`
```

**🟢 GREEN — Make it pass**

```
Create tmux/.config/tmux/scripts/wt-remove.sh:
1. Source wt-common.sh
2. Get worktree list from _wt_worktree_list
3. Present fzf picker with worktree branches (skip default/main)
4. Show dirty state indicator (*) for modified worktrees
5. If worktree has uncommitted changes, show confirmation prompt
6. Run: wt remove <branch>
7. If a tmux window named <branch> exists, kill it
8. Display success/error message
```

**🔵 REFACTOR**

```
Skip if clean.
```

### Step 5: Update tmux.conf — remove plugin, add keybindings

**🔴 RED — Write a failing test**

```
Verify tmux.conf no longer contains 'denesbeck/tmux-worktree' and does contain
wt-create/wt-switch/wt-remove keybindings.
Test: `grep -c 'denesbeck/tmux-worktree' tmux.conf` returns 0
      `grep -c 'wt-create' tmux.conf` returns 1+
```

**🟢 GREEN — Make it pass**

```
Edit tmux/.config/tmux/tmux.conf:
1. Remove: set -g @plugin 'denesbeck/tmux-worktree'
2. Add keybindings:
   bind W display-popup -E -w 70% -h 70% "bash ~/.config/tmux/scripts/wt-create.sh"
   bind w display-popup -E -w 70% -h 70% "bash ~/.config/tmux/scripts/wt-switch.sh"
   bind X display-popup -E -w 70% -h 70% "bash ~/.config/tmux/scripts/wt-remove.sh"
```

**🔵 REFACTOR**

```
Group keybindings with a comment header: "# --- Worktree (wt) ---"
```

### Step 6: Manual integration test — full workflow

**🔴 RED — Write a failing test**

```
Manual verification checklist (documented in plan):
1. `stow tmux` — verify symlinks created for scripts/ and tmux.conf
2. `tmux source-file ~/.config/tmux/tmux.conf` — verify no errors
3. prefix+W — verify popup opens with branch picker
4. Create test branch — verify worktree created and new window opens
5. prefix+w — verify existing worktree appears in picker
6. prefix+X — verify worktree removed and window closed
```

**🟢 GREEN — Make it pass**

```
Fix any issues found during manual testing. Typical fixes:
- Script paths (ensure stow symlink is correct)
- fzf interaction inside tmux popup
- Window naming collisions
- wt command failures (ensure wt is in PATH inside popup)
```

**🔵 REFACTOR**

```
Final cleanup: ensure consistent coding style, comments, error messages.
```

### Summary

| Step | Test                                                  | Implementation                                               |
| ---- | ----------------------------------------------------- | ------------------------------------------------------------ |
| 1    | Verify wt-common.sh functions exist                   | Create shared helpers (fzf opts, tool picker, worktree list) |
| 2    | Syntax check wt-create.sh                             | Create worktree with branch picker + tool choice             |
| 3    | Syntax check wt-switch.sh                             | Switch worktree with fzf picker + tool choice                |
| 4    | Syntax check wt-remove.sh                             | Remove worktree with dirty state warnings                    |
| 5    | Verify tmux.conf removes old plugin, adds keybindings | Edit tmux.conf: remove plugin, add W/w/X bindings            |
| 6    | Manual end-to-end workflow test                       | Fix issues found during manual testing                       |

### Progress Log

> This section is maintained by the tdd-implement skill. Do not edit manually.

**Status:** All steps complete ✅ — archived

| Step | 🔴 RED | 🟢 GREEN | 🔵 REFACTOR |
| ---- | ------ | -------- | ----------- |
| 1    | ✅     | ✅       | ⏭️          |
| 2    | ✅     | ✅       | ⏭️          |
| 3    | ✅     | ✅       | ⏭️          |
| 4    | ✅     | ✅       | ⏭️          |
| 5    | ✅     | ✅       | ✅          |
| 6    | ✅     | ✅       | ✅          |

### Notes

- tmux `display-popup -E` runs the command in the popup directly (no shell wrapper needed)
- Scripts run inside popup, so they have full terminal control for fzf
- `wt list --format=json` requires `jq` for parsing — need to check it's available
- Worktree path is needed to open tmux windows — get from `wt list --format=json`
- The `wt` binary must be in PATH inside the popup (linuxbrew path)
- Tool picker should default to showing both pi and $SHELL; could check which is installed
- Window names should use sanitized branch names (replace dots/slashes)
