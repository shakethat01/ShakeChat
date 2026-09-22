param(
  [switch]$Build
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js bulunamadi.' }
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { throw 'Rust/Cargo bulunamadi. ShakeChat Desktop native ses icin Rust gerekli.' }

Write-Host '=== ShakeChat Desktop Native Audio ===' -ForegroundColor Cyan
Write-Host "Repo: $root"
node --version
cargo --version

Write-Host "`n[1/2] Workspace paketleri..." -ForegroundColor Yellow
npm install

if ($Build) {
  Write-Host "`n[2/2] Release desktop EXE build..." -ForegroundColor Yellow
  npm run desktop:build
  Write-Host "`nHazir: apps\desktop\src-tauri\target\release\shakechat-desktop.exe" -ForegroundColor Green
} else {
  Write-Host "`n[2/2] Desktop dev baslatiliyor..." -ForegroundColor Yellow
  Write-Host 'Tauri runtime native Rust/LiveKit ses motorunu; browser ise eski web motorunu kullanir.'
  npm run desktop:dev
}
