# Cloudflare tüneli ile yayın (hesap gerekmez)
#
# Kullanım:
#   1) Ayrı bir terminalde oyun sunucusu:  node server.cjs
#   2) Bu betik:  powershell -ExecutionPolicy Bypass -File android/quick-tunnel.ps1
#
# Betik cloudflared'i indirir, tüneli açar, adresi bulur ve APK'yı o adresle
# derler. Tünel kapanınca adres geçersiz olur; kalıcı yayın için DEPLOY.md.

param(
  [string]$LocalUrl = "http://127.0.0.1:8080",
  [string]$VersionName = "1.2",
  [int]$VersionCode = 3,
  [switch]$KeepRunning
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $PSScriptRoot
$tool = Join-Path $env:TEMP "opencode\cloudflared.exe"

if (-not (Test-Path $tool)) {
  Write-Host "cloudflared indiriliyor..."
  New-Item -ItemType Directory -Force (Split-Path $tool) | Out-Null
  Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $tool -TimeoutSec 180
}

try {
  $health = (Invoke-WebRequest -Uri "$LocalUrl/healthz" -TimeoutSec 5).Content
  if ($health.Trim() -ne "ok") { throw "sağlık kontrolü beklenmedik: $health" }
} catch {
  Write-Error "Sunucu $LocalUrl üzerinde çalışmıyor. Önce 'node server.cjs' çalıştır."
}

$log = Join-Path $env:TEMP "cf-publish.log"
Remove-Item $log -ErrorAction SilentlyContinue
$proc = Start-Process -FilePath $tool `
  -ArgumentList "tunnel","--url",$LocalUrl,"--no-autoupdate","--logfile",$log,"--loglevel","info" `
  -WindowStyle Hidden -PassThru

Write-Host "Tünel açılıyor..."
$url = $null
for ($i = 0; $i -lt 40 -and -not $url; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Path $log) {
    $hit = Select-String -Path $log -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" -AllMatches |
      Select-Object -Last 1
    if ($hit) { $url = $hit.Matches[0].Value }
  }
}
if (-not $url) {
  Write-Error "Tünel adresi okunamadı. Günlük: $log"
}

Write-Host "Genel adres : $url"
Write-Host "Derleniyor  : Blok-Iki-$VersionName.apk"
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "build-apk.ps1") `
  -ServerUrl $url -Release -VersionName $VersionName -VersionCode $VersionCode

Write-Host ""
Write-Host "APK: android\build\Blok-Iki-$VersionName.apk"
Write-Host "Not: tünel kapanana kadar geçerli. Kalıcı yayın için DEPLOY.md."

if (-not $KeepRunning) {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  Write-Host "Tünel kapatıldı."
}
