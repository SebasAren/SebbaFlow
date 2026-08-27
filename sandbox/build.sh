#!/usr/bin/env bash
# Build the agent toolchain image, tagged by the git SHA it was built from.
#
# Context is `git archive HEAD` — tracked files only, so gitignored secrets
# and runtime state (pi auth/settings/sessions, node_modules, .git) never
# enter the image. Dirty-worktree changes are therefore NOT in the image;
# a warning is printed below.
#
# Usage: sandbox/build.sh
set -euo pipefail

IMAGE="sandbox"
REPO_ROOT="$(git rev-parse --show-toplevel)"
SHORT_SHA="$(git rev-parse --short HEAD)"
FULL_SHA="$(git rev-parse HEAD)"

if [ -n "$(git status --porcelain)" ]; then
	echo "WARNING: dirty worktree — building the HEAD snapshot (${SHORT_SHA}); uncommitted changes are excluded." >&2
fi

archive="$(mktemp)"
trap 'rm -f "${archive}"' EXIT
git archive --format=tar -o "${archive}" HEAD

echo "==> Building ${IMAGE}:${SHORT_SHA} (brew bundle + mise installs — takes a while)"
start=$SECONDS
podman build \
	--label "org.opencontainers.image.revision=${FULL_SHA}" \
	--tag "${IMAGE}:${SHORT_SHA}" \
	--tag "${IMAGE}:latest" \
	--file "${REPO_ROOT}/sandbox/Containerfile" \
	- <"${archive}"
elapsed=$((SECONDS - start))

echo "==> Done in ${elapsed}s"
podman image ls "${IMAGE}" --format 'table {{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.Created}}'
echo "==> Image ID: $(podman image inspect "${IMAGE}:${SHORT_SHA}" --format '{{.Id}}')"
