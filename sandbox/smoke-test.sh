#!/usr/bin/env bash
# Smoke test for the sandbox toolchain image. Runs inside the container —
# at build time (final Containerfile layer) and ad hoc via:
#   podman run --rm sandbox:<sha> bash /home/linuxbrew/dotfiles/sandbox/smoke-test.sh
set -euo pipefail

fail() {
	echo "smoke-test: FAIL: $*" >&2
	exit 1
}

check() {
	local name="$1"
	shift
	echo "== ${name} =="
	"$@" || fail "${name} failed"
}

# Anchor to the repo root regardless of caller cwd: at build time the RUN
# layer starts in the image HOME, and repo mise.toml tools (node, python,
# the aqua shellcheck) only resolve from a directory under the project config.
# Repo tools must resolve here — wtx check runs offline and cannot install them.
cd "$(dirname "$(readlink -f "$0")")/.."

# Toolchain CLIs — mise shims first on PATH, then Homebrew.
check "pi" pi --version
check "mise" mise --version
check "luacheck" luacheck --version
check "selene" selene --version
check "shellcheck" shellcheck --version
check "stylua" stylua --version
check "ruff" ruff --version
check "shfmt" shfmt --version
check "psql" psql --version # postgres for per-sandbox services (issue #75)
# Repo mise.toml tools (issue #75): these must be BAKED, not resolved at run
# time — `wtx check` runs offline and cannot install or resolve versions.
# They only exist when `mise install` ran from the repo dir (see Containerfile).
check "node" node --version
check "python" python --version
check "shellcheck (mise)" mise exec -- shellcheck --version

# Credential audit binary (issue #76) — presence only; the checks need a
# real sandbox (Landlock, mounts) and would false-FAIL at build time.
check "credential-audit" credential-audit --version

# Pi extension unit tests (integration tests excluded, same as CI).
echo "== pi extensions (bun test) =="
cd "${HOME:?}/dotfiles/pi/.pi/agent/extensions" || fail "extensions dir missing"
bun test --parallel --path-ignore-patterns="**/integration.test.ts" || fail "bun test failed"

echo "smoke-test: OK"
