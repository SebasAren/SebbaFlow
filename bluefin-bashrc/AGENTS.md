# Bluefin Base Bashrc

Bluefin's default `~/.bashrc` with inlined bling (from `projectbluefin/common`). Installs the bluefin shell experience on non-bluefin systems (e.g., bazzite).

## What It Includes

### Fedora default `.bashrc`

- Sources `/etc/bashrc` (system-wide definitions)
- Adds `~/.local/bin` and `~/bin` to `PATH`
- Sources all files in `~/.bashrc.d/` (your modular config from the `bashrc` stow)

### Inlined bling.sh (from `projectbluefin/common`)

- **eza** aliases: `ls`, `ll`, `l.`, `l1` (gracefully skipped if not installed)
- **ugrep** aliases: `grep`, `egrep`, `fgrep`, `xzgrep`, etc.
- **bat** alias: `cat` → `bat --style=plain --pager=never`
- **bash-preexec** initialization (for direnv compatibility)
- **direnv** shell hook
- **starship** prompt initialization
- **zoxide** (`z`) initialization
- **mise** runtime activation
- Atuin disabled by default (matches upstream — uncomment to enable)

All tools are guarded with `command -v` checks, so nothing breaks if a tool isn't installed.

mise activation is intentionally omitted from the bling section to avoid double-activation with `~/.bashrc.d/mise` (from the `bashrc` stow). If using `bluefin-bashrc` without the `bashrc` stow, add `eval "$(mise activate bash)"` manually.

## Usage

```bash
stow bluefin-bashrc    # install — replaces ~/.bashrc with bluefin base
stow -D bluefin-bashrc # uninstall — removes the symlink
```

### Install CLI tools

```bash
brew install eza bat starship zoxide direnv bash-preexec ugrep atuin tealdeer fd
```

(`ripgrep`, `mise` ship with Bluefin's system Brewfile at `/usr/share/ublue-os/homebrew/`)

## Note

This **replaces** `~/.bashrc`. Back up any existing `~/.bashrc` before stowing. Stow will refuse if a real file exists at `~/.bashrc` (not a symlink).

## Sources

- Fedora default `.bashrc`: shipped in bluefin's `/etc/skel/.bashrc`
- bling.sh: https://github.com/projectbluefin/common/blob/main/system_files/shared/usr/share/ublue-os/bling/bling.sh
- starship profile: https://github.com/ublue-os/bluefin/blob/main/system_files/shared/etc/profile.d/90-bluefin-starship.sh
