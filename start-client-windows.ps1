$ErrorActionPreference = "Stop"

Write-Host "" 
Write-Host "========================================" -ForegroundColor DarkCyan
Write-Host "      ShakeChat Remote Test Client" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor DarkCyan
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js bulunamadi." -ForegroundColor Red
    Write-Host "Once Node.js kurup bu scripti tekrar calistir." -ForegroundColor Yellow
    Read-Host "Cikmak icin Enter"
    exit 1
}

$serverIp = Read-Host "ShakeChat sunucusunun Tailscale IP adresi (100.x.x.x)"
$serverIp = $serverIp.Trim()

if ($serverIp -notmatch '^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.(\d{1,3})\.(\d{1,3})$') {
    Write-Host "Bu adres Tailscale IPv4 adresine benzemiyor: $serverIp" -ForegroundColor Red
    Read-Host "Cikmak icin Enter"
    exit 1
}

$env:VITE_API_ORIGIN = "http://${serverIp}:4000"

Write-Host "" 
Write-Host "API: $env:VITE_API_ORIGIN" -ForegroundColor Green
Write-Host "Paketler kontrol ediliyor..." -ForegroundColor Cyan

if (-not (Test-Path "node_modules")) {
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install basarisiz." }
}

Write-Host "" 
Write-Host "ShakeChat istemcisi baslatiliyor." -ForegroundColor Green
Write-Host "Tarayicida http://localhost:5173 adresini ac." -ForegroundColor Yellow
Write-Host "Bu PowerShell penceresini kapatma." -ForegroundColor DarkYellow
Write-Host ""

npm run dev -w @shakechat/web
