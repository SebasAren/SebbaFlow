# Herdr

Herdr terminal workspace manager config.

## Layout Gotcha: config dir is also the state dir

Herdr keeps **runtime state in the config dir**: `~/.config/herdr/` holds `herdr.sock`,
`herdr-client.sock`, `herdr-server.log`, `herdr-client.log`, `session.json`,
`release-notes.json`, `.plugins.lock`. There is no XDG state split yet (upstream
discussion #1035).

So this package only stows `config.toml` as a **single-file symlink** into the
existing real `~/.config/herdr/` directory — the runtime files stay out of the
repo. `stow herdr` descends into the pre-existing dir and links only the config.

- Never commit runtime state from `~/.config/herdr/` (sockets, logs, session.json)
- `HERDR_CONFIG_PATH` env var would override the config file path, but the
  symlink approach is preferred so the repo stays the single source of truth

## Editing

Edit `herdr/.config/herdr/config.toml` in the repo — the symlink points at it,
changes reflect immediately. Validate with `herdr config check`.
