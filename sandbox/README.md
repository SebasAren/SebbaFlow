# sandbox/

Agent-sandbox toolchain: the OCI image baked from this repo (issue #73), the OpenShell gateway spike that consumes it (#72), and `wtx` — the per-worktree sandbox CLI (#74). Non-stow directory except `sandbox/.local/bin/wtx` (stowed onto `~/.local/bin` by `stow sandbox`).

**Toolchain image (issue #73): built and smoke-tested.** See [Toolchain image](#toolchain-image-issue-73) below.

**Spike outcome (issue #72): gate passed.** OpenShell v0.0.115 works on Bluefin with rootless Podman. Verified end-to-end: gateway (systemd user service, mTLS), `sandbox create/exec/connect` round-trip, and gateway-routed inference with our builder model (`zai/glm-5.3-flash`).

## Layout

```
sandbox/
├── .local/bin/wtx     # per-worktree sandbox CLI (issue #74; `stow sandbox` → ~/.local/bin)
├── Containerfile      # toolchain image (issues #73/#74)
├── build.sh           # build + tag sandbox:<sha>
├── smoke-test.sh      # runs inside the image (build gate + ad hoc)
├── mise.global.toml   # checked-in copy of the host's global mise pins
└── README.md          # this file
openshell/            # stowed: gateway systemd unit + gateway.toml (incl. driver block)
```

The `openshell/` package (one level up) is stowed with `stow openshell` (unit + config land in `~/.config/systemd/user/` and `~/.config/openshell/` as symlinks). `stow sandbox` links only `.local/bin/wtx` — the `.stowrc` ignores the package's non-stowable files.

Landed: `wtx` CLI (#74), per-sandbox services + in-image pre-merge verification (#75). Future: policy allowlisting (#76).

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

| Deviation                                                               | Why                                                                                                                                                                                          |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mise` stow package skipped; `sandbox/mise.global.toml` COPY'd instead  | The image must own its global pins (never read the host's), and stowing the package would collide with the COPY'd file at `~/.config/mise/config.toml`.                                      |
| Flatpak entries stripped from the Brewfile                              | No flatpak daemon in a container.                                                                                                                                                            |
| `ripgrep` installed via apt, not added to the Brewfile                  | Shell-out dependency of the extension tests (CI installs it the same way); the Brewfile stays the host's source of truth.                                                                    |
| `libxml2` installed via apt                                             | Runtime dependency of the postgres binaries the postgres-binary plugin ships (#75); the theseus-rs builds link it dynamically, the host just happens to have it.                             |
| `postgres-binary` mise plugin declared in `sandbox/mise.global.toml`    | Per-sandbox postgres (#75), pin matched to root-mono's db daemon (15.4.3). The plugin is not built into mise nor in its registry — declared at a pinned ref so `mise install` bootstraps it. |
| Explicit stow package list instead of `stow */`                         | `docs/`, `tests/`, `sandbox/`, `usage-dashboard/` are non-stow directories; the repo `.stowrc` is retargeted to the image `$HOME` (it hardcodes the host path).                              |
| Base pinned to `ghcr.io/homebrew/brew:6.0.20`                           | Official Homebrew-on-Linux image (Ubuntu 24.04, glibc 2.39) — brew preinstalled, formula set frozen with the base. Bump the tag (manually or via renovate) to refresh.                       |
| mise installer pinned (`MISE_VERSION=v2026.8.14`)                       | One less floating input — two builds of the same SHA diverge only when a pinned input bumps. Current stable — pinned-github resolution skips the releases API.                               |
| GitHub attestation re-verification skipped at build-time `mise install` | The shared builder IP exhausts the unauthenticated GitHub API budget. Artifacts still come from pinned repos over HTTPS; the host re-verifies the same pins. CI-with-token can re-enable.    |

### Drift warning: `mise.global.toml`

`sandbox/mise.global.toml` started as a manual transcription of the host global pins (`mise/.config/mise/config.toml`), but github-backend tools (herdr, pitchfork, tree-sitter) now carry exact pins so the image build never needs the GitHub API — the host may run newer `latest` versions. Nothing keeps the two files in sync yet. The lower-risk copy was chosen on purpose — moving the pins into the repo proper changes host behavior; that migration is a follow-up decision.

### Smoke test

`sandbox/smoke-test.sh` runs as the image's final build layer (a failing check fails the build) and can be run ad hoc:

```bash
podman run --rm sandbox:<sha> bash /home/linuxbrew/dotfiles/sandbox/smoke-test.sh
```

It verifies `pi`, `mise`, `luacheck`, `selene`, `shellcheck`, `stylua`, `ruff`, `shfmt`, `psql`, `node`, `python` all report versions (the last three guard the repo mise.toml tools — they only exist when `mise install` ran from the repo dir), then runs the pi extension unit tests (`bun test`, integration tests excluded — same as CI).

Latest verified build: all version checks pass, extension suite **529 tests / 41 files, 0 failures**; `pi` resolves via the mise shim, `luacheck`/`selene` via Homebrew, `rg`/`libxml2` via apt, `psql` via the postgres-binary plugin, `node`/`python` via the repo mise.toml pins. Secrets-absence checked: no `auth.json`/`settings.json`/`sessions/` in the image, no key-shaped strings in the stowed trees.

### Rebuild trigger

Manual (`sandbox/build.sh`) for now. **Rebuild after landing Containerfile / `sandbox/mise.global.toml` / `mise.toml` changes** — worktrees resolve their image by HEAD sha (falling back to the nearest tagged ancestor), and an untagged HEAD fails `wtx up`/`wtx check` loudly. Upgrade path: a CI job on merge to main that builds and pushes `sandbox:<sha>` to a registry, so worktrees can pin by digest instead of a host-local tag.

## Per-sandbox services (issue #75)

Every worktree sandbox runs its own postgres, reachable at **`localhost:5432` from inside the sandbox only**. Each sandbox has its own network namespace, so concurrent worktrees all get "the regular port" — there is no port allocation logic anywhere, and `DATABASE_URL=postgresql://postgres@localhost:5432/postgres` is the identical string in every sandbox (`wtx enter` and `wtx check` export it; projects override it via their own `mise.toml [env]`, the built-in `postgres` role/db are just the working floor).

- **Binary source**: mise `postgres-binary:postgres` = 15.4.3 in `sandbox/mise.global.toml` — same backend and pin as root-mono's db daemon. The backend is a mise _plugin_ (not built in, not in the registry), declared at a pinned ref under `[plugins]`; it downloads precompiled binaries (~70 MB) that need `libxml2` (added to the image's apt line). Shims: `initdb`, `postgres`, `pg_ctl`, `pg_isready`, `psql`, `createuser`, …
- **PGDATA**: `<worktree>/.data/pg` (gitignored). Data survives sandbox restarts and image swaps and dies with worktree removal. Logs: `.data/postgres.log`. Init is `initdb -U postgres -E utf8` (trust auth on localhost — dev floor, never exposed beyond the netns). **Bumping the postgres major** (e.g. 15 → 16) makes `pg_ctl start` refuse the old on-disk format — migrate the cluster or wipe `<worktree>/.data/pg`; `wtx up` re-initializes an empty dir (the real reason then lives in `.data/postgres.log`).
- **Lifecycle owner**: `wtx up` (post-start hook) — after create it execs a bootstrap that starts postgres via `pg_ctl -w start`. The postmaster is daemonized in its own session, so it **survives the exec closing** (verified live); OpenShell supervises the sandbox itself, not the service. Idempotent: `pg_isready` short-circuits, crash recovery is handled by the normal startup path (stale `postmaster.pid` from a hard kill is retried once).
- **Teardown**: `wtx down` (pre-merge hook, after checks). Deleting the sandbox kills the postmaster; PGDATA persists until the worktree is removed. Services stay alive during `pre-merge` checks by hook order.
- **copy-ignored**: `.data/` is excluded from `wt step copy-ignored` via `[step.copy-ignored] exclude` in `.config/wt.toml` — a fresh worktree starts with an empty database, never a copy of another worktree's data.

**Rejected lifecycle owners** (decided empirically, kept for the record): pitchfork inside the sandbox (own `XDG_STATE_HOME`) works but adds a supervisor daemon + generated config for a service that just runs; `openshell service expose` is HTTP-only and exposes _outward_ — structurally wrong for sandbox-local TCP. Day-two services (redis, minio) use the same owner mechanism: a `wtx up`-exec'd bootstrap in the image, PGDATA-style state under `.data/`, an idempotent `ensure_*` in `wtx`, and — for anything needing a pinned version — a mise pin in `sandbox/mise.global.toml` rather than a nested container.

# In-image pre-merge verification (issue #75)

`wt merge` no longer trusts the host toolchain. The `[[pre-merge]] check` hook is **`sandbox/.local/bin/wtx check`** (repo-relative — wt runs pre-merge hooks with cwd = worktree root, so the gate works from any checkout, no host-side wtx deploy required): it ensures the sandbox and its postgres, then runs `mise run check` **inside the sandbox image** against the worktree (bind-mounted at the same path). Exit code propagates to wt. Host-side `mise run check` is meaningless for gating — the image owns the toolchain.

- **Offline by design**: the sandbox egress proxy 403s everything except the inference surface, so the check cannot install or version-resolve tools at run time. This is why `mise.toml` carries **exact pins** (no `latest`) and why the image bakes every repo tool: `mise install` in the Containerfile runs **from the repo dir** (project configs are CWD-discovered — from `$HOME` it silently bakes only the global pins, which bit us live).
- **Trust**: repo `mise.toml` is plain pins → mise "safe config" → no trust prompt in-image.
- The check reads the same git-ignored file set as the host: repo `.gitignore` carries `**/.claude/settings.local.json` explicitly because the image has no global git excludes.

# wtx — per-worktree sandboxes (issue #74)

`sandbox/.local/bin/wtx` gives every wt worktree its own OpenShell sandbox from the `sandbox:<sha>` image, so agent execution (pi, builds) runs isolated from the host while herdr panes, wt hooks and git stay host-side.

```bash
wtx up       # ensure the sandbox exists + postgres runs (idempotent; wt post-start hook)
wtx enter    # interactive shell inside the sandbox (prompt: wtx❯; exports DATABASE_URL)
wtx check    # `mise run check` inside the image (pre-merge gate, issue #75)
wtx down     # delete the sandbox (idempotent; wt pre-merge hook, after check)
wtx status   # recorded image vs live sandbox, drift + postgres state
wtx doctor   # reap managed sandboxes whose worktree no longer records them
```

### Model

- **One sandbox per worktree**, named `<repo>-<branch>` (sanitized). OpenShell caps names at **19 chars** — longer pairs are truncated; if that candidate is taken by a _different_ worktree's sandbox, a stable `sha256` suffix is appended (≤19 chars). `.sandbox-info` (gitignored, worktree-local) records the authoritative name, image tag + image ID, and is what `wtx doctor` treats as proof a worktree still wants its sandbox.
- **Image resolution**: `sandbox:<HEAD-short-sha>`; if no image exists for HEAD (worktree branched ahead of the last build), the nearest tagged ancestor wins (≤100 commits back). `WTX_IMAGE=<tag>` overrides.
- **Scoped bind mounts** (same absolute path on host and in the sandbox, via `--driver-config-json`): the worktree (RW), the main repo's `.git` gitdir (RW — linked worktrees point at it, so git must have it), and the herdr unix socket (RW). **Never `$HOME`.** Requires `enable_bind_mounts` + `userns = "keep-id"` in `[openshell.drivers.podman]` (landed in `openshell/gateway.toml`; keep-id is what makes in-sandbox writes land owned by the host user, not a subuid).
- **Landlock filesystem policy** passed at create (the default policy is unusable for this image: `/home` is neither executable nor writable under it, so mise shims and pi session dirs get `EACCES`): default `read_only` baseline, plus read-write for the container-local image home (`/home/linuxbrew` — pi sessions, agent state), the worktree, gitdir and socket. Policy is locked at creation — `policy set` on a live sandbox does not re-apply Landlock until stop/start.
- **Sandbox `$HOME` is `/sandbox`** (runtime-injected), which breaks mise's global-config lookup. `wtx enter` sets `HOME=/home/linuxbrew`, `PS1=wtx❯ ` (deterministic gate marker for herdr) and passes `TERM` + the herdr env (`HERDR_ENV`, `HERDR_SOCKET_PATH`, `HERDR_PANE_ID` when set) into the exec. The herdr socket path is identical inside and outside, so pi's state hook reports through the mount without translation.
- The main process is `--detach --keep -- sleep infinity` (one-shot trailing commands fail — see known quirks); all real work goes through `sandbox exec`.

### Lifecycle walkthroughs

**Human wt flow:**

```bash
wt switch --create feat-x    # worktree + hooks; post-start runs `wtx up` (sandbox + postgres)
wtx enter                    # shell inside the sandbox (prompt: wtx❯, DATABASE_URL exported)
# ... work, commit inside the sandbox (git works: gitdir is mounted) ...
wt merge                     # pre-merge: `wtx check` (in-image verification) → `wtx down`
```

**Supervisor / herdr delegation** (canonical recipe):

```bash
# 1. Worktree + sandbox (post-start hook), adopt as a herdr workspace
JSON=$(wt switch --create feat-x --no-cd --format json | tail -1)
WT_PATH=$(echo "$JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin)["path"])')
RES=$(herdr worktree open --path "$WT_PATH" --no-focus)
WS=$(echo "$RES" | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["workspace"]["workspace_id"])')
PANE=$(echo "$RES" | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["root_pane"]["pane_id"])')

# 2. Gate the HOST shell, then enter the sandbox and gate its marker
herdr pane wait-output "$PANE" --match "❯" --source recent-unwrapped --timeout 30000
herdr pane run "$PANE" "wtx enter"
herdr pane wait-output "$PANE" --match "wtx❯" --source recent-unwrapped --timeout 60000

# 3. Start pi INSIDE the sandbox. NOT `herdr agent start` — the pane's
#    foreground process is the `wtx enter` exec client, not a shell, so
#    agent start fails with agent_pane_busy. Type pi directly; herdr
#    tracks state via pi's hook reports through the mounted socket.
herdr pane run "$PANE" "pi --approve"        # --approve: trust dialog pre-cleared
herdr agent wait "$PANE" --until idle --timeout 60000
herdr agent prompt "$PANE" "You are a worker in a wt worktree. …task…" --wait --timeout 600000
herdr agent read "$PANE" --source recent --lines 100

# 4. Merge from anywhere; pre-merge runs `wtx check` (in-image) then `wtx down`
wt -C "$WT_PATH" merge
herdr workspace close "$WS"
```

**Recovery paths:** a pane whose sandbox was restarted shows the host `❯` again — re-run `pane run "$PANE" "wtx enter"`. A red-merge worktree (failed `wtx check`) keeps its sandbox by design (teardown runs after the check); `wtx up` recreates a deleted one (PGDATA in `.data/` survives). `wtx doctor` reaps anything whose worktree is gone.

**Prereqs (once):** see [Deploy checklist](#deploy-checklist) — gateway driver block + restart, image with `iproute2` + `libxml2` + postgres, and pre-approval for the exact hook strings `wtx up || true`, `sandbox/.local/bin/wtx check`, and `wtx down || true`.

### Deploy checklist

```bash
sandbox/build.sh                                # 1. rebuild image (iproute2 + libxml2 + postgres since #75)
stow openshell && stow sandbox                  # 2. driver block + wtx onto ~/.local/bin
systemctl --user restart openshell-gateway      # 3. apply enable_bind_mounts + keep-id
wt config approvals add --yes                   # 4. approve the hook strings, incl. the in-image merge gate
                                                #    `sandbox/.local/bin/wtx check` (+ existing
                                                #    `wtx up || true` / `wtx down || true`); the command
                                                #    takes no positional argument — approve interactively
wtx up && wtx status                            # 5. verify: sandbox Ready + postgres ready; then:
wt merge                                        # 6. pre-merge now gates on in-image verification
```

Until step 3 is done, `wtx up` fails fast with the bind-mounts hint (validated live — the error surfaces the exact `[openshell.drivers.podman]` fix); hooks swallow the failure by design.

### Spike findings (live-gateway verification, #74)

| Finding                                                                                                                                                      | Consequence                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Sandbox runtime needs the `ip` helper; image lacked it (exit-1 in provisioning)                                                                              | `iproute2` added to the Containerfile; **rebuild required**                 |
| Sandbox names cap at 19 chars                                                                                                                                | Truncate + hash-suffix naming; `.sandbox-info` records the real name        |
| Label values reject `/` and `:`                                                                                                                              | Labels carry sanitized repo/branch/image-tag only                           |
| Default Landlock policy: `/home` not executable, not writable                                                                                                | Custom policy at create (`/home/linuxbrew` RW + mount targets)              |
| Runtime injects `$HOME=/sandbox` (breaks mise global pins)                                                                                                   | `wtx enter` sets `HOME=/home/linuxbrew`                                     |
| `policy set` on a live sandbox doesn't re-apply Landlock                                                                                                     | Policy passed at create; stop/start re-applies                              |
| Rootless RW mounts land owned by a subuid without keep-id                                                                                                    | `userns = "keep-id"` in the gateway driver block (deploy pending)           |
| herdr `agent start` refuses panes whose foreground isn't a shell                                                                                             | Recipe types `pi --approve` via `pane run`; no `agent start` (input to #76) |
| herdr agent tracking **requires** the socket hook: no `agent start` arming through the exec relay and no hook reports without the socket → `agent_not_found` | The socket mount is a requirement, not an escape hatch; #76 consumes this   |
| `pi --approve` through the relay behaves identically (no trust dialog; TUI ready)                                                                            | Trust flow confirmed; pi ships unauthenticated (credentials = #5)           |

Related: `pi/.pi/agent/extensions/herdr-agent-state.ts` reports state via `HERDR_SOCKET_PATH` + `HERDR_PANE_ID` — both propagated by `wtx enter`, pointing at the same-path mounted socket.

### Live findings (per-sandbox services + in-image check, #75)

All verified against the live gateway on Bluefin (SELinux enforcing, rootless podman):

| Finding                                                                                                                                                                                                           | Consequence                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Bind mounts + custom policy: the runtime's `prepare_filesystem` runs `create_dir_all` on every `read_write` policy path — a **file** there (the herdr socket) kills provisioning with `File exists (os error 17)` | Policy grants target the socket's **parent directory**, never the socket file; `wtx down/up` after any policy change                      |
| SELinux enforcing: host paths carry no container label, so every in-sandbox write into the worktree died with `EACCES`                                                                                            | Bind mounts pass `selinux_label: "shared"` (podman `z`) — `shared`, not `private`, because the gitdir/socket are mounted by every sandbox |
| The runtime injects an egress proxy (`10.200.0.1:3128`) that 403s everything but the inference surface                                                                                                            | The check flow is offline by design: exact pins everywhere, all tools baked (see above); #76 owns the allowlist                           |
| The image never baked the repo `mise.toml` tools (#73–#74 latent): `mise install` ran from `$HOME`, and project configs are CWD-discovered                                                                        | Containerfile runs `mise install` from the repo dir; smoke test guards `node`/`python`/`shellcheck`                                       |
| The postgres-binary backend is a mise _plugin_ — not built in, not in the registry                                                                                                                                | Declared under `[plugins]` at a pinned ref in `sandbox/mise.global.toml`; needs `libxml2` via apt                                         |
| The image has no global git excludes (`~/.config/git/ignore`)                                                                                                                                                     | `.gitignore` must carry machine-local patterns itself (e.g. `**/.claude/settings.local.json`) or in-image checks see a different file set |
| `wtx doctor` reaps any managed sandbox without a live info-file claim — concurrent agents on one gateway can reap each other's sandboxes mid-flight                                                               | Doctor needs mutual exclusion or a per-worktree liveness check (input to #76)                                                             |
| PGDATA under the worktree survives sandbox delete + image swap: `wtx down && wtx up` restarts postgres on the recovered data dir                                                                                  | Keep PGDATA in the worktree; never inside the container filesystem                                                                        |

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
