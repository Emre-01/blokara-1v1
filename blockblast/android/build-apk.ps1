# Blokara 1v1 — Gradle ile APK derleme.
#
#   powershell -ExecutionPolicy Bypass -File android\build-apk.ps1
#   powershell -ExecutionPolicy Bypass -File android\build-apk.ps1 -Release `
#     -ServerUrl "https://SUNUCU" -GoogleAndroidClientId "....apps.googleusercontent.com"
#
# AdMob ve Play Games kimlikleri verilmezse Google'ın resmî TEST reklam
# kimlikleri kullanılır ve Play Games kapalı kalır (Google OAuth'a düşer).
# Kalıcı kimlikler için android\local.properties dosyasını kullanın.

param(
  [string]$Configuration = "debug",
  [string]$OutFile = "",
  # Yayınlanan sunucu adresi; APK'ya gömülür (örn. https://blok-iki.onrender.com).
  [string]$ServerUrl = "",
  # Son kullanıcı sürümü: hata ayıklama kapalı, release anahtarıyla imzalanır.
  [switch]$Release,
  [string]$VersionName = "",
  [int]$VersionCode = 0,
  # Android OAuth istemci kimliği (…apps.googleusercontent.com).
  [string]$GoogleAndroidClientId = "",
  # AdMob kimlikleri (boşsa test kimlikleri).
  [string]$AdMobAppId = "",
  [string]$AdMobInterstitial = "",
  [string]$AdMobRewarded = "",
  # Play Games Services uygulama kimliği (boş/0 ise kapalı).
  [string]$GamesAppId = ""
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
if (-not (Test-Jdk $jdk)) {
  throw "Geçerli bir JDK bulunamadı. JAVA_HOME ayarla (JDK 17 önerilir)."
}
$env:JAVA_HOME = $jdk
$env:PATH = (Join-Path $jdk "bin") + ";" + $env:PATH
Write-Host "JDK    : $jdk"

$root    = Split-Path -Parent $PSScriptRoot   # blockblast/
$android = $PSScriptRoot                      # blockblast/android/

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

# Sunucu adresi: şemasızsa yerel adresler http, internete açık adresler https.
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

$isRelease = $Release -or ($Configuration -eq "release")
$task = if ($isRelease) { ":app:assembleRelease" } else { ":app:assembleDebug" }

# Gradle'a ayrı argümanlar olarak verilir; PowerShell "=" karakterini bölmesin.
$gradleArgs = @($task, "--no-daemon")
if ($normalizedServer) { $gradleArgs += "-Pblokiki.serverUrl=$normalizedServer" }
if ($GoogleAndroidClientId) { $gradleArgs += "-Pblokiki.googleAndroidClientId=$($GoogleAndroidClientId.Trim())" }
if ($AdMobAppId) { $gradleArgs += "-Pblokiki.admobAppId=$($AdMobAppId.Trim())" }
if ($AdMobInterstitial) { $gradleArgs += "-Pblokiki.admobInterstitial=$($AdMobInterstitial.Trim())" }
if ($AdMobRewarded) { $gradleArgs += "-Pblokiki.admobRewarded=$($AdMobRewarded.Trim())" }
if ($GamesAppId) { $gradleArgs += "-Pblokiki.gamesAppId=$($GamesAppId.Trim())" }
if ($VersionName) { $gradleArgs += "-Pblokiki.versionName=$VersionName" }
if ($VersionCode -gt 0) { $gradleArgs += "-Pblokiki.versionCode=$VersionCode" }

Push-Location $android
try {
  & $gradle @gradleArgs
  if ($LASTEXITCODE -ne 0) { throw "Gradle derlemesi başarısız (çıkış kodu $LASTEXITCODE)." }
} finally {
  Pop-Location
}

$built = if ($isRelease) {
  Join-Path $android "app\build\outputs\apk\release\app-release.apk"
} else {
  Join-Path $android "app\build\outputs\apk\debug\app-debug.apk"
}
if (-not (Test-Path $built)) { throw "Beklenen APK bulunamadı: $built" }

if (-not $OutFile) {
  $versionLabel = if ($VersionName) { $VersionName } else { "1.8" }
  $OutFile = if ($isRelease) {
    Join-Path $android "dist\Blokara-1v1-$versionLabel.apk"
  } else {
    Join-Path $android "build\blok-iki.apk"
  }
}
New-Item -ItemType Directory -Force (Split-Path $OutFile) | Out-Null
Copy-Item $built $OutFile -Force

$size = [math]::Round((Get-Item $OutFile).Length / 1KB, 1)
Write-Host "`nAPK hazır: $OutFile ($size KB)"
if (-not $isRelease) {
  Write-Host "Kurulum: adb install -r `"$OutFile`""
}
exit 0
