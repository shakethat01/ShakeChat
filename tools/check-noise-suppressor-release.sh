#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(git rev-parse --show-toplevel)"

CURRENT="$(node -p "require('./apps/web/package.json').dependencies['@sapphi-red/web-noise-suppressor']")"
LATEST="$(npm view @sapphi-red/web-noise-suppressor version)"

echo "ShakeChat pinned: $CURRENT"
echo "npm latest      : $LATEST"

if [[ "$LATEST" == "0.4.0" ]]; then
  echo "0.4.1 henuz npm latest degil. v3.1 worklet-reuse mitigasyonu kullanilmaya devam edecek."
  exit 0
fi

node - "$LATEST" <<'NODE'
const latest = process.argv[2];
const parts = latest.split('.').map(Number);
const newEnough = (parts[0] > 0) || (parts[1] > 4) || (parts[1] === 4 && parts[2] >= 1);
if (!newEnough) process.exit(1);
NODE

echo "Yeni surum mevcut. 0.4.1+ upstream worklet destroy/release duzeltmesini iceriyor olabilir."
echo "OTOMATIK YUKSELTME YAPILMADI. Once changelog/CI kontrol edip ayri patch olarak deneyin."
