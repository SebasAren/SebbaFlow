#!/usr/bin/env bash
# credential-audit — in-sandbox proof that no host secrets reached the agent
# environment or filesystem (issue #76).
#
# Run it the way agents run: inside `wtx enter` (`wtx audit` does this for
# you, injecting the same env). It enumerates the environment (names only —
# values are never printed), scans for key-shaped values, checks the usual
# secret paths are absent from every reachable home, and proves the host
# home is unreachable (Landlock). Worktree write access is asserted too —
# agents MAY write their worktree; that is the threat model, not a leak.
#
# Findings are printed as names/paths only, never values.
#
# Usage:
#   credential-audit [--host-home DIR] [--worktree DIR] [--socket PATH]
#                    [--allow VAR1,VAR2] [--placeholder VALUE] [--version]
#
# Exit codes: 0 clean, 1 findings (or check failures), 2 usage error.
set -euo pipefail

HOST_HOME="" WORKTREE="" SOCKET="" ALLOW="" PLACEHOLDER="wtx-gateway-placeholder"
findings=0

usage_err() {
	printf 'credential-audit: %s\n' "$*" >&2
	exit 2
}

note() { printf '  · %s\n' "$*"; }
pass() { printf '  ✓ %s\n' "$*"; }
fail() {
	printf '  ✗ FAIL: %s\n' "$*" >&2
	findings=$((findings + 1))
}

# --- args -----------------------------------------------------------------
while [[ $# -gt 0 ]]; do
	case "$1" in
	--host-home)
		HOST_HOME="${2:?}"
		shift 2
		;;
	--worktree)
		WORKTREE="${2:?}"
		shift 2
		;;
	--socket)
		SOCKET="${2:?}"
		shift 2
		;;
	--allow)
		ALLOW="${2:?}"
		shift 2
		;;
	--placeholder)
		PLACEHOLDER="${2:?}"
		shift 2
		;;
	--version)
		echo "credential-audit 1 (dotfiles sandbox, issue #76)"
		exit 0
		;;
	*)
		usage_err "unknown argument: $1"
		;;
	esac
done

# --- env enumeration + key-shape scan --------------------------------------
# Shapes: Anthropic/OpenAI-style sk- keys, GitHub tokens (ghp_/github_pat_),
# AWS key ids, Slack/Google/GLua/DigitalOcean/npm/PyPI/HuggingFace tokens,
# age secret keys, PEM blocks. Plus: any *KEY*/*TOKEN*/*SECRET*/*PASS*/*
# CREDENTIAL* variable holding a >=16-char value. Allowlisted: the gateway
# placeholder and --allow names (documented WTX_PASS_ENV fallback).
declare -a allowed_names=()
if [[ -n "$ALLOW" ]]; then
	IFS=',' read -r -a allowed_names <<<"$ALLOW"
fi
name_allowed() {
	local n
	for n in "${allowed_names[@]}"; do
		[[ "$n" == "$1" ]] && return 0
	done
	return 1
}

value_is_secret() {
	local v="$1"
	case "$v" in
	*"-----BEGIN"*) return 0 ;;
	esac
	if [[ "$v" =~ sk-ant- || "$v" =~ sk-[A-Za-z0-9_-]{16,} || "$v" =~ gh[posur]_ ||
		"$v" =~ github_pat_ || "$v" =~ AKIA[0-9A-Z]{16} || "$v" =~ ASIA[0-9A-Z]{16} ||
		"$v" =~ xox[abprs]- || "$v" =~ glpat- || "$v" =~ dop_v1_ ||
		"$v" =~ AIza[0-9A-Za-z_-]{35} || "$v" =~ ^npm_[A-Za-z0-9]{20,} ||
		"$v" =~ ^pypi- || "$v" =~ ^hf_[A-Za-z0-9]{20,} || "$v" =~ ^AGE-SECRET-KEY- ]]; then
		return 0
	fi
	return 1
}

secret_name_re='(^|_)(KEY|TOKEN|SECRET|PASSWD|PASSWORD|CREDENTIALS?)(_|$)'

echo "== environment =="
env_names="$(env | cut -d= -f1 | sort)"
printf '  · %d variables (names only): %s\n' "$(wc -l <<<"$env_names")" "$(tr '\n' ' ' <<<"$env_names" | sed 's/ $//')"
while IFS='=' read -r name; do
	[[ -n "$name" ]] || continue
	value="${!name-}"
	[[ -n "$value" ]] || continue
	if [[ "$name" == "ANTHROPIC_API_KEY" && "$value" == "$PLACEHOLDER" ]]; then
		continue # gateway-routed placeholder, not a credential
	fi
	if name_allowed "$name"; then
		note "$name is set and allowlisted (--allow) — per-sandbox key fallback in use (residual risk: value lives in agent env)"
		continue
	fi
	if value_is_secret "$value"; then
		fail "$name holds a key-shaped value"
	elif ((${#value} >= 16)) && [[ "$name" =~ $secret_name_re ]]; then
		fail "$name matches *KEY*/*TOKEN*/*SECRET*/… and holds a >=16 char value"
	fi
done <<<"$env_names"
if [[ -n "${ANTHROPIC_BASE_URL:-}" ]]; then
	note "ANTHROPIC_BASE_URL=$ANTHROPIC_BASE_URL (gateway-routed inference)"
fi
((findings == 0)) && pass "no key-shaped values outside allowlist"

# --- secret paths ----------------------------------------------------------
echo "== secret paths =="
check_absent() {
	local p="$1"
	if [[ -e "$p" ]]; then
		fail "secret path present: $p"
	else
		pass "absent: $p"
	fi
}
for home in /home/linuxbrew "${HOME:-/sandbox}"; do
	# NOTE: .secrets.tpl is deliberately NOT checked — it is a TRACKED
	# placeholder template stowed by the bashrc package (no values). The
	# rendered ~/.secrets (values) is host-only and is checked.
	[[ -d "$home" ]] || continue
	[[ "$home" == "${seen_home:-}" ]] && continue
	seen_home="$home"
	for p in \
		"$home/.secrets" "$home/.netrc" "$home/.git-credentials" \
		"$home/.ssh" "$home/.gnupg" "$home/.aws" "$home/.kube" \
		"$home/.config/gh/hosts.yml" "$home/.local/state/openshell" \
		"$home/dotfiles/pi/.pi/agent/auth.json" \
		"$home/dotfiles/pi/.pi/agent/settings.json" \
		"$home/dotfiles/pi/.pi/agent/sessions"; do
		check_absent "$p"
	done
done

# --- Landlock: host home must be unreachable -------------------------------
echo "== filesystem containment =="
if [[ -z "$HOST_HOME" ]]; then
	# Derive from the worktree bind-mount path (same path host-side):
	# /var/home/<user>/… or /home/<user>/….
	if [[ -n "$WORKTREE" ]]; then
		case "$WORKTREE" in
		/var/home/*/*) HOST_HOME="$(cut -d/ -f1-4 <<<"$WORKTREE")" ;;
		/home/*/*) HOST_HOME="$(cut -d/ -f1-3 <<<"$WORKTREE")" ;;
		esac
	fi
fi
if [[ -n "$HOST_HOME" && "$HOST_HOME" != "/home/linuxbrew" ]]; then
	if ls "$HOST_HOME" >/dev/null 2>&1; then
		fail "host home $HOST_HOME is listable — Landlock not scoped as expected"
	else
		pass "host home $HOST_HOME unreadable (Landlock)"
	fi
	if ls "$HOST_HOME/.ssh" >/dev/null 2>&1; then
		fail "host .ssh listable at $HOST_HOME/.ssh"
	else
		pass "host $HOST_HOME/.ssh unreadable"
	fi
else
	note "no host home to test (pass --host-home or --worktree for the Landlock proof)"
fi
if ls /home >/dev/null 2>&1; then
	note "/home is listable (listing the parent is harmless if children are denied)"
else
	pass "/home itself unreadable — only allowlisted children reachable"
fi

# --- by-design access (threat model, not a leak) ----------------------------
echo "== by-design access =="
if [[ -n "$WORKTREE" && -d "$WORKTREE" ]]; then
	probe="$WORKTREE/.credential-audit-probe.$$"
	if touch "$probe" 2>/dev/null; then
		rm -f "$probe"
		pass "worktree $WORKTREE writable (agents MAY write their worktree)"
	else
		fail "worktree $WORKTREE not writable — expected RW by threat model"
	fi
fi
if [[ -n "$SOCKET" ]]; then
	if [[ -S "$SOCKET" ]]; then
		note "herdr socket $SOCKET visible (mount present) — connects currently denied under Landlock (one-way; see sandbox/README.md threat model)"
	else
		note "herdr socket $SOCKET not present in this sandbox"
	fi
fi

echo "== result =="
if ((findings > 0)); then
	printf 'credential-audit: FAIL (%d finding(s))\n' "$findings" >&2
	exit 1
fi
echo "credential-audit: PASS — no host secrets in env or reachable filesystem"
