# Blokara 1v1 — mağaza ve uygulama simgesi üretimi
#
#   powershell -ExecutionPolicy Bypass -File store\build-assets.ps1
#
# Kaynaklar:
#   store/icon.html              → tam simge (zemin + çarpışma), 512×512
#   store/icon-foreground.html   → adaptive icon ön planı (saydam), 512×512
#   store/feature-graphic.html   → Play "öne çıkan görsel", 1024×500
#
# Çıktılar:
#   public/icons/*.png
#   android/app/src/main/res/mipmap-*/ic_launcher*.png
#   store/icon-512.png, store/feature-graphic.png

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$store = Join-Path $root "store"
$probe = Join-Path $root "test\probe.cjs"
$node = "node"
$temp = Join-Path $env:TEMP "opencode"

Add-Type -AssemblyName System.Drawing

function Render-Html {
  param([string]$Html, [int]$Width, [int]$Height, [string]$Out, [switch]$Transparent)
  $uri = ([System.Uri]$Html).AbsoluteUri
  $probeArgs = @("--experimental-websocket", $probe, "$Width", "$Height", $uri, "--scale", "1", "--shot", $Out)
  if ($Transparent) { $probeArgs += "--transparent" }
  & $node @probeArgs | Out-Null
  if (-not (Test-Path $Out)) { throw "Render başarısız: $Out" }
}

function Resize-Png {
  param([string]$Source, [int]$Width, [int]$Height, [string]$Out)
  $src = [System.Drawing.Image]::FromFile((Resolve-Path $Source))
  $bmp = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($src, 0, 0, $Width, $Height)
  $g.Dispose()
  $dir = Split-Path -Parent $Out
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $src.Dispose()
}

function Pad-Png {
  param([string]$Source, [int]$Size, [double]$ContentScale, [string]$Out, [string]$Background = "#1c1b2e")
  $src = [System.Drawing.Image]::FromFile((Resolve-Path $Source))
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.ColorTranslator]::FromHtml($Background))
  $inner = [int]($Size * $ContentScale)
  $offset = [int](($Size - $inner) / 2)
  $g.DrawImage($src, $offset, $offset, $inner, $inner)
  $g.Dispose()
  $dir = Split-Path -Parent $Out
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $src.Dispose()
}

Write-Host "1/4  kaynak görseller çiziliyor…"
$iconHtml = Join-Path $store "icon.html"
$fgHtml = Join-Path $store "icon-foreground.html"
$featureHtml = Join-Path $store "feature-graphic.html"

$icon512 = Join-Path $store "icon-512.png"
$fg512 = Join-Path $store "icon-foreground-512.png"
$feature = Join-Path $store "feature-graphic.png"

Render-Html -Html $iconHtml -Width 512 -Height 512 -Out $icon512
Render-Html -Html $fgHtml -Width 512 -Height 512 -Out $fg512 -Transparent
Render-Html -Html $featureHtml -Width 1024 -Height 500 -Out $feature

# Kaynak simge her seferinde 1024'e büyütülür (vektörden geldiği için temiz).
$icon1024 = Join-Path $store "icon-1024.png"
Resize-Png -Source $icon512 -Width 1024 -Height 1024 -Out $icon1024

Write-Host "2/4  web simgeleri…"
$icons = Join-Path $root "public\icons"
Resize-Png -Source $icon1024 -Width 1024 -Height 1024 -Out (Join-Path $icons "icon-1024.png")
Resize-Png -Source $icon1024 -Width 512 -Height 512 -Out (Join-Path $icons "icon-512.png")
Resize-Png -Source $icon1024 -Width 192 -Height 192 -Out (Join-Path $icons "icon-192.png")
Pad-Png -Source $icon1024 -Size 512 -ContentScale 0.72 -Out (Join-Path $icons "icon-maskable-512.png")

Write-Host "3/4  Android launcher simgeleri…"
$res = Join-Path $root "android\app\src\main\res"
$densities = @(
  @{ dir = "mipmap-mdpi"; launcher = 48; foreground = 108 },
  @{ dir = "mipmap-hdpi"; launcher = 72; foreground = 162 },
  @{ dir = "mipmap-xhdpi"; launcher = 96; foreground = 216 },
  @{ dir = "mipmap-xxhdpi"; launcher = 144; foreground = 324 },
  @{ dir = "mipmap-xxxhdpi"; launcher = 192; foreground = 432 }
)
foreach ($d in $densities) {
  $dir = Join-Path $res $d.dir
  Resize-Png -Source $icon1024 -Width $d.launcher -Height $d.launcher -Out (Join-Path $dir "ic_launcher.png")
  Resize-Png -Source $icon1024 -Width $d.launcher -Height $d.launcher -Out (Join-Path $dir "ic_launcher_round.png")
  Resize-Png -Source $fg512 -Width $d.foreground -Height $d.foreground -Out (Join-Path $dir "ic_launcher_foreground.png")
}

Write-Host "4/4  Play mağaza görselleri…"
Resize-Png -Source $icon1024 -Width 512 -Height 512 -Out (Join-Path $store "play-icon-512.png")
Resize-Png -Source $feature -Width 1024 -Height 500 -Out (Join-Path $store "play-feature-1024x500.png")

Write-Host "Bitti."
Write-Host "  Simge (Play): $store\play-icon-512.png"
Write-Host "  Öne çıkan  : $store\play-feature-1024x500.png"
Write-Host "  Web        : $icons"
Write-Host "  Android    : $res\mipmap-*"
