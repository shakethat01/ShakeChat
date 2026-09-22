#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(git rev-parse --show-toplevel)"

BACKUP="${1:-}"
if [[ -z "$BACKUP" ]]; then
  BACKUP="$(ls -1dt /opt/shake/backups/shakechat-audio-stability-v3-* 2>/dev/null | head -n 1 || true)"
fi

if [[ -z "$BACKUP" || ! -d "$BACKUP" ]]; then
  echo "Audio Stability v3 backup bulunamadi."
  echo "Kullanim: bash tools/restore-audio-stability-v3.sh /opt/shake/backups/shakechat-audio-stability-v3-..."
  exit 1
fi

FILES=(
  "apps/web/src/noiseGate.ts"
  "apps/web/src/useVoice.ts"
  "apps/web/src/AppSettings.tsx"
  "apps/web/src/App.tsx"
)

for file in "${FILES[@]}"; do
  if [[ ! -f "$BACKUP/$file" ]]; then
    echo "Backup eksik: $BACKUP/$file"
    exit 1
  fi
done

for file in "${FILES[@]}"; do
  cp "$BACKUP/$file" "$file"
done

echo "Kaynak dosyalar geri yuklendi: $BACKUP"
echo "Production web build geri kuruluyor..."
VITE_API_ORIGIN=same-origin npm run build

echo "Restore tamam. Tarayicida yeni index no-cache oldugu icin yeniden yukleme yeterli; gerekirse Ctrl+F5 kullan."
