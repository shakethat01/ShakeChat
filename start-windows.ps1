$ErrorActionPreference = "Stop"
Write-Host "[ShakeChat] Ortam hazirlaniyor..." -ForegroundColor Cyan

if (!(Test-Path ".env")) { Copy-Item ".env.example" ".env" }
if (!(Test-Path "apps/api/.env")) { Copy-Item ".env" "apps/api/.env" }

Write-Host "[ShakeChat] Docker servisleri baslatiliyor..." -ForegroundColor Cyan
docker compose up -d

Write-Host "[ShakeChat] NPM paketleri kuruluyor..." -ForegroundColor Cyan
npm install

Write-Host "[ShakeChat] Prisma hazirlaniyor..." -ForegroundColor Cyan
npm run db:generate
npm run db:migrate

Write-Host "[ShakeChat] Uygulama baslatiliyor..." -ForegroundColor Green
npm run dev
