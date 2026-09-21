$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host ""
Write-Host "================================================" -ForegroundColor DarkCyan
Write-Host " ShakeChat - PC'yi gecici VPS gibi hazirla" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor DarkCyan
Write-Host ""

$livekitPath = Join-Path $root "infrastructure/livekit/livekit.yaml"
if (-not (Test-Path $livekitPath)) {
    throw "infrastructure/livekit/livekit.yaml bulunamadi."
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    throw "Bu script PowerShell Yonetici olarak acikken calistirilmali."
}

$lanIp = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
        $_.IPAddress -notmatch '^127\.' -and
        $_.IPAddress -notmatch '^169\.254\.' -and
        $_.IPAddress -notmatch '^100\.' -and
        $_.InterfaceAlias -notmatch 'Tailscale|vEthernet|Docker|WSL'
    } |
    Sort-Object InterfaceMetric |
    Select-Object -First 1 -ExpandProperty IPAddress

$publicIp = $null
try {
    $publicIp = (Invoke-RestMethod -UseBasicParsing -Uri "https://api.ipify.org" -TimeoutSec 10).Trim()
} catch {}
if (-not $publicIp -or $publicIp -notmatch '^\d{1,3}(\.\d{1,3}){3}$') {
    throw "Public IPv4 otomatik bulunamadi. Internet baglantisini kontrol et."
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item $livekitPath "$livekitPath.vps-backup-$stamp" -Force

$yaml = Get-Content $livekitPath -Raw

# Signal sunucusu tum arayuzlerden dinlesin.
if ($yaml -match '(?m)^bind_addresses:') {
    $yaml = [regex]::Replace($yaml, '(?ms)^bind_addresses:\s*\r?\n(?:\s*-.*\r?\n)*', "bind_addresses:`r`n  - 0.0.0.0`r`n")
} else {
    $yaml = [regex]::Replace($yaml, '(?m)^port:\s*7880\s*$', "port: 7880`r`nbind_addresses:`r`n  - 0.0.0.0")
}

# Media portlarini sabitle.
if ($yaml -match '(?m)^\s*tcp_port:') {
    $yaml = [regex]::Replace($yaml, '(?m)^(\s*)tcp_port:\s*.*$', '${1}tcp_port: 7881')
} else {
    throw "LiveKit rtc.tcp_port bulunamadi."
}

if ($yaml -match '(?m)^\s*udp_port:') {
    $yaml = [regex]::Replace($yaml, '(?m)^(\s*)udp_port:\s*.*$', '${1}udp_port: 7882')
} else {
    throw "LiveKit rtc.udp_port bulunamadi."
}

# Ev router NAT senaryosunda STUN kesfine guvenmek yerine bilinen WAN IPv4'u ilan et.
# LiveKit config'te node_ip kullanilirken use_external_ip=false olmali.
if ($yaml -match '(?m)^\s*use_external_ip:') {
    $yaml = [regex]::Replace($yaml, '(?m)^(\s*)use_external_ip:\s*.*$', '${1}use_external_ip: false')
} else {
    throw "LiveKit rtc.use_external_ip bulunamadi."
}

if ($yaml -match '(?m)^\s*node_ip:') {
    $yaml = [regex]::Replace($yaml, '(?m)^(\s*)node_ip:\s*.*$', "`${1}node_ip: $publicIp")
} else {
    $yaml = [regex]::Replace($yaml, '(?m)^(\s*)use_external_ip:\s*false\s*$', "`${1}use_external_ip: false`r`n`${1}node_ip: $publicIp")
}

Set-Content $livekitPath $yaml -Encoding UTF8

$rules = @(
    @{ Name = "ShakeChat Public LiveKit ICE TCP 7881"; Protocol = "TCP"; Port = "7881" },
    @{ Name = "ShakeChat Public LiveKit ICE UDP 7882"; Protocol = "UDP"; Port = "7882" }
)
foreach ($rule in $rules) {
    Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName $rule.Name -Direction Inbound -Action Allow -Protocol $rule.Protocol -LocalPort $rule.Port -Profile Any | Out-Null
}

Write-Host "Windows Firewall: 7881/TCP ve 7882/UDP acildi." -ForegroundColor Green
Write-Host "LiveKit ilan edilen public IP: $publicIp" -ForegroundColor Green

# ONEMLI: docker compose up -d mevcut container calisiyorsa prosesi yeniden baslatmaz.
# Config degisikliginin gercekten yuklenmesi icin restart zorunlu.
Write-Host "LiveKit GERCEKTEN yeniden baslatiliyor..." -ForegroundColor Cyan
docker compose restart livekit
if ($LASTEXITCODE -ne 0) {
    docker compose up -d --force-recreate livekit
    if ($LASTEXITCODE -ne 0) { throw "LiveKit yeniden baslatilamadi." }
}
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "LiveKit son loglari:" -ForegroundColor DarkCyan
docker compose logs livekit --tail 25

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host " PC TARAFI HAZIR" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
if ($lanIp) { Write-Host "PC LAN IP : $lanIp" -ForegroundColor Cyan }
Write-Host "Public IP : $publicIp" -ForegroundColor Cyan
Write-Host ""
Write-Host "MODEM/ROUTER PORT FORWARDING:" -ForegroundColor Yellow
if ($lanIp) {
    Write-Host "  TCP 7881  ->  $lanIp : 7881" -ForegroundColor White
    Write-Host "  UDP 7882  ->  $lanIp : 7882" -ForegroundColor White
}
Write-Host ""
Write-Host "5432, 6379, 9000, 9001 portlarini internete ACMA." -ForegroundColor Red
Write-Host "Web/API/LiveKit signaling Cloudflare HTTPS tunelinden devam edecek." -ForegroundColor DarkYellow
Write-Host "Medya (ses/ekran) 7881/7882 ile dogrudan bu PC'ye gelecek." -ForegroundColor DarkYellow
Write-Host ""
Write-Host "WAN IPv4 ile Public IP ayniysa CGNAT yoktur." -ForegroundColor Yellow
Write-Host "Simdi .\start-public-test-windows.ps1 dosyasini tekrar calistir." -ForegroundColor Green
