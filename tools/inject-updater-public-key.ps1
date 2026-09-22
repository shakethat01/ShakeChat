$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ConfigPath = Join-Path $RepoRoot 'apps\desktop\src-tauri\tauri.conf.json'
$PublicKey = $env:SHAKECHAT_UPDATER_PUBLIC_KEY

if ([string]::IsNullOrWhiteSpace($PublicKey)) {
  throw 'SHAKECHAT_UPDATER_PUBLIC_KEY is missing.'
}
if (-not (Test-Path $ConfigPath)) {
  throw "Tauri config not found: $ConfigPath"
}

$Config = Get-Content -Raw $ConfigPath | ConvertFrom-Json
if ($null -eq $Config.plugins) {
  $Config | Add-Member -NotePropertyName plugins -NotePropertyValue ([pscustomobject]@{})
}
if ($null -eq $Config.plugins.updater) {
  $Config.plugins | Add-Member -NotePropertyName updater -NotePropertyValue ([pscustomobject]@{})
}
$Config.plugins.updater | Add-Member -NotePropertyName pubkey -NotePropertyValue $PublicKey -Force

$Config | ConvertTo-Json -Depth 30 | Set-Content $ConfigPath -Encoding utf8
Write-Host 'Tauri updater public key injected into build config.' -ForegroundColor Green
