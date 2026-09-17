# macOS Base Bashrc

Minimal base `~/.bashrc` for macOS. Sources `/etc/bashrc`, sets up `PATH`, and
sources all files in `~/.bashrc.d/` (the modular config from the `bashrc`
stow). No Fedora/Bluefin bling — Homebrew shellenv is handled by
`~/.bashenv` (from the `bashrc` stow), which detects both Apple Silicon
(`/opt/homebrew`) and Intel (`/usr/local/Homebrew`) prefixes.

Also installs `~/.bash_profile`, which sources `~/.bashrc` — macOS Terminal
launches login shells, which read `.bash_profile` instead of `.bashrc`.
Without it, `.bashrc.d/` config would silently not load in new windows/tabs.

## Usage

```bash
stow bashrc macos-bashrc  # bashrc provides .bashenv + .bashrc.d/, this provides the base .bashrc + .bash_profile
stow -D macos-bashrc      # uninstall — removes the symlinks
```

## `macos-defaults` — system settings bootstrap

`.local/bin/macos-defaults` applies macOS system defaults that stock settings
get wrong for terminal work. Run it once after a fresh install:

```bash
macos-defaults           # Apply (prints before/after)
macos-defaults show      # Print current values, change nothing
```

**Log out and back in afterwards** — the keyboard values are read at login, so
relaunching the terminal is not enough.

### Why key repeat is set here

Key repeat is stored in 15ms ticks. macOS ships `KeyRepeat=6` (90ms, ~11
chars/sec) against the ~33 chars/sec typical of a Linux desktop, so held
`hjkl` moves roughly 3x slower than on Fedora/Bluefin. The script sets
`KeyRepeat=2` (~33/sec) and `InitialKeyRepeat=15` (225ms) — the System
Settings slider minimums. Override via env var for a different feel:

```bash
KEY_REPEAT=1 INITIAL_KEY_REPEAT=10 macos-defaults   # faster than the GUI allows
```

It also disables `ApplePressAndHoldEnabled`, so holding a key repeats instead
of opening the accent picker. Kitty and Ghostty bypass press-and-hold already;
GUI editors (Neovide, VS Code) do not.

### Why it is not sourced from `.bashrc`

These are one-time system settings, not shell environment. Sourcing them would
spawn three `defaults` subprocesses per shell start and silently overwrite any
adjustment made in System Settings.

## Making bash the default shell

macOS ships an ancient `/bin/bash` (3.2, GPLv2 licensing holdout — no
associative arrays, no modern completion). Install a current one via
Homebrew and register it before switching:

```bash
brew install bash
sudo sh -c 'echo "'"$(brew --prefix)"'/bin/bash" >> /etc/shells'   # requires sudo
chsh -s "$(brew --prefix)/bin/bash"                                 # requires your password
```

Log out/in (or open a new Terminal window) for the change to take effect.

## Note

This **replaces** `~/.bashrc`. Back up any existing `~/.bashrc` before
stowing. Stow will refuse if a real file exists at `~/.bashrc` (not a
symlink). Requires the `bashrc` stow for `.bashenv` and `.bashrc.d/` to be
useful — this package alone only provides the sourcing scaffold.
