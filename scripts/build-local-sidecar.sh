#!/usr/bin/env bash
set -euo pipefail
source_dir="${1:?Usage: bash scripts/build-local-sidecar.sh <pinned-sidecar-checkout>}"
expected=2e22ff0a2898e69ea4bf5275bce1be8581a8582a
test "$(git -C "$source_dir" rev-parse HEAD)" = "$expected"
git -C "$source_dir" diff --exit-code HEAD --quiet
# Only tracked pinned source enters the build; ignored wallets/config cannot enter its context.
git -C "$source_dir" archive "$expected" | docker build --label "org.opencontainers.image.revision=$expected" -t aftershock-sidecar:2e22ff0 -
docker pull ghcr.io/forshtat/eip8141-devnet@sha256:c9a7770f892e02255999e1c0ffd596ecee704d9175c2480811ccdcfa1c2224c6
