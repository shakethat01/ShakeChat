$ErrorActionPreference = "SilentlyContinue"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$stateDir = Join-Path $root ".public-test"
$pidFile = Join-Path $stateDir "pids.json"

function Stop-Tree([int]$ProcessId) {
    if (-not $ProcessId) { return }
    & taskkill.exe /PID $ProcessId /T /F *> $null
}

function Stop-PortTree([int]$Port) {
    for ($i = 0; $i -lt 5; $i++) {
        $owners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique)
        if (-not $owners -or $owners.Count -eq 0) { break }

        foreach ($owner in $owners) {
            $target = [int]$owner
            try {
                $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$owner" -ErrorAction SilentlyContinue
                if ($proc -and $proc.ParentProcessId) {
                    $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($proc.ParentProcessId)" -ErrorAction SilentlyContinue
                    if ($parent -and $parent.Name -match '^(node|cmd|powershell|pwsh)\.exe$') {
                        $target = [int]$parent.ProcessId
                    }
                }
            } catch {}
            Stop-Tree $target
        }
        Start-Sleep -Milliseconds 500
    }
}

if (Test-Path $pidFile) {
    try {
        $state = Get-Content $pidFile -Raw | ConvertFrom-Json
        foreach ($id in @($state.pids)) {
            if ($id) { Stop-Tree ([int]$id) }
        }
    } catch {}
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

# Onceki Stop-Process tabanli surumlerden kalan orphan child processleri de temizle.
Stop-PortTree 4001
Stop-PortTree 5174

try {
    $cloudflared = Join-Path $root ".tools\cloudflared.exe"
    Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.ExecutablePath -eq $cloudflared } |
        ForEach-Object { Stop-Tree ([int]$_.ProcessId) }
} catch {}

Write-Host "ShakeChat public test oturumu ve child processleri kapatildi." -ForegroundColor Green
