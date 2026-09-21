$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$stateDir = Join-Path $root ".public-test"
$toolsDir = Join-Path $root ".tools"
New-Item -ItemType Directory -Force -Path $stateDir, $toolsDir | Out-Null

function Wait-Port([int]$Port, [int]$Seconds = 45) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $c = New-Object System.Net.Sockets.TcpClient
            $iar = $c.BeginConnect("127.0.0.1", $Port, $null, $null)
            if ($iar.AsyncWaitHandle.WaitOne(500) -and $c.Connected) {
                $c.Close()
                return $true
            }
            $c.Close()
        } catch {}
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Start-QuickTunnel([string]$Name, [string]$LocalUrl, [string]$Exe) {
    $out = Join-Path $stateDir "$Name.out.log"
    $err = Join-Path $stateDir "$Name.err.log"
    Remove-Item $out, $err -Force -ErrorAction SilentlyContinue

    $p = Start-Process -FilePath $Exe -ArgumentList @("tunnel", "--no-autoupdate", "--url", $LocalUrl, "--loglevel", "info") -PassThru -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err

    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline) {
        $text = ""
        if (Test-Path $out) { $text += (Get-Content $out -Raw -ErrorAction SilentlyContinue) }
        if (Test-Path $err) { $text += "`n" + (Get-Content $err -Raw -ErrorAction SilentlyContinue) }
        $m = [regex]::Match($text, 'https://[a-zA-Z0-9-]+\.trycloudflare\.com')
        if ($m.Success) {
            return [pscustomobject]@{ Process = $p; Url = $m.Value }
        }
        if ($p.HasExited) { throw "Cloudflare tunnel baslatilamadi ($Name). Log: $err" }
        Start-Sleep -Milliseconds 500
    }
    throw "Cloudflare tunnel URL alinamadi ($Name)."
}

function Show-LogTail([string]$Path, [int]$Lines = 60) {
    if (Test-Path $Path) {
        Write-Host ""
        Write-Host "---- $Path (son $Lines satir) ----" -ForegroundColor Yellow
        Get-Content $Path -Tail $Lines -ErrorAction SilentlyContinue
    }
}

function Get-HttpStatus([string]$Uri) {
    try {
        $r = Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 10 -ErrorAction Stop
        return [int]$r.StatusCode
    } catch {
        if ($_.Exception.Response) {
            return [int]$_.Exception.Response.StatusCode
        }
        throw
    }
}

Write-Host ""
Write-Host "==============================================" -ForegroundColor DarkCyan
Write-Host "   ShakeChat PUBLIC Browser Test" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor DarkCyan
Write-Host "Arkadaslar HICBIR SEY kurmayacak. Sadece linke tiklayacak." -ForegroundColor Green
Write-Host ""

# Eski public test npm/node child processleriyle birlikte tamamen kapat.
$stopScript = Join-Path $root "stop-public-test-windows.ps1"
if (Test-Path $stopScript) { & $stopScript }
Start-Sleep -Seconds 1

if (-not (Test-Path ".env") -or -not (Test-Path "apps/api/.env")) {
    throw "ShakeChat .env bulunamadi. Once .\start-windows.ps1 ile normal kurulumu bir kez calistir."
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js bulunamadi." }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "npm bulunamadi." }
if (-not (Wait-Port 7880 3)) { throw "LiveKit 7880 calismiyor. .\start-windows.ps1 acik olmali." }
if (-not (Wait-Port 9000 3)) { throw "MinIO 9000 calismiyor. .\start-windows.ps1 acik olmali." }

$cloudflared = Join-Path $toolsDir "cloudflared.exe"
if (-not (Test-Path $cloudflared)) {
    Write-Host "Cloudflared indiriliyor (sadece senin PC'ye, bir kere)..." -ForegroundColor Cyan
    Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cloudflared
}

$apiOut = Join-Path $stateDir "api-process.out.log"
$apiErr = Join-Path $stateDir "api-process.err.log"
$webOut = Join-Path $stateDir "web-process.out.log"
$webErr = Join-Path $stateDir "web-process.err.log"
Remove-Item $apiOut, $apiErr, $webOut, $webErr -Force -ErrorAction SilentlyContinue

try {
    Write-Host "Public tuneller olusturuluyor..." -ForegroundColor Cyan
    $webTunnel = Start-QuickTunnel "web" "http://127.0.0.1:5174" $cloudflared
    $minioTunnel = Start-QuickTunnel "minio" "http://127.0.0.1:9000" $cloudflared
    $livekitTunnel = Start-QuickTunnel "livekit" "http://127.0.0.1:7880" $cloudflared

    $webUrl = $webTunnel.Url
    $minioUri = [uri]$minioTunnel.Url
    $livekitWs = $livekitTunnel.Url -replace '^https://', 'wss://'

    Write-Host "Public API baslatiliyor..." -ForegroundColor Cyan
    $apiCmd = @"
Set-Location '$root'
`$env:PORT='4001'
`$env:WEB_ORIGIN='$webUrl'
`$env:LIVEKIT_PUBLIC_URL='$livekitWs'
`$env:MINIO_ENDPOINT='$($minioUri.Host)'
`$env:MINIO_PORT='443'
`$env:MINIO_USE_SSL='true'
npm run dev --prefix apps/api
"@
    $apiProc = Start-Process powershell.exe -ArgumentList @("-NoLogo", "-NoProfile", "-Command", $apiCmd) -PassThru -WindowStyle Hidden -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr

    if (-not (Wait-Port 4001 60)) {
        Show-LogTail $apiOut
        Show-LogTail $apiErr
        throw "Public API 4001 acilmadi."
    }
    Start-Sleep -Seconds 1
    if ($apiProc.HasExited) {
        Show-LogTail $apiOut
        Show-LogTail $apiErr
        throw "Yeni public API prosesi kapandi. Eski proses/port cakismasi olabilir."
    }

    $apiStatus = Get-HttpStatus "http://127.0.0.1:4001/api/auth/me"
    if ($apiStatus -notin @(200,401,403)) {
        Show-LogTail $apiOut
        Show-LogTail $apiErr
        throw "Public API saglik testi basarisiz. HTTP $apiStatus"
    }

    Write-Host "Public Web baslatiliyor..." -ForegroundColor Cyan
    $webCmd = @"
Set-Location '$root'
`$env:VITE_API_ORIGIN='same-origin'
`$env:SHAKECHAT_API_PROXY_TARGET='http://127.0.0.1:4001'
npm run dev --prefix apps/web -- --host 127.0.0.1 --port 5174 --strictPort
"@
    $webProc = Start-Process powershell.exe -ArgumentList @("-NoLogo", "-NoProfile", "-Command", $webCmd) -PassThru -WindowStyle Hidden -RedirectStandardOutput $webOut -RedirectStandardError $webErr

    if (-not (Wait-Port 5174 60)) {
        Show-LogTail $webOut
        Show-LogTail $webErr
        throw "Public Web 5174 acilmadi."
    }
    Start-Sleep -Seconds 1
    if ($webProc.HasExited) {
        Show-LogTail $webOut
        Show-LogTail $webErr
        throw "Yeni public Web prosesi kapandi. Eski proses/port cakismasi olabilir."
    }

    $proxyStatus = Get-HttpStatus "http://127.0.0.1:5174/api/auth/me"
    if ($proxyStatus -notin @(200,401,403)) {
        Show-LogTail $apiOut
        Show-LogTail $apiErr
        Show-LogTail $webOut
        Show-LogTail $webErr
        throw "Web -> API proxy saglik testi basarisiz. HTTP $proxyStatus"
    }

    $pids = @($webTunnel.Process.Id, $minioTunnel.Process.Id, $livekitTunnel.Process.Id, $apiProc.Id, $webProc.Id)
    @{ pids = $pids; webUrl = $webUrl; startedAt = (Get-Date).ToString('o') } | ConvertTo-Json | Set-Content (Join-Path $stateDir "pids.json") -Encoding UTF8

    Write-Host ""
    Write-Host "==============================================" -ForegroundColor Green
    Write-Host "  SHAKECHAT PUBLIC TEST HAZIR" -ForegroundColor Green
    Write-Host "==============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "ARKADASLARA SADECE BU LINKI AT:" -ForegroundColor Yellow
    Write-Host $webUrl -ForegroundColor Cyan
    Write-Host ""
    Write-Host "API direct test : HTTP $apiStatus" -ForegroundColor DarkGray
    Write-Host "Web proxy test : HTTP $proxyStatus" -ForegroundColor DarkGray
    Write-Host "Web + API + realtime TEK public origin uzerinden gidiyor." -ForegroundColor Green
    Write-Host "Ses/ekran: LiveKit signaling HTTPS/WSS tunelinden, medya 7881/TCP + 7882/UDP ile dogrudan PC'ye gelir." -ForegroundColor DarkYellow
    Write-Host ""
    Write-Host "Kapatmak icin: .\stop-public-test-windows.ps1" -ForegroundColor Gray
} catch {
    Show-LogTail $apiErr
    Show-LogTail $webErr
    if (Test-Path $stopScript) { & $stopScript }
    throw
}
