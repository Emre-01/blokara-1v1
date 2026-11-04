# Blokara 1v1 — Play mağaza ekran görüntüleri (1080×1920)
#
#   powershell -ExecutionPolicy Bypass -File store\build-screens.ps1
#   powershell -ExecutionPolicy Bypass -File store\build-screens.ps1 -Lang en
#
# Oyun sunucusu açık olmalı (oda kodu sahnesi gerçek oda kurar):
#   node server.cjs
#
# Çıktı: store/screens/<dil>/01-ana-ekran.png … (9:16, 1080×1920)

param(
  [string]$Lang = "tr",
  [string]$BaseUrl = "http://127.0.0.1:8080/?test=1"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$scenes = Join-Path $PSScriptRoot "scenes"
$probe = Join-Path $root "test\probe.cjs"
$outDir = Join-Path $PSScriptRoot ("screens\" + $Lang)
$node = "node"

if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }

$shots = @(
  @{ scene = "01-home.js";   name = "01-ana-ekran.png" },
  @{ scene = "02-solo.js";   name = "02-tek-kisisilik.png" },
  @{ scene = "03-versus.js"; name = "03-rakip.png" },
  @{ scene = "04-room.js";   name = "04-oda-kodu.png" },
  @{ scene = "06-coop.js";   name = "05-ortak-tahta.png" },
  @{ scene = "05-result.js"; name = "06-sonuc.png" }
)

$url = $BaseUrl
if ($url -notmatch '[?&]lang=') { $url = "$url&lang=$Lang" }

foreach ($shot in $shots) {
  $scene = Join-Path $scenes $shot.scene
  $out = Join-Path $outDir $shot.name
  Write-Host ("çiziliyor: " + $shot.name)
  & $node --experimental-websocket $probe 540 960 $url --scale 2 --eval $scene --shot $out | Out-Null
  if (-not (Test-Path $out)) { throw "Ekran görüntüsü üretilemedi: $out" }
}

Write-Host ""
Write-Host ("Hazır: " + $outDir)
Get-ChildItem $outDir | ForEach-Object { Write-Host ("  " + $_.Name) }
