#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(git rev-parse --show-toplevel)"
TMP="$(mktemp /tmp/apply-media-tuning-v2.8.XXXXXX.mjs)"
trap 'rm -f "$TMP"' EXIT
cat tools/media-patch-v2.8/part*.b64 | tr -d '\n\r' | base64 -d > "$TMP"
echo "96e2430dbb55a6dc82da46e940b43e24bf563f3d12ccdb878bd7ef6482fd8c0e  $TMP" | sha256sum -c -
node "$TMP"
