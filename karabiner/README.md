# Karabiner-Elements (macOS)

Keyboard remapping for macOS. Three things live here:

- **`caps-lock.json`** — caps_lock acts as control when held with another key,
  escape when tapped alone. The Linux side of this repo gets that from the
  desktop environment; on macOS a key daemon has to provide it.
- **`kitty-hotkey.json`** — `Ctrl+Alt+T` opens kitty, the GNOME terminal hotkey
  reproduced on macOS. There is no built-in "global shortcut launches an app"
  setting to use instead.
- **`.local/bin/kitty-open`** — the script that hotkey runs.

Both rules are importable assets, not the live config — see
[Enabling a rule](#enabling-a-rule) and
[Why only the asset files are stowed](#why-only-the-asset-files-are-stowed).

## Stow

```bash
stow karabiner
```

This symlinks:

- `.config/karabiner/assets/complex_modifications/caps-lock.json` → a rule
  Karabiner can import
- `.config/karabiner/assets/complex_modifications/kitty-hotkey.json` → likewise
- `.local/bin/kitty-open` → `~/.local/bin/kitty-open`

## Enabling a rule

An asset file is only a rule Karabiner can _import_ — importing copies it into
`karabiner.json`, which is what the daemon actually reads. Stowing a rule does
not switch it on. On a fresh machine, for each of the two rules:

1. **GUI** — Karabiner-Elements → Complex Modifications → Add rule → enable it.
2. **By hand** — append the rule object (the entries under `rules` in the asset
   file) to `profiles[].complex_modifications.rules` in
   `~/.config/karabiner/karabiner.json`. Karabiner watches the file and reloads
   within a second; `~/.local/share/karabiner/log/console_user_server.log`
   confirms with `core_configuration is updated`.

Both rules are already enabled on this machine.

**Karabiner-Elements must be running** for the hotkey to fire — it is a
LaunchAgent, not a one-shot config. Check with `pgrep -fil Karabiner` —
the `-i` matters, the processes are `Karabiner-Core-Service` and
`Karabiner-Console-User-Server`, so a lowercase `pgrep -fl karabiner` finds
nothing and looks like the daemon is down.

## How `kitty-open` behaves

```bash
kitty-open   # new OS window in the running kitty, or a cold start
```

`kitty.conf` sets `allow_remote_control yes` and
`listen_on unix:/tmp/kitty-${USER}`, so the script asks the running instance
for a new OS window (`kitty @ launch --type=os-window`) instead of spawning a
second app process. That matches GNOME's `Ctrl+Alt+T`, where every press adds
a window to one process. Only if no socket answers does it `open -na kitty`.

Three macOS details it works around:

- **Karabiner's minimal environment** — `shell_command` runs from
  `karabiner_console_user_server`, so `PATH`, `USER` and `HOME` cannot be
  assumed. Every binary is called by absolute path; the user comes from
  `id -un`.
- **kitty appends the PID** to the `listen_on` path, so the real socket is
  `/tmp/kitty-sebas-58342`, not `/tmp/kitty-sebas`. The script globs for it.
- **`/tmp` is a symlink to `/private/tmp`** — `find /tmp -maxdepth 1` matches
  nothing, because `find` does not follow a symlink given as its argument.
  Hence the shell glob.

Override the binary with `KITTY_BIN=/path/to/kitty kitty-open`; it falls back
to `/Applications/kitty.app/Contents/MacOS/kitty` when the Homebrew one is
absent.

## Why only the asset files are stowed

Karabiner **rewrites `karabiner.json` itself** on every GUI change and drops
timestamped copies into `~/.config/karabiner/automatic_backups/`. Stowing that
file would put the app in a fight with a symlink into the repo, and the backups
are runtime state that does not belong in git. Files under
`assets/complex_modifications/` are only ever _read_ by Karabiner, so they are
safe to own from the repo.

The cost of that split: the repo holds the rule definitions, but which rules are
active — and in what order — lives only in `karabiner.json`. Editing a stowed
asset does not change live behaviour until the rule is re-imported. Keep the two
in sync by hand.

## Alternatives considered

- **skhd** — a purpose-built hotkey daemon with a one-line config. Rejected
  only because Karabiner was already installed and already had Accessibility
  and Input Monitoring permissions; skhd would add a second daemon and a
  second grant.
- **Automator Quick Action / Services shortcut** — fires only in apps that
  expose a Services menu, so it is not global.
- **Shortcuts.app keyboard shortcut** — system-wide in principle, but slow to
  trigger and swallowed by fullscreen apps.
