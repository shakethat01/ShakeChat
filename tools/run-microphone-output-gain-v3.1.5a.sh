#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

echo "=== ShakeChat Microphone Output Gain v3.1.5a ==="
echo

echo "[preflight] Mevcut useVoice kaynak sekline uyarlama..."
node --check tools/fix-microphone-output-gain-v3.1.5-source-shape.mjs
node tools/fix-microphone-output-gain-v3.1.5-source-shape.mjs

echo
bash tools/run-microphone-output-gain-v3.1.5.sh
