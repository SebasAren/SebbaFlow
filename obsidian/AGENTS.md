# Obsidian

Stowed scripts for the personal wiki at `~/Documents/wiki/`, based on [Andrej Karpathy's LLM wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).

## What's Here

| Path                                 | Description                                           |
| ------------------------------------ | ----------------------------------------------------- |
| `.local/bin/issue`                   | Issue tracker CLI (create, list, move, block, close)  |
| `.local/lib/issue/`                  | Issue tracker implementation                          |
| `.local/lib/wiki-core/`              | Shared frontmatter, I/O, and constants for wiki tools |
| `Documents/wiki/templates/issue.md`  | Templater template for creating issues from Obsidian  |
| `Documents/wiki/issues-dashboard.md` | Dataview dashboard for issue tracking                 |

## Issue Tracker

File-based issue tracker stored in `~/Documents/wiki/wiki/issues/`. Issues are markdown files with YAML frontmatter (`type`, `status`, `project`, `tags`, `created`, `blocked-by`).

### Entry Points

- **CLI**: `issue new <slug> --project <name>`, `issue list`, `issue move`, `issue block`, `issue close`
- **Obsidian**: Templater template creates issues via hotkey, Dataview dashboard renders status views

### Views (Dataview)

The `issues-dashboard.md` provides: Backlog, In Progress, Done, Blocked, and By Project tables.

## Stow

```bash
stow obsidian    # install
stow -D obsidian # uninstall
```
