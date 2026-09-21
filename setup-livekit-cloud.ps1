$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Set-DotEnvValue {
    param([string]$Path, [string]$Key, [string]$Value)
    if (-not (Test-Path $Path)) { throw "$Path bulunamadi." }
    $lines = Get-Content $Path
    $matched = $false
    $updated = foreach ($line in $lines) {
        if ($line -match "^$([regex]::Escape($Key))=") {
            $matched = $true
            "$Key=$Value"
        } else {
            $line
        }
    }
    if (-not $matched) { $updated += "$Key=$Value" }
    $updated | Set-Content $Path -Encoding UTF8
}

Write-Host ""
Write-Host "============================================" -ForegroundColor DarkCyan
Write-Host "   ShakeChat LiveKit Cloud Setup" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor DarkCyan
Write-Host ""

if (-not (Test-Path ".env")) { throw ".env bulunamadi. Once .\start-windows.ps1 calistir." }

$wsUrl = (Read-Host "LiveKit WebSocket URL (ornegin wss://xxxxx.livekit.cloud)").Trim()
if ($wsUrl -notmatch '^wss://[A-Za-z0-9.-]+\.livekit\.cloud/?$') {
    throw "Gecersiz LiveKit Cloud URL: $wsUrl"
}
$wsUrl = $wsUrl.TrimEnd('/')
$httpsUrl = $wsUrl -replace '^wss://', 'https://'

$apiKey = (Read-Host "LiveKit API Key").Trim()
if (-not $apiKey) { throw "API Key bos olamaz." }

$secureSecret = Read-Host "LiveKit API Secret (ekranda gorunmez)" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSecret)
try {
    $apiSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
if (-not $apiSecret) { throw "API Secret bos olamaz." }

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item ".env" ".env.before-livekit-cloud-$stamp" -Force

Set-DotEnvValue ".env" "LIVEKIT_URL" $httpsUrl
Set-DotEnvValue ".env" "LIVEKIT_PUBLIC_URL" $wsUrl
Set-DotEnvValue ".env" "LIVEKIT_API_KEY" $apiKey
Set-DotEnvValue ".env" "LIVEKIT_API_SECRET" $apiSecret
Copy-Item ".env" "apps/api/.env" -Force

Write-Host ""
Write-Host "LiveKit Cloud ayarlari kaydedildi." -ForegroundColor Green
Write-Host "LIVEKIT_URL=$httpsUrl" -ForegroundColor Cyan
Write-Host "LIVEKIT_PUBLIC_URL=$wsUrl" -ForegroundColor Cyan
Write-Host "API Secret ekrana yazdirilmadi." -ForegroundColor DarkGray
Write-Host ""
Write-Host "Simdi public test icin: .\start-public-cloud-test-windows.ps1" -ForegroundColor Yellow
