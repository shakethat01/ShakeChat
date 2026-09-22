#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
BACKUP="/opt/shake/backups/shakechat-desktop-backend-v0.1-${STAMP}"
GATEWAY="apps/api/src/messages/messages.gateway.ts"
mkdir -p "$BACKUP/apps/api/src/messages"
cp "$GATEWAY" "$BACKUP/$GATEWAY"

restore_previous(){
  trap - ERR
  echo
  echo "!!! Desktop backend v0.1 basarisiz, Socket.IO gateway geri yukleniyor..."
  cp "$BACKUP/$GATEWAY" "$GATEWAY"
  npm run build -w @shakechat/api >/tmp/shakechat-desktop-backend-restore.log 2>&1 || true
  sudo systemctl restart shakechat-api || true
  echo "Geri yuklendi: $BACKUP"
}
trap 'code=$?; echo "HATA: satir $LINENO, exit $code"; restore_previous; exit $code' ERR

echo "=== ShakeChat Desktop Backend v0.1 ==="
echo "Backup: $BACKUP"
node tools/apply-desktop-api-cors-v0.1.mjs
npm run build -w @shakechat/api
sudo systemctl restart shakechat-api
sleep 2
sudo systemctl is-active --quiet shakechat-api
curl -fsS -o /dev/null https://shakechat.duckdns.org/api/health || true
trap - ERR

echo
echo "=== DESKTOP BACKEND v0.1 HAZIR ==="
echo "REST + Socket.IO artik Tauri localhost originlerini kabul ediyor."
echo "shakechat-api: active"
