#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
BACKUP="/opt/shake/backups/shakechat-speaker-gain-v3.1.6-${STAMP}"
FILES=(
  "apps/web/src/useVoice.ts"
  "apps/web/src/preferences.ts"
  "apps/web/src/AppSettings.tsx"
)

mkdir -p "$BACKUP/apps/web/src"
for file in "${FILES[@]}"; do cp "$file" "$BACKUP/$file"; done

restore_previous() {
  trap - ERR
  echo
  echo "!!! v3.1.6 basarisiz. Kaynaklar geri yukleniyor..."
  for file in "${FILES[@]}"; do cp "$BACKUP/$file" "$file"; done
  VITE_API_ORIGIN=same-origin npm run build >/tmp/shakechat-speaker-gain-v316-restore.log 2>&1 || true
  echo "Kaynaklar geri yuklendi: $BACKUP"
}
trap 'code=$?; echo "HATA: satir $LINENO, exit $code"; restore_previous; exit $code' ERR

echo "=== ShakeChat Speaker Output Gain v3.1.6 ==="
echo "Backup: $BACKUP"
echo

echo "[1/5] Patch syntax..."
node --check tools/apply-speaker-output-gain-v3.1.6.mjs

echo "[2/5] Patch..."
node tools/apply-speaker-output-gain-v3.1.6.mjs

echo "[3/5] Statik kontroller..."
grep -q "speakerGainPercent" apps/web/src/preferences.ts
grep -q "Hoparlör çıkış seviyesi" apps/web/src/AppSettings.tsx
grep -q "webAudioMix: true" apps/web/src/useVoice.ts
grep -q "applyParticipantPlayback" apps/web/src/useVoice.ts
git diff --check

echo "[4/5] Typecheck + build..."
npm run typecheck
VITE_API_ORIGIN=same-origin npm run build

echo "[5/5] Testler..."
LIVEKIT_PUBLIC_URL=ws://localhost:7880 npm test

trap - ERR
echo
echo "=== SPEAKER OUTPUT GAIN v3.1.6 OTOMATIK KONTROLLER TEMIZ ==="
echo "Backup saklandi: $BACKUP"
echo "Ayarlar > Ses & goruntu > Mikrofon isleme: Hoparlor cikis seviyesi 0-200%, varsayilan 100%."
echo "Not: Bu ayar gelen sesi etkiler. Kelime yutma GTCRN/AI filtre tarafidir ve ayri ele alinacak."
