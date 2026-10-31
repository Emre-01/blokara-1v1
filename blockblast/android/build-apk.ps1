# Blok İki — Gradle'sız APK derleme (yalnızca Android SDK + JDK).
#   powershell -ExecutionPolicy Bypass -File android\build-apk.ps1
# Sıfır ağ bağımlılığı: aapt2, d8, zipalign, apksigner doğrudan çağrılır.

param(
  [string]$Configuration = "debug",
  [string]$OutFile = "",
  # Yayınlanan sunucu adresi; APK'ya gömülür (örn. https://blok-iki.onrender.com).
  [string]$ServerUrl = "",
  # Son kullanıcı sürümü: hata ayıklama kapalı, ayrı anahtarla imzalanır.
  [switch]$Release,
  [string]$VersionName = "1.1",
  [int]$VersionCode = 2
)

$ErrorActionPreference = "Stop"

# JAVA_HOME bazen bozuk olabiliyor (ör. "jdk-17*\"); geçerli bir JDK bul ve düzelt.
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
  throw "Geçerli bir JDK bulunamadı. JAVA_HOME ayarla."
}
$env:JAVA_HOME = $jdk
$env:PATH = (Join-Path $jdk "bin") + ";" + $env:PATH
Write-Host "JDK    : $jdk"

$root      = Split-Path -Parent $PSScriptRoot          # blockblast/
$android   = $PSScriptRoot                             # blockblast/android/
$sdk       = if ($env:ANDROID_HOME) { $env:ANDROID_HOME }
             elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT }
             elseif (Test-Path "$env:LOCALAPPDATA\Android\Sdk") { "$env:LOCALAPPDATA\Android\Sdk" }
             else { throw "Android SDK bulunamadı. ANDROID_HOME ayarla." }

$buildTools = Get-ChildItem "$sdk\build-tools" -Directory |
  Sort-Object { [version](($_.Name -replace '[^0-9.]', '') + ".0") } -Descending | Select-Object -First 1
if (-not $buildTools) { throw "build-tools bulunamadı: $sdk\build-tools" }

$platform = Get-ChildItem "$sdk\platforms" -Directory |
  Sort-Object { [version](($_.Name -replace '[^0-9.]', '') + ".0") } -Descending | Select-Object -First 1
if (-not $platform) { throw "platform bulunamadı: $sdk\platforms" }

$bt        = $buildTools.FullName
$aapt2     = Join-Path $bt "aapt2.exe"
$d8        = Join-Path $bt "d8.bat"
$zipalign  = Join-Path $bt "zipalign.exe"
$apksigner = Join-Path $bt "apksigner.bat"
$androidJar = Join-Path $platform.FullName "android.jar"

foreach ($tool in @($aapt2, $d8, $zipalign, $apksigner, $androidJar)) {
  if (-not (Test-Path $tool)) { throw "Eksik araç: $tool" }
}

$out      = Join-Path $android "build"
$gen      = Join-Path $out "gen"
$classes  = Join-Path $out "classes"
$dexOut   = Join-Path $out "dex"
$compiled = Join-Path $out "res-compiled"
$assets   = Join-Path $out "assets"
$manifest = Join-Path $android "AndroidManifest.xml"

# Sürüm bilgisi ve hata ayıklama bayrağı: kaynak manifeste dokunmadan
# derleme klasöründe bir kopya üzerinde değiştirilir.
$manifestOut = Join-Path $out "AndroidManifest.xml"
$manifestText = [System.IO.File]::ReadAllText($manifest)
$manifestText = $manifestText -replace 'android:versionCode="[^"]*"', ('android:versionCode="' + $VersionCode + '"')
$manifestText = $manifestText -replace 'android:versionName="[^"]*"', ('android:versionName="' + $VersionName + '"')
if ($Release) {
  $manifestText = $manifestText -replace 'android:debuggable="[^"]*"', 'android:debuggable="false"'
}

Write-Host "SDK    : $sdk"
Write-Host "Tools  : $($buildTools.Name)"
Write-Host "Hedef  : $($platform.Name)"

if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Path $gen, $classes, $dexOut, $compiled, $assets | Out-Null
[System.IO.File]::WriteAllText($manifestOut, $manifestText, (New-Object System.Text.UTF8Encoding($false)))
$manifest = $manifestOut

# 1) Web varlıklarını assets/www içine kopyala (public/ altındaki her şey)
Write-Host "`n[1/6] Web varlıkları kopyalanıyor..."
$www = Join-Path $assets "www"
New-Item -ItemType Directory -Path $www -Force | Out-Null
Copy-Item (Join-Path $root "public\*") $www -Recurse -Force
# APK'da servis çalışanı gerekmez (varlıklar zaten yerel).
Remove-Item (Join-Path $www "sw.js") -Force -ErrorAction SilentlyContinue

# Sunucu adresi: verilmişse APK'ya gömülür, verilmemişse uygulama varsayılanı kullanır.
if ($ServerUrl) {
  $normalized = $ServerUrl.Trim()
  if ($normalized -notmatch '^[a-zA-Z][a-zA-Z0-9+.-]*://') { $normalized = "http://" + $normalized }
  [System.IO.File]::WriteAllText((Join-Path $assets "server.txt"), $normalized, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "Sunucu : $normalized"
}

# 2) Simgeleri mipmap yoğunluklarına yerleştir
Write-Host "[2/6] Simgeler hazırlanıyor..."
$iconSource = Join-Path $root "public\icons\icon-512.png"
$densities = @{
  "mipmap-mdpi"    = 48
  "mipmap-hdpi"    = 72
  "mipmap-xhdpi"   = 96
  "mipmap-xxhdpi"  = 144
  "mipmap-xxxhdpi" = 192
}
Add-Type -AssemblyName System.Drawing
$source = [System.Drawing.Image]::FromFile($iconSource)
try {
  foreach ($key in $densities.Keys) {
    $dir = Join-Path $android "res\$key"
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    $size = $densities[$key]
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($source, 0, 0, $size, $size)
    $bmp.Save((Join-Path $dir "ic_launcher.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
  }
} finally { $source.Dispose() }

# 3) Kaynakları derle (aapt2 compile + link)
Write-Host "[3/6] Kaynaklar derleniyor..."
& $aapt2 compile --dir (Join-Path $android "res") -o $compiled
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile başarısız" }

$unsigned = Join-Path $out "unsigned.apk"
& $aapt2 link `
  -o $unsigned `
  --manifest $manifest `
  -I $androidJar `
  --java $gen `
  --min-sdk-version 23 `
  --target-sdk-version 35 `
  (Get-ChildItem $compiled -Filter *.flat | ForEach-Object { $_.FullName })
if ($LASTEXITCODE -ne 0) { throw "aapt2 link başarısız" }

# 4) Java kaynaklarını derle
Write-Host "[4/6] Java derleniyor..."
$sources = @(Get-ChildItem (Join-Path $android "java") -Filter *.java -Recurse | ForEach-Object { $_.FullName })
$rJava = @(Get-ChildItem $gen -Filter *.java -Recurse -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
$allSources = $sources + $rJava
$prevPref = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& javac -source 8 -target 8 -encoding UTF-8 -nowarn `
  -classpath $androidJar `
  -d $classes `
  $allSources 2>&1 | Out-Null
$javacExit = $LASTEXITCODE
$ErrorActionPreference = $prevPref
if ($javacExit -ne 0) { throw "javac başarısız" }

# 5) Dex'e çevir
Write-Host "[5/6] DEX oluşturuluyor..."
& $d8 --release --min-api 23 --lib $androidJar --output $dexOut (Get-ChildItem $classes -Filter *.class -Recurse | ForEach-Object { $_.FullName })
if ($LASTEXITCODE -ne 0) { throw "d8 başarısız" }

# classes.dex ve web varlıklarını APK'ya ekle.
# Not: aapt2 link -A Windows'ta ters bölü ile yazıyor; WebView bulamıyor, bu yüzden elle ekliyoruz.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($unsigned, "Update")

function Add-ZipFile($archive, [string]$sourceFile, [string]$entryName) {
  $existing = $archive.GetEntry($entryName)
  if ($existing) { $existing.Delete() }
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
    $archive, $sourceFile, $entryName,
    [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
}

Add-ZipFile $zip (Join-Path $dexOut "classes.dex") "classes.dex"

# assets/ altındaki her dosyayı ileri bölü ile ekle (www + server.txt)
$assetsRoot = $assets
$assetFiles = Get-ChildItem $assetsRoot -Recurse -File
foreach ($file in $assetFiles) {
  $relative = $file.FullName.Substring($assetsRoot.Length + 1) -replace '\\', '/'
  Add-ZipFile $zip $file.FullName ("assets/" + $relative)
}
$zip.Dispose()

# 6) Hizala + imzala
Write-Host "[6/6] Hizalanıyor ve imzalanıyor..."
$aligned = Join-Path $out "aligned.apk"
& $zipalign -f 4 $unsigned $aligned
if ($LASTEXITCODE -ne 0) { throw "zipalign başarısız" }

# Son kullanıcı sürümü kendi anahtarıyla imzalanır; hata ayıklama sürümü debug anahtarını kullanır.
if ($Release) {
  $keystore = Join-Path $android "release.keystore"
  $storePass = "blokiki-release"
  $alias = "blokiki"
  if (-not (Test-Path $keystore)) {
    $prevPref = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & keytool -genkeypair -v -keystore $keystore -storepass $storePass -keypass $storePass `
      -alias $alias -keyalg RSA -keysize 2048 -validity 10000 `
      -dname "CN=Blok Iki,O=Blok Iki,C=TR" 2>&1 | Out-Null
    $ErrorActionPreference = $prevPref
    if (-not (Test-Path $keystore)) { throw "release anahtarı oluşturulamadı" }
    Write-Host "Yeni imza anahtarı: $keystore"
  }
} else {
  $keystore = Join-Path $android "debug.keystore"
  $storePass = "android"
  $alias = "androiddebugkey"
  if (-not (Test-Path $keystore)) {
    $prevPref = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & keytool -genkeypair -v -keystore $keystore -storepass $storePass -keypass $storePass `
      -alias $alias -keyalg RSA -keysize 2048 -validity 10000 `
      -dname "CN=Android Debug,O=Android,C=US" 2>&1 | Out-Null
    $ErrorActionPreference = $prevPref
    if (-not (Test-Path $keystore)) { throw "keytool hata verdi" }
  }
}

if (-not $OutFile) {
  $OutFile = if ($Release) { Join-Path $android "build\Blok-Iki-$VersionName.apk" }
             else { Join-Path $android "build\blok-iki.apk" }
}
& $apksigner sign `
  --ks $keystore --ks-pass "pass:$storePass" --key-pass "pass:$storePass" `
  --min-sdk-version 23 --out $OutFile $aligned
if ($LASTEXITCODE -ne 0) { throw "apksigner başarısız" }

& $apksigner verify --print-certs $OutFile | Select-Object -First 3

$size = [math]::Round((Get-Item $OutFile).Length / 1KB, 1)
Write-Host "`nAPK hazır: $OutFile ($size KB)"
exit 0
