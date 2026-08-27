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

# Toolchain CLIs — mise shims first on PATH, then Homebrew.
check "pi" pi --version
check "mise" mise --version
check "luacheck" luacheck --version
check "selene" selene --version
check "shellcheck" shellcheck --version
check "stylua" stylua --version
check "ruff" ruff --version
check "shfmt" shfmt --version

# Pi extension unit tests (integration tests excluded, same as CI).
echo "== pi extensions (bun test) =="
cd "${HOME:?}/dotfiles/pi/.pi/agent/extensions" || fail "extensions dir missing"
bun test --parallel --path-ignore-patterns="**/integration.test.ts" || fail "bun test failed"

echo "smoke-test: OK"
