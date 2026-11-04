# Blokara 1v1 — kalıcı ücretsiz sunucu kurulumu
#
# Bu betik sunucuyu Render.com'a (ücretsiz plan) taşımak için gereken her şeyi
# kontrol eder ve seni tek tıkla yayına götürür. Render hesabı ve GitHub deposu
# senin adına açılmalıdır; betik bunları senin oturumunla yapar.
#
#   powershell -ExecutionPolicy Bypass -File deploy-render.ps1
#   powershell -ExecutionPolicy Bypass -File deploy-render.ps1 -Check
#
# Adımlar:
#   1) Kodu GitHub'a gönder (depo herkese açık olabilir; gizli bilgi yok).
#   2) Render panelinde "New > Blueprint" seç, depoyu bağla, Apply.
#   3) Render adresini APK'ya gömüp yeniden derle.

param(
  [string]$RepoUrl = "",
  [switch]$Check,
  [switch]$Open
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$gitRoot = Split-Path -Parent $root

function Write-Step([string]$text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Write-Ok([string]$text) { Write-Host "  OK  $text" -ForegroundColor Green }
function Write-Warn([string]$text) { Write-Host "  !   $text" -ForegroundColor Yellow }

Write-Step "Ortam kontrolü"
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) { Write-Ok ("Node " + (& node -v)) } else { Write-Warn "Node bulunamadı (yalnızca yerel test için gerekir)." }
$git = Get-Command git -ErrorAction SilentlyContinue
if ($git) { Write-Ok ("Git " + (& git --version)) } else { throw "Git kurulu değil." }

Write-Step "Depo durumu"
Push-Location $gitRoot
try {
  $remote = ""
  try { $remote = (& git remote get-url origin 2>$null) } catch { $remote = "" }
  $remote = "$remote".Trim()
  if ($remote) {
    Write-Ok "origin: $remote"
  } else {
    Write-Warn "GitHub deposu bağlı değil."
    Write-Host @"

  GitHub'da boş bir depo aç (public olabilir), sonra:

    cd "$gitRoot"
    git remote add origin https://github.com/<kullanici>/blokara.git
    git branch -M main
    git push -u origin main

  Ardından bu betiği tekrar çalıştır:
    powershell -ExecutionPolicy Bypass -File "$PSCommandPath"

"@
    if ($RepoUrl) {
      & git remote add origin $RepoUrl
      & git branch -M main
      & git push -u origin main
      $remote = $RepoUrl
      Write-Ok "Depo gönderildi: $RepoUrl"
    }
  }

  $dirty = (& git status --porcelain)
  if ($dirty) { Write-Warn "Commit edilmemiş değişiklik var; önce commit'le." } else { Write-Ok "Çalışma ağacı temiz." }

  if ($Check) {
    Write-Step "Yerel sunucu sağlığı"
    try {
      $health = Invoke-WebRequest "http://127.0.0.1:8080/healthz" -UseBasicParsing -TimeoutSec 4
      Write-Ok ("http://127.0.0.1:8080/healthz -> " + $health.Content)
    } catch {
      Write-Warn "Yerel sunucu kapalı (node server.cjs ile başlat)."
    }
    return
  }

  if (-not $remote) { return }

  $slug = ($remote -replace '^.*github\.com[:/]', '' -replace '\.git$', '')
  $blueprint = "https://render.com/deploy?repo=https://github.com/$slug"
  Write-Step "Render Blueprint"
  Write-Host "  Depo : https://github.com/$slug"
  Write-Host "  Tıkla: $blueprint"
  Write-Host @"

  Panelde yapılacaklar:
    1. GitHub ile giriş yap (ücretsiz, kart istemez).
    2. Blueprint'i onayla: servis adı "blok-iki", plan Free, bölge Frankfurt.
    3. 2-3 dakika bekle; adres: https://blok-iki.onrender.com
    4. Adresi APK'ya göm:

       powershell -ExecutionPolicy Bypass -File android\build-apk.ps1 ``
         -ServerUrl "https://blok-iki.onrender.com" -Release ``
         -VersionName "2.0.4" -VersionCode 16

  Ücretsiz plan 15 dakika boşta uyur; depodaki GitHub Actions
  (.github/workflows/keepalive.yml) SUNUCU_URL sırrı tanımlanınca onu uyanık tutar.

"@
  if ($Open) { Start-Process $blueprint } else { Set-Clipboard $blueprint; Write-Ok "Bağlantı panoya kopyalandı." }
}
finally {
  Pop-Location
}
