# Blokara 1v1 — Google Play için AAB (Android App Bundle) üretimi.
#
#   powershell -ExecutionPolicy Bypass -File android\build-aab.ps1 `
#     -ServerUrl "https://SUNUCU" `
#     -GoogleAndroidClientId "....apps.googleusercontent.com" `
#     -VersionName "1.8" -VersionCode 10
#
# AdMob ve Play Games kimlikleri verilmezse test reklam kimlikleri kullanılır.
# Kalıcı kimlikler için android\local.properties dosyasını kullanın.

param(
  [string]$ServerUrl = "",
  [string]$VersionName = "",
  [int]$VersionCode = 0,
  [string]$GoogleAndroidClientId = "",
  [string]$AdMobAppId = "",
  [string]$AdMobInterstitial = "",
  [string]$AdMobRewarded = "",
  [string]$GamesAppId = "",
  [string]$OutFile = "",
  [switch]$NoAds
)

$ErrorActionPreference = "Stop"

function Test-Jdk([string]$path) {
  if (-not $path) { return $false }
  try { return (Test-Path -LiteralPath (Join-Path $path "bin\java.exe")) } catch { return $false }
}

$jdk = $env:JAVA_HOME
if (-not (Test-Jdk $jdk)) {
  $javaCmd = Get-Command java -ErrorAction SilentlyContinue
  $jdk = $null
  if ($javaCmd) { $jdk = Split-Path -Parent (Split-Path -Parent $javaCmd.Source) }
}
if (-not (Test-Jdk $jdk)) {
  $candidate = Get-ChildItem "C:\Program Files\Eclipse Adoptium" -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Jdk $_.FullName } |
    Sort-Object Name -Descending | Select-Object -First 1
  if ($candidate) { $jdk = $candidate.FullName }
}
if (-not (Test-Jdk $jdk)) { throw "Geçerli bir JDK bulunamadı. JAVA_HOME ayarla (JDK 17 önerilir)." }
$env:JAVA_HOME = $jdk
$env:PATH = (Join-Path $jdk "bin") + ";" + $env:PATH
Write-Host "JDK    : $jdk"

$root    = Split-Path -Parent $PSScriptRoot
$android = $PSScriptRoot

function Resolve-Gradle {
  $wrapper = Join-Path $android "gradlew.bat"
  if (Test-Path $wrapper) { return $wrapper }
  if ($env:GRADLE_HOME) {
    $candidate = Join-Path $env:GRADLE_HOME "bin\gradle.bat"
    if (Test-Path $candidate) { return $candidate }
  }
  $cmd = Get-Command gradle -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $local = Join-Path $env:LOCALAPPDATA "blok-iki-tools\gradle-8.14.3\bin\gradle.bat"
  if (Test-Path $local) { return $local }
  throw "Gradle bulunamadı. android\gradlew.bat oluşturun veya GRADLE_HOME ayarlayın."
}

$gradle = Resolve-Gradle
Write-Host "Gradle : $gradle"

$normalizedServer = ""
if ($ServerUrl) {
  $normalizedServer = $ServerUrl.Trim().TrimEnd('/')
  if ($normalizedServer -notmatch '^[a-zA-Z][a-zA-Z0-9+.-]*://') {
    if ($normalizedServer -match '^(localhost|127\.|10\.|192\.168\.)') {
      $normalizedServer = "http://" + $normalizedServer
    } else {
      $normalizedServer = "https://" + $normalizedServer
    }
  }
  Write-Host "Sunucu : $normalizedServer"
}

$gradleArgs = @(":app:bundleRelease", "--no-daemon")
if ($normalizedServer) { $gradleArgs += "-Pblokiki.serverUrl=$normalizedServer" }
if ($GoogleAndroidClientId) { $gradleArgs += "-Pblokiki.googleAndroidClientId=$($GoogleAndroidClientId.Trim())" }
if ($AdMobAppId) { $gradleArgs += "-Pblokiki.admobAppId=$($AdMobAppId.Trim())" }
if ($AdMobInterstitial) { $gradleArgs += "-Pblokiki.admobInterstitial=$($AdMobInterstitial.Trim())" }
if ($AdMobRewarded) { $gradleArgs += "-Pblokiki.admobRewarded=$($AdMobRewarded.Trim())" }
if ($GamesAppId) { $gradleArgs += "-Pblokiki.gamesAppId=$($GamesAppId.Trim())" }
if ($NoAds) { $gradleArgs += "-Pblokiki.adsEnabled=false" }
if ($VersionName) { $gradleArgs += "-Pblokiki.versionName=$VersionName" }
if ($VersionCode -gt 0) { $gradleArgs += "-Pblokiki.versionCode=$VersionCode" }

Push-Location $android
try {
  & $gradle @gradleArgs
  if ($LASTEXITCODE -ne 0) { throw "Gradle derlemesi başarısız (çıkış kodu $LASTEXITCODE)." }
} finally {
  Pop-Location
}

$built = Join-Path $android "app\build\outputs\bundle\release\app-release.aab"
if (-not (Test-Path $built)) { throw "Beklenen AAB bulunamadı: $built" }

if (-not $OutFile) {
  $versionLabel = if ($VersionName) { $VersionName } else { "1.8" }
  $OutFile = Join-Path $android "dist\Blokara-1v1-$versionLabel.aab"
}
New-Item -ItemType Directory -Force (Split-Path $OutFile) | Out-Null
Copy-Item $built $OutFile -Force

$size = [math]::Round((Get-Item $OutFile).Length / 1KB, 1)
Write-Host "`nAAB hazır: $OutFile ($size KB)"
Write-Host "Play Console > Test ve yayın > Üretim > Yeni sürüm yolundan yükleyin."
exit 0
