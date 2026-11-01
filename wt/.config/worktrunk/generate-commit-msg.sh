#!/usr/bin/env bash
# Generate a commit message from the prompt wt sends via stdin.
# Used by wt's squash/commit generation.
#
# wt sends its built-in prompt to stdin: task, format, style, guidance, a
# <commits> section with the subjects being squashed, diffstat, and diff.
# We prepend conventional-commit instructions, pipe the prompt to pi, and
# on failure fall back to the squashed commits' own subjects (or a
# diff-stat line on the non-squash commit path, which has no <commits>).
set -euo pipefail

# Source pi model settings if available
if [[ -f ~/.bashrc.d/pi_models ]]; then
	# shellcheck source=/dev/null
	source ~/.bashrc.d/pi_models
fi

# Read wt's full prompt from stdin
prompt=$(cat)

# Prepend conventional commit format instructions so pi generates proper format
conventional_prefix='IMPORTANT: Your output is used directly as the git commit message.
You MUST use Conventional Commits format: <type>(<scope>): <description>

Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
Do NOT wrap output in code fences. Output ONLY the commit message, nothing else.

'
prompt="${conventional_prefix}${prompt}"

# Build pi arguments
pi_args=("-p" "--no-tools" "--no-extensions" "--no-skills" "--no-session" "--no-prompt-templates" "--thinking" "off")
if [[ -n "${CHEAP_MODEL:-}" ]]; then
	pi_args+=("--model" "$CHEAP_MODEL")
fi

# Temporary files for pi output; stderr is kept separate so it can never
# leak into a "successful" message
tmp_out=$(mktemp)
tmp_err=$(mktemp)
trap 'rm -f "$tmp_out" "$tmp_err"' EXIT

# Run pi: two attempts, 60s ceiling each. Empty output counts as failure.
for _attempt in 1 2; do
	if timeout 60 pi "${pi_args[@]}" "$prompt" >"$tmp_out" 2>"$tmp_err"; then
		commit_msg=$(sed -e '/./,$!d' -e ':a' -e '/^\n*$/{$d;N;ba}' "$tmp_out")
		if [[ -n "$commit_msg" ]]; then
			echo "$commit_msg"
			exit 0
		fi
	fi
done

echo "WARNING: pi failed to generate commit message; using fallback." >&2
if [[ -s "$tmp_err" ]]; then
	tail -n 5 "$tmp_err" >&2
fi

# Fallback 1: wt's squash prompt embeds the subjects being squashed in
# <commits>; for a single-commit branch that subject is already the right
# message. The section is absent on the non-squash commit path.
subjects=$(sed -n '/^<commits/,/^<\/commits>/p' <<<"$prompt" |
	sed -e '/^<commits/d' -e '/^<\/commits>/d' -e 's/^- //' |
	sed -e '/./,$!d')
if [[ -n "$subjects" ]]; then
	first_subject=$(head -n 1 <<<"$subjects")
	other_subjects=$(tail -n +2 <<<"$subjects" | sed -e '/./,$!d')
	if [[ -n "$other_subjects" ]]; then
		bulleted=${other_subjects//$'\n'/$'\n- '}
		printf '%s\n\n- %s\n' "$first_subject" "$bulleted"
	else
		echo "$first_subject"
	fi
	exit 0
fi

# Fallback 2: describe the diff itself (non-squash commit path)
files_changed=$(grep -c '^diff --git' <<<"$prompt" || true)
if ((files_changed == 0)); then
	echo "WARNING: nothing to describe - no commits and no diff; aborting." >&2
	exit 1
elif ((files_changed == 1)); then
	filename=$(grep -m1 '^diff --git' <<<"$prompt" | sed 's|^diff --git a/||;s| b/.*||')
	echo "chore: update $filename"
else
	echo "chore: update $files_changed files"
fi
