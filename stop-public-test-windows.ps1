$ErrorActionPreference = "SilentlyContinue"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$stateDir = Join-Path $root ".public-test"
$pidFile = Join-Path $stateDir "pids.json"

function Stop-Tree([int]$ProcessId) {
    if (-not $ProcessId) { return }
    & taskkill.exe /PID $ProcessId /T /F *> $null
}

function Stop-PortTree([int]$Port) {
    if (-not $Port) { return }
    for ($i = 0; $i -lt 5; $i++) {
        $owners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique)
        if (-not $owners -or $owners.Count -eq 0) { break }
        foreach ($owner in $owners) {
            Stop-Tree ([int]$owner)
        }
        Start-Sleep -Milliseconds 400
    }
}

$state = $null
if (Test-Path $pidFile) {
    try {
        $state = Get-Content $pidFile -Raw | ConvertFrom-Json
        foreach ($id in @($state.pids)) {
            if ($id) { Stop-Tree ([int]$id) }
        }
    } catch {}
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

# Son calismanin dinamik portlarini temizle.
if ($state) {
    if ($state.apiPort) { Stop-PortTree ([int]$state.apiPort) }
    if ($state.webPort) { Stop-PortTree ([int]$state.webPort) }
}

# Eski sabit-portlu surumlerden kalmis child processleri de temizlemeye calis.
Stop-PortTree 4001
Stop-PortTree 5174

try {
    $cloudflared = Join-Path $root ".tools\cloudflared.exe"
    Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.ExecutablePath -eq $cloudflared } |
        ForEach-Object { Stop-Tree ([int]$_.ProcessId) }
} catch {}

Write-Host "ShakeChat public test oturumu ve child processleri kapatildi." -ForegroundColor Green
