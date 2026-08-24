# Homebrew

Stowable Brewfile + `brew-sync` CLI for keeping personal Homebrew packages in sync across machines.

## Files

```
homebrew/
├── .local/bin/brew-sync    # CLI (stowed to ~/.local/bin/)
├── Brewfile                # Personal packages (excludes Bluefin system packages)
└── AGENTS.md
```

## Stow

```bash
stow homebrew    # symlinks ~/.local/bin/brew-sync + Brewfile
```

## Sync Workflow

### Export (machine A → repo)

```bash
brew-sync              # regenerate Brewfile from installed packages
git commit -m "chore: update Brewfile"
```

### Import (repo → machine B)

```bash
git pull
brew-sync install      # brew bundle from the Brewfile
```

### Full round-trip

```bash
brew-sync full         # regenerate + install
```

## Commands

| Command             | Action                                   |
| ------------------- | ---------------------------------------- |
| `brew-sync`         | Regenerate Brewfile (default subcommand) |
| `brew-sync sync`    | Same as above                            |
| `brew-sync install` | `brew bundle` from Brewfile              |
| `brew-sync full`    | Regenerate + install                     |

## Bluefin specifics

On Bluefin, system packages live in `/usr/share/ublue-os/homebrew/*.Brewfile`. `brew-sync` diffs `brew leaves` against these to include only your personal additions.

On non-Bluefin machines, the system Brewfiles won't exist — `brew-sync` will include _all_ explicitly installed packages (with a warning).

## Aliases

`brewfile` opens the Brewfile in nvim (from `bashrc/.bashrc.d/alias`).
