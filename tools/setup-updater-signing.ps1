$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Repo = 'shakethat01/ShakeChat'
$KeyDir = Join-Path $HOME '.tauri'
$KeyPath = Join-Path $KeyDir 'shakechat-updater.key'
$PublicKeyPath = "$KeyPath.pub"

Set-Location $RepoRoot
New-Item -ItemType Directory -Path $KeyDir -Force | Out-Null

Write-Host '=== ShakeChat updater signing setup ===' -ForegroundColor Cyan
Write-Host "Repo: $RepoRoot"
Write-Host "Private key: $KeyPath"
Write-Host 'Private key repo disinda kalacak ve ekrana basilmayacak.' -ForegroundColor Yellow

npm install
if ($LASTEXITCODE -ne 0) { throw 'npm install basarisiz.' }

if (-not (Test-Path $KeyPath)) {
  Write-Host 'Updater imza anahtari olusturuluyor...'
  npx tauri signer generate -w $KeyPath --ci
  if ($LASTEXITCODE -ne 0) { throw 'Tauri updater anahtari olusturulamadi.' }
}

if (-not (Test-Path $PublicKeyPath)) { throw "Public key bulunamadi: $PublicKeyPath" }
$PublicKey = (Get-Content -Raw $PublicKeyPath).Trim()
if ([string]::IsNullOrWhiteSpace($PublicKey)) { throw 'Public key bos.' }

$env:SHAKECHAT_UPDATER_PUBLIC_KEY = $PublicKey
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = $KeyPath
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue

& (Join-Path $PSScriptRoot 'inject-updater-public-key.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Updater public key Tauri config icine yazilamadi.' }

$Gh = Get-Command gh -ErrorAction SilentlyContinue
if ($Gh) {
  gh auth status *> $null
  if ($LASTEXITCODE -eq 0) {
    Write-Host 'GitHub Actions updater anahtarlari ayarlaniyor...'
    Get-Content -Raw $KeyPath | gh secret set TAURI_SIGNING_PRIVATE_KEY --repo $Repo
    if ($LASTEXITCODE -ne 0) { throw 'GitHub private key secreti ayarlanamadi.' }
    gh variable set TAURI_SIGNING_PUBLIC_KEY --repo $Repo --body $PublicKey
    if ($LASTEXITCODE -ne 0) { throw 'GitHub public key variable ayarlanamadi.' }
    Write-Host 'GitHub secret + public variable tamam.' -ForegroundColor Green
  } else {
    Write-Host 'GitHub CLI var ama oturum acik degil. Local installer yine olusturulacak.' -ForegroundColor Yellow
  }
} else {
  Write-Host 'GitHub CLI bulunamadi. Local installer yine olusturulacak; GitHub secret ayari sonra yapilabilir.' -ForegroundColor Yellow
}

Write-Host 'Updater-capable NSIS installer build ediliyor...'
npm run desktop:build
if ($LASTEXITCODE -ne 0) { throw 'Desktop build basarisiz.' }

$NsisDir = Join-Path $RepoRoot 'apps\desktop\src-tauri\target\release\bundle\nsis'
$Installer = Get-ChildItem $NsisDir -Filter '*.exe' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$Signature = Get-ChildItem $NsisDir -Filter '*.exe.sig' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $Installer) { throw "NSIS installer bulunamadi: $NsisDir" }
if (-not $Signature) { throw "Updater imza dosyasi bulunamadi: $NsisDir" }

Write-Host ''
Write-Host '=== TAMAM ===' -ForegroundColor Green
Write-Host "Installer: $($Installer.FullName)" -ForegroundColor Green
Write-Host "Signature: $($Signature.FullName)" -ForegroundColor Green
Write-Host "Public key: $PublicKeyPath"
Write-Host "Private key: $KeyPath  (YEDEKLE, PAYLASMA)" -ForegroundColor Yellow
