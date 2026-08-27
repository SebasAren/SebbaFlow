# sandbox/

Agent-sandbox toolchain: the OCI image baked from this repo (issue #73) and the OpenShell gateway spike that consumes it (#72). Non-stow directory (like `docs/`, `tests/`) — nothing here is symlinked.

**Toolchain image (issue #73): built and smoke-tested.** See [Toolchain image](#toolchain-image-issue-73) below.

**Spike outcome (issue #72): gate passed.** OpenShell v0.0.115 works on Bluefin with rootless Podman. Verified end-to-end: gateway (systemd user service, mTLS), `sandbox create/exec/connect` round-trip, and gateway-routed inference with our builder model (`zai/glm-5.3-flash`).

## Layout

```
sandbox/
├── Containerfile      # toolchain image (issue #73)
├── build.sh           # build + tag sandbox:<sha>
├── smoke-test.sh      # runs inside the image (build gate + ad hoc)
├── mise.global.toml   # checked-in copy of the host's global mise pins
└── README.md          # this file
openshell/            # stowed: gateway systemd unit + gateway.toml
```

The `openshell/` package (one level up) is stowed with `stow openshell` (unit + config land in `~/.config/systemd/user/` and `~/.config/openshell/` as symlinks).

Future: `wtx` CLI (#74), per-sandbox services (#75), `policy.toml` (#76).

## Toolchain image (issue #73)

An OCI image that snapshots the repo's full agent toolchain: stow packages into `$HOME`, the `homebrew/Brewfile` CLIs, and every mise pin (repo `mise.toml` + the global pins). Tagged by the git SHA it was built from, so an image is always traceable to the exact repo state that produced it. Consumers: OpenShell sandboxes (#3) or plain `podman run` — this issue survives a gateway failure.

### Build

```bash
sandbox/build.sh
```

Builds with podman from a `git archive HEAD` context and tags `sandbox:<short-sha>` + `sandbox:latest`, then prints build time, size, and image ID. The `org.opencontainers.image.revision` label carries the full SHA. First build pulls the ~1.4 GB base and takes roughly 15–25 min (brew bundle + mise installs); warm rebuilds are faster.

**Tag convention:** `sandbox:<short-sha>` identifies the repo state an image was built from — use it, never `latest`, when a worktree records which image it ran under (reproducibility). It is not content-immutable: rebuilding the same SHA re-tags it (`latest` tool pins resolve at build time). Record the image ID printed by `build.sh` when you need bit-exact identity; the long-term fix is the registry + digest pinning upgrade path below.

### Secrets are excluded by design

The build context is a `git archive` tar — tracked files only. Everything sensitive is gitignored and therefore structurally absent from the image: `pi/.pi/agent/auth.json`, `settings.json`, `sessions/`, and the `~/.secrets.tpl` + Proton Pass material (never in the repo in the first place). The image ships **pi unauthenticated** — the credential story belongs to issue #5. A repo-root `.containerignore` is a second safety net for manual `podman build .` runs.

### Deliberate deviations from the host setup

| Deviation                                                               | Why                                                                                                                                                                                       |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mise` stow package skipped; `sandbox/mise.global.toml` COPY'd instead  | The image must own its global pins (never read the host's), and stowing the package would collide with the COPY'd file at `~/.config/mise/config.toml`.                                   |
| Flatpak entries stripped from the Brewfile                              | No flatpak daemon in a container.                                                                                                                                                         |
| `ripgrep` installed via apt, not added to the Brewfile                  | Shell-out dependency of the extension tests (CI installs it the same way); the Brewfile stays the host's source of truth.                                                                 |
| Explicit stow package list instead of `stow */`                         | `docs/`, `tests/`, `sandbox/`, `usage-dashboard/` are non-stow directories; the repo `.stowrc` is retargeted to the image `$HOME` (it hardcodes the host path).                           |
| Base pinned to `ghcr.io/homebrew/brew:6.0.20`                           | Official Homebrew-on-Linux image (Ubuntu 24.04, glibc 2.39) — brew preinstalled, formula set frozen with the base. Bump the tag (manually or via renovate) to refresh.                    |
| mise installer pinned (`MISE_VERSION=v2026.8.14`)                       | One less floating input — two builds of the same SHA diverge only when a pinned input bumps. Current stable — pinned-github resolution skips the releases API.                            |
| GitHub attestation re-verification skipped at build-time `mise install` | The shared builder IP exhausts the unauthenticated GitHub API budget. Artifacts still come from pinned repos over HTTPS; the host re-verifies the same pins. CI-with-token can re-enable. |

### Drift warning: `mise.global.toml`

`sandbox/mise.global.toml` started as a manual transcription of the host global pins (`mise/.config/mise/config.toml`), but github-backend tools (herdr, pitchfork, tree-sitter) now carry exact pins so the image build never needs the GitHub API — the host may run newer `latest` versions. Nothing keeps the two files in sync yet. The lower-risk copy was chosen on purpose — moving the pins into the repo proper changes host behavior; that migration is a follow-up decision.

### Smoke test

`sandbox/smoke-test.sh` runs as the image's final build layer (a failing check fails the build) and can be run ad hoc:

```bash
podman run --rm sandbox:<sha> bash /home/linuxbrew/dotfiles/sandbox/smoke-test.sh
```

It verifies `pi`, `mise`, `luacheck`, `selene`, `shellcheck`, `stylua`, `ruff`, `shfmt` all report versions, then runs the pi extension unit tests (`bun test`, integration tests excluded — same as CI).

Latest verified build: all version checks pass, extension suite **529 tests / 41 files, 0 failures**; `pi` resolves via the mise shim, `luacheck`/`selene` via Homebrew, `rg` via apt. Secrets-absence checked: no `auth.json`/`settings.json`/`sessions/` in the image, no key-shaped strings in the stowed trees.

### Rebuild trigger

Manual (`sandbox/build.sh`) for now. Upgrade path: a CI job on merge to main that builds and pushes `sandbox:<sha>` to a registry, so worktrees can pin by digest instead of a host-local tag.

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
