#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
BACKUP="/opt/shake/backups/shakechat-audio-stability-v3-${STAMP}"
FILES=(
  "apps/web/src/noiseGate.ts"
  "apps/web/src/useVoice.ts"
  "apps/web/src/AppSettings.tsx"
  "apps/web/src/App.tsx"
)

mkdir -p "$BACKUP/apps/web/src"
for file in "${FILES[@]}"; do
  cp "$file" "$BACKUP/$file"
done

restored=0
restore_previous() {
  if [[ "$restored" == "1" ]]; then return; fi
  restored=1
  trap - ERR
  echo
  echo "!!! Audio Stability v3 adimi basarisiz. Kaynak dosyalar geri yukleniyor..."
  for file in "${FILES[@]}"; do
    cp "$BACKUP/$file" "$file"
  done
  echo "Kaynaklar geri yuklendi: $BACKUP"
  echo "Onceki production dist'i geri kurmaya calisiyorum..."
  VITE_API_ORIGIN=same-origin npm run build >/tmp/shakechat-audio-v3-restore-build.log 2>&1 || {
    echo "UYARI: restore build basarisiz. Log: /tmp/shakechat-audio-v3-restore-build.log"
    return
  }
  echo "Onceki web build'i geri kuruldu."
}

on_error() {
  local code=$?
  local line=${1:-unknown}
  echo "HATA: satir ${line}, exit ${code}"
  restore_previous
  exit "$code"
}
trap 'on_error $LINENO' ERR

echo "=== ShakeChat Audio Stability v3.0 ==="
echo "Backup: $BACKUP"
echo

echo "[1/6] Patch uygulanıyor..."
node tools/apply-audio-stability-v3.0.mjs

echo
 echo "[2/6] Statik verify..."
node tools/verify-audio-stability-v3.0.mjs

echo
 echo "[3/6] git diff --check..."
git diff --check

echo
 echo "[4/6] TypeScript typecheck..."
npm run typecheck

echo
 echo "[5/6] Production web build..."
VITE_API_ORIGIN=same-origin npm run build

echo
 echo "[6/6] Tum testler..."
LIVEKIT_PUBLIC_URL=ws://localhost:7880 npm test

trap - ERR

echo
echo "=== AUDIO STABILITY v3.0 OTOMATIK KONTROLLER TEMIZ ==="
echo "Backup saklandi: $BACKUP"
echo "Degisiklikler commit edilmedi; once iki kisilik gercek ses testi yap."
echo
echo "Onerilen test:"
echo "  1) Dengeli: sessizlik + klavye"
echo "  2) Dengeli: konusurken hizli klavye"
echo "  3) Guclu: ayni iki test"
echo "  4) 15-30 dk kesintisiz konusma"
echo "  5) ekran paylasimi ac/kapat sonrasi mic kontrolu"
