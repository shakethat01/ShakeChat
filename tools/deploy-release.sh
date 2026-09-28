#!/usr/bin/env bash
# Run on the existing VPS; database schema changes require their own reviewed rollout.
set -Eeuo pipefail
umask 077

: "${RELEASE_SHA:?RELEASE_SHA is required}"
[[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]]
ROOT=/opt/shake/shakechat
BACKUP_ROOT=/opt/shake/backups
PUBLIC_ORIGIN=https://chat.shakethat.com.tr
STAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
BACKUP="$BACKUP_ROOT/shakechat-web-api-$STAMP"
cd "$ROOT"

# Complete backups before changing the checked-out source or either build.
test -d apps/api/dist
test -d apps/web/dist
mkdir -p "$BACKUP"
cp -a apps/api/dist "$BACKUP/api-dist"
cp -a apps/web/dist "$BACKUP/web-dist"
PREVIOUS_SHA=$(git rev-parse HEAD)
printf '%s\n' "$PREVIOUS_SHA" > "$BACKUP/commit.txt"
git diff HEAD --binary > "$BACKUP/local.patch"

restore_previous() {
  code=$?
  trap - ERR
  set +e
  echo "Deploy failed; restoring previous web/API builds and dependencies."
  git reset --hard "$PREVIOUS_SHA"
  if [ -s "$BACKUP/local.patch" ]; then git apply "$BACKUP/local.patch"; fi
  npm ci
  npm run db:generate
  rm -rf apps/api/dist apps/web/dist
  cp -a "$BACKUP/api-dist" apps/api/dist
  cp -a "$BACKUP/web-dist" apps/web/dist
  sudo systemctl restart shakechat-api
  if ! sudo systemctl is-active --quiet shakechat-api; then
    echo "API rollback requires attention. Backup: $BACKUP"
  fi
  exit "$code"
}
trap restore_previous ERR

git fetch --prune origin
git checkout -B release/updater-test "$RELEASE_SHA"
git reset --hard "$RELEASE_SHA"
npm ci
npm run db:generate
npm run build -w @shakechat/api
VITE_API_ORIGIN="$PUBLIC_ORIGIN" npm run build -w @shakechat/web
printf '%s\n' "$RELEASE_SHA" > apps/web/dist/version.txt
test -s apps/api/dist/main.js
test -s apps/web/dist/index.html

sudo systemctl restart shakechat-api
sudo systemctl is-active --quiet shakechat-api
# This checks both the API process and its database connection after restart.
curl -fsS --retry 8 --retry-all-errors --retry-delay 2 --max-time 10 \
  "$PUBLIC_ORIGIN/api/health" | node -e 'let s=""; process.stdin.on("data",x=>s+=x); process.stdin.on("end",()=>{if(JSON.parse(s).status!=="ok")process.exit(1)})'
actual=$(curl -fsS --max-time 15 "$PUBLIC_ORIGIN/version.txt?sha=$RELEASE_SHA" | tr -d '\r\n')
test "$actual" = "$RELEASE_SHA"
curl -fsS --max-time 15 -o /dev/null "$PUBLIC_ORIGIN/"
trap - ERR
echo "Web and API deploy complete: $RELEASE_SHA; backup: $BACKUP"
