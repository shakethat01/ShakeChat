#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
BACKUP="/opt/shake/backups/shakechat-audio-session-v3.1.4-${STAMP}"
FILES=(
  "apps/web/src/useVoice.ts"
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
  echo "!!! v3.1.4 basarisiz. Kaynaklar geri yukleniyor..."
  for file in "${FILES[@]}"; do
    cp "$BACKUP/$file" "$file"
  done
  echo "Kaynaklar geri yuklendi: $BACKUP"
  echo "Onceki production dist'i geri kurmaya calisiyorum..."
  VITE_API_ORIGIN=same-origin npm run build >/tmp/shakechat-audio-session-v314-restore-build.log 2>&1 || {
    echo "UYARI: restore build basarisiz. Log: /tmp/shakechat-audio-session-v314-restore-build.log"
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

echo "=== ShakeChat Audio Session Stability v3.1.4 ==="
echo "Backup: $BACKUP"
echo

echo "[1/6] Patch syntax kontrolu..."
node --check tools/apply-audio-session-stability-v3.1.4.mjs

echo
echo "[2/6] Patch uygulanıyor..."
node tools/apply-audio-session-stability-v3.1.4.mjs

echo
echo "[3/6] Statik kontroller..."
grep -q "shakechat.voice-global-muted.v1" apps/web/src/useVoice.ts
grep -q "microphone processor missing; repairing" apps/web/src/useVoice.ts
grep -q "voice-user-muted" apps/web/src/App.tsx
grep -q "v3.1.3 diagnostic: AI-only, custom gate bypassed" apps/web/src/noiseGate.ts
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
echo "=== AUDIO SESSION v3.1.4 OTOMATIK KONTROLLER TEMIZ ==="
echo "Backup saklandi: $BACKUP"
echo "AI-only diagnostic korunuyor; gate hala bypass."
echo "Test: mute -> oda cik/gir; diger kullanici cik/gir; 15 dk ses karakteri; filtre watchdog loglari."
