$ErrorActionPreference = "SilentlyContinue"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$stateDir = Join-Path $root ".public-test"
$pidFile = Join-Path $stateDir "pids.json"

if (Test-Path $pidFile) {
    try {
        $state = Get-Content $pidFile -Raw | ConvertFrom-Json
        foreach ($id in @($state.pids)) {
            if ($id) { Stop-Process -Id ([int]$id) -Force -ErrorAction SilentlyContinue }
        }
    } catch {}
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

Write-Host "ShakeChat public test oturumu kapatildi." -ForegroundColor Green
