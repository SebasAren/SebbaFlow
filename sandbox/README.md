# sandbox/

OpenShell-based agent sandboxes for SebbaFlow. Non-stow directory (like `docs/`, `tests/`) — host-level install is documented here, not symlinked.

**Spike outcome (issue #72): gate passed.** OpenShell v0.0.115 works on Bluefin with rootless Podman. Verified end-to-end: gateway (systemd user service, mTLS), `sandbox create/exec/connect` round-trip, and gateway-routed inference with our builder model (`zai/glm-5.3-flash`).

## Layout

```
sandbox/           # this README + future Containerfile/wtx/policy (#73–#76)
openshell/         # stowed: gateway systemd unit + gateway.toml
```

Install the stow package with `stow openshell` (unit + config land in `~/.config/systemd/user/` and `~/.config/openshell/` as symlinks).

Future: `Containerfile` + `build.sh` (#73), `wtx` CLI (#74), per-sandbox services (#75), `policy.toml` (#76).

## Install (reproducible)

Binaries are managed by mise via the `github:` backend — see the `[tool_alias]` / `[tools.openshell*]` block in `mise/.config/mise/config.toml`. Two tools, one repo: `openshell` (CLI, musl static) and `openshell-gateway` (daemon, gnu). Both pinned to an exact version.

1. **Binaries** (after stowing mise config):

   ```bash
   mise install
   ```

2. **Gateway unit + config** — from the `openshell/` stow package:

   ```bash
   stow openshell
   ```

   `gateway.toml` is the stock v0.0.115 RPM template (`gateway.toml.default`); the unit is the RPM's with `ExecStart` pointed at the mise shim. Defaults that matter: `compute_drivers = ["podman"]`, listener `127.0.0.1:17670`, mTLS auto-generated into `~/.local/state/openshell/tls` on first start.

3. **Start + register**:

   ```bash
   systemctl --user enable --now podman.socket openshell-gateway
   openshell gateway add --local https://127.0.0.1:17670
   openshell status   # → Status: Connected, Authentication: mTLS
   ```

Not yet done: `loginctl enable-linger` (needs sudo) — until then the gateway lives and dies with the login session.

## Deviations from the upstream RPM path (and why)

Documented like `wt/AGENTS.md` postmortems — concrete, command-level.

| Deviation                                                           | Why                                                                                                                                                                                                       |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No `rpm-ostree install` layering                                    | Requires sudo + reboot, and diverges the custom `sebbafin` OCI base. The mise route gives version pinning + rollback for free. Upgrade path: bake the RPMs into the base image instead.                   |
| Binaries from release tarballs via mise, not `/usr/bin`             | Same binaries the RPMs ship (musl CLI, gnu gateway); mise shims resolve them. The systemd unit targets `~/.local/share/mise/shims/openshell-gateway` (version-portable).                                  |
| `gateway.toml` + unit stowed via the `openshell/` package           | The RPM unit's `ExecStartPre` seeds the TOML from `/usr/share/openshell-gateway/gateway.toml.default`, which doesn't exist here — the repo carries a copy of that template instead.                       |
| Containerized gateway (`ghcr.io/nvidia/openshell/gateway`) not used | The RPM-path topology (systemd user service + podman driver) works on Bluefin as-is; container path adds the known SELinux/`8080:8080`/`XDG_STATE_HOME` mirroring pain for no gain. Not tested — no need. |

## Inference routing (provider story)

**Works: gateway-routed inference with `zai/glm-5.3-flash` via z.ai's Anthropic-compatible endpoint.**

```bash
ANTHROPIC_API_KEY="$ZAI_API_KEY" openshell provider create --name zai-anthropic \
  --type anthropic --credential ANTHROPIC_API_KEY \
  --config ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic
openshell inference set --provider zai-anthropic --model glm-5.3-flash
```

From inside a sandbox, agents use `ANTHROPIC_BASE_URL=https://inference.local` with any non-empty placeholder key — the privacy router strips caller credentials and injects the real ones. Verified with a live completion through the full chain.

**Does not work: z.ai's OpenAI-compatible endpoint** (`https://api.z.ai/api/coding/paas/v4`, what pi uses host-side). The router's `/v1` dedup heuristic (`build_backend_url` in `crates/openshell-router/src/backend.rs` @ v0.0.115) only strips the request's `/v1` prefix when the base URL's path starts with `/v1/` or ends with `/v1` — z.ai's `/v4` suffix matches neither, producing `/v4/v1/chat/completions` → 404. z.ai serves no `/v1` paths at all. Consequence for #74/#76: OpenAI-protocol clients inside sandboxes fall back to per-sandbox `--env` keys (isolated per container, but keys live in agent env — documented residual risk).

## Known quirks (v0.0.115)

- **One-shot trailing commands fail**: `sandbox create -- bash -c 'echo ok'` reliably enters `Error` phase (`MainProcessExited: Canonical main process exited`) — the command exits before provisioning reaches `Ready`. Workaround: use a persistent main process (`-- sleep 600`, or `--keep` + an agent) and run one-shots via `sandbox exec`.
- First `sandbox create` pulls two images (supervisor + base, ~70 s); subsequent creates are ~2 s.
- The gateway binds a second listener on the LAN interface (`compute-driver-callback`, sandbox-gRPC-only) — that's the pasta callback path, expected.
- Deleting any provider can momentarily flip `inference get` output scopes — the workspace route survives; re-check with the full `inference get` output.

## Verify (cheatsheet)

```bash
openshell status                                                    # gateway connected (mTLS)
openshell sandbox create --name t --keep -- sleep 600               # → Ready
openshell sandbox exec -n t -- id                                   # uid=998(sandbox)
openshell sandbox connect t                                         # SSH via openshell-main subsystem
openshell sandbox exec -n t -- curl -s https://inference.local/v1/messages \
  -H 'x-api-key: unused' -H 'anthropic-version: 2023-06-01' \
  -H 'content-type: application/json' \
  -d '{"model":"glm-5.3-flash","max_tokens":24,"messages":[{"role":"user","content":"hi"}]}'
openshell sandbox delete t
```
