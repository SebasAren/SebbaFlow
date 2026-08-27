# openshell/

Stow package for the OpenShell gateway (unit + TOML config). Binaries are **not** here — they come from mise (`github:NVIDIA/OpenShell` aliases in `mise/.config/mise/config.toml`). See `sandbox/README.md` for the full install + spike findings.

## Stow safety

`~/.config/openshell/` holds runtime state written by the CLI (`gateways/`, `active_gateway`, `last_sandbox`). Stow therefore links individual files into the existing real dir — never stow the whole config dir. Keep new files at `.config/openshell/<file>` so stow descends instead of replacing the dir.

## Gotchas

- The unit's `ExecStart` targets the **mise shim** (`~/.local/share/mise/shims/openshell-gateway`), not a versioned install path — it survives version bumps. Bumping the pinned version in mise config is all an upgrade needs (then `systemctl --user restart openshell-gateway`).
- `gateway.toml` is the stock v0.0.115 RPM template. Upstream default listener: `127.0.0.1:17670`, `compute_drivers = ["podman"]`. The DB URL never goes in TOML (env-only, `sqlite:$XDG_STATE_HOME/openshell/gateway/openshell.db`).
