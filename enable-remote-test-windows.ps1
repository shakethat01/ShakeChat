$ErrorActionPreference = "Stop"

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
Write-Host "========================================" -ForegroundColor DarkCyan
Write-Host "   ShakeChat Tailnet Remote Test Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor DarkCyan
Write-Host ""

$tailscaleCmd = Get-Command tailscale.exe -ErrorAction SilentlyContinue
$tailscaleExe = if ($tailscaleCmd) { $tailscaleCmd.Source } else { "C:\Program Files\Tailscale\tailscale.exe" }
if (-not (Test-Path $tailscaleExe)) {
    Write-Host "Tailscale bulunamadi. Once Tailscale'i kurup hesabina giris yap." -ForegroundColor Red
    exit 1
}

$tailscaleIp = (& $tailscaleExe ip -4 | Select-Object -First 1).Trim()
if (-not $tailscaleIp -or $tailscaleIp -notmatch '^100\.') {
    Write-Host "Aktif Tailscale IPv4 adresi bulunamadi. Tailscale baglantisini kontrol et." -ForegroundColor Red
    exit 1
}

Write-Host "Tailscale IP: $tailscaleIp" -ForegroundColor Green

if (-not (Test-Path ".env")) {
    Write-Host ".env bulunamadi. Once normal ShakeChat kurulumunu calistir." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path "infrastructure/livekit/livekit.yaml")) {
    Write-Host "infrastructure/livekit/livekit.yaml bulunamadi." -ForegroundColor Red
    exit 1
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item ".env" ".env.remote-backup-$stamp" -Force
Copy-Item "infrastructure/livekit/livekit.yaml" "infrastructure/livekit/livekit.remote-backup-$stamp.yaml" -Force

Set-DotEnvValue ".env" "WEB_ORIGIN" "http://localhost:5173"
Set-DotEnvValue ".env" "LIVEKIT_URL" "http://localhost:7880"
Set-DotEnvValue ".env" "LIVEKIT_PUBLIC_URL" "ws://${tailscaleIp}:7880"
Set-DotEnvValue ".env" "MINIO_ENDPOINT" $tailscaleIp
Set-DotEnvValue ".env" "MINIO_PORT" "9000"
Set-DotEnvValue ".env" "MINIO_USE_SSL" "false"

Copy-Item ".env" "apps/api/.env" -Force

$livekitPath = "infrastructure/livekit/livekit.yaml"
$yaml = Get-Content $livekitPath -Raw
if ($yaml -match '(?m)^\s*node_ip:') {
    $yaml = [regex]::Replace($yaml, '(?m)^(\s*)node_ip:\s*.*$', "`${1}node_ip: $tailscaleIp")
} else {
    throw "LiveKit config icinde node_ip bulunamadi; otomatik degisiklik yapilmadi."
}
Set-Content $livekitPath $yaml -Encoding UTF8

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($isAdmin) {
    $rules = @(
        @{ Name = "ShakeChat Tailnet API"; Protocol = "TCP"; Port = "4000" },
        @{ Name = "ShakeChat Tailnet LiveKit Signal"; Protocol = "TCP"; Port = "7880" },
        @{ Name = "ShakeChat Tailnet LiveKit ICE TCP"; Protocol = "TCP"; Port = "7881" },
        @{ Name = "ShakeChat Tailnet LiveKit ICE UDP"; Protocol = "UDP"; Port = "7882" },
        @{ Name = "ShakeChat Tailnet Media"; Protocol = "TCP"; Port = "9000" }
    )
    foreach ($rule in $rules) {
        Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
        New-NetFirewallRule -DisplayName $rule.Name -Direction Inbound -Action Allow -Protocol $rule.Protocol -LocalPort $rule.Port -RemoteAddress "100.64.0.0/10" -Profile Any | Out-Null
    }
    Write-Host "Windows Firewall Tailnet kurallari eklendi." -ForegroundColor Green
} else {
    Write-Host "UYARI: PowerShell yonetici olarak acik degil; firewall kurallari eklenemedi." -ForegroundColor Yellow
    Write-Host "Gerekirse scripti bir kez Yonetici PowerShell ile tekrar calistir." -ForegroundColor Yellow
}

Write-Host "LiveKit yeniden baslatiliyor..." -ForegroundColor Cyan
docker compose up -d livekit

Write-Host "" 
Write-Host "REMOTE TEST HAZIRLIK TAMAM." -ForegroundColor Green
Write-Host "Sunucu Tailscale IP: $tailscaleIp" -ForegroundColor Cyan
Write-Host "Simdi mevcut npm run dev penceresinde Ctrl+C yapip .\start-windows.ps1 ile ShakeChat'i yeniden baslat." -ForegroundColor Yellow
Write-Host "Arkadaslar start-client-windows.ps1 acarken bu IP'yi girecek: $tailscaleIp" -ForegroundColor Yellow
Write-Host ""
