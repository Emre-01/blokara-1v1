# Blokara 2v2 sunucusunu Windows'ta kalıcı hale getirir.
#
#   powershell -ExecutionPolicy Bypass -File install-service.ps1            # kur + başlat
#   powershell -ExecutionPolicy Bypass -File install-service.ps1 -Port 8080
#   powershell -ExecutionPolicy Bypass -File install-service.ps1 -Status    # durum + sağlık
#   powershell -ExecutionPolicy Bypass -File install-service.ps1 -Remove    # kaldır
#
# Yönetici izni GEREKMEZ: görev, oturum açan kullanıcı adına çalışır.
# Sunucu, server-guard.cjs bekçisi üzerinden çalışır; çökerse kendini yeniden
# başlatır. Görev de oturum açılışında ve makine uyandığında devreye girer.

param(
  [int]$Port = 8080,
  [string]$TaskName = "BlokIkiServer",
  [switch]$Remove,
  [switch]$Status
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

function Get-ServerUrl([int]$port) { return "http://127.0.0.1:$port/healthz" }

function Test-ServerHealth([int]$port) {
  try {
    $response = Invoke-WebRequest (Get-ServerUrl $port) -UseBasicParsing -TimeoutSec 4
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if ($Status) {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $task) {
    Write-Host "Görev yok: $TaskName (kurulu değil)." -ForegroundColor Yellow
  } else {
    $info = Get-ScheduledTaskInfo -TaskName $TaskName
    Write-Host "Görev        : $TaskName"
    Write-Host "Durum        : $($task.State)"
    Write-Host "Son çalışma  : $($info.LastRunTime)"
    Write-Host "Son sonuç    : 0x$('{0:X}' -f $info.LastTaskResult)"
    Write-Host "Sonraki      : $($info.NextRunTime)"
  }

  $guard = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*server-guard.cjs*" }
  if ($guard) {
    Write-Host "Bekçi süreci : çalışıyor (pid $($guard.ProcessId -join ', '))" -ForegroundColor Green
  } else {
    Write-Host "Bekçi süreci : çalışmıyor" -ForegroundColor Yellow
  }

  $worker = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*server.cjs*" -and $_.CommandLine -notlike "*guard*" }
  if ($worker) {
    Write-Host "Sunucu süreci: çalışıyor (pid $($worker.ProcessId -join ', '))" -ForegroundColor Green
  } else {
    Write-Host "Sunucu süreci: çalışmıyor" -ForegroundColor Yellow
  }

  Write-Host ("Sağlık       : " + $(if (Test-ServerHealth $Port) { "OK ($(Get-ServerUrl $Port))" } else { "yanıt yok" }))
  return
}

if ($Remove) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Görev kaldırıldı: $TaskName"

  # Bekçiyi de durdur (yalnızca bu klasöre ait olanı).
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*server-guard.cjs*" -and $_.CommandLine -like "*$root*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Write-Host "Bekçi süreci durduruldu."
  return
}

# --- Node yolu ------------------------------------------------------
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw "node bulunamadı. Node.js 18+ kur ve PATH'e ekle." }

$nodeVersion = (& node -v).TrimStart("v")
if ([version]($nodeVersion -split "-")[0] -lt [version]"18.0.0") {
  throw "Node.js 18+ gerekli (bulunan: $nodeVersion)."
}

# --- Portu kullanan eski süreçleri durdur ---------------------------
$listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
foreach ($listener in $listeners) {
  $proc = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
  if ($proc -and $proc.ProcessName -eq "node") {
    Write-Host "Port $Port üzerindeki eski node süreci durduruluyor (pid $($proc.Id))..."
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 700
  } elseif ($proc) {
    throw "Port $Port başka bir uygulama tarafından kullanılıyor: $($proc.ProcessName) (pid $($proc.Id))"
  }
}

# --- Görev tanımı ---------------------------------------------------
$action = New-ScheduledTaskAction `
  -Execute $node `
  -Argument ('"' + (Join-Path $root "server-guard.cjs") + '"') `
  -WorkingDirectory $root

$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Days 9999) `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1)

# Bekçi kendi de yeniden başlatır; görev yalnızca bekçi tamamen ölürse devreye girer.
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

$envArgs = @()
# PORT ortam değişkenini görev içinde ayarlamak için küçük bir sarmalayıcı kullanılır.
$wrapper = Join-Path $root "run-server.ps1"
$wrapperBody = @"
# Otomatik üretildi: install-service.ps1
`$env:PORT = "$Port"
`$env:HOST = "0.0.0.0"
& "$node" "$(Join-Path $root 'server-guard.cjs')"
"@
[System.IO.File]::WriteAllText($wrapper, $wrapperBody, (New-Object System.Text.UTF8Encoding($false)))

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $wrapper + '"') `
  -WorkingDirectory $root

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $logonTrigger `
  -Settings $settings -Principal $principal -Description "Blokara 2v2 oyun sunucusu (7/24 bekçi)" -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName
Write-Host "Görev kuruldu ve başlatıldı: $TaskName"

# --- Sağlık kontrolü ------------------------------------------------
$healthy = $false
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Milliseconds 700
  if (Test-ServerHealth $Port) { $healthy = $true; break }
}

if ($healthy) {
  Write-Host "Sunucu ayakta: http://localhost:$Port  (sağlık: OK)" -ForegroundColor Green
} else {
  Write-Host "Sunucu henüz yanıt vermiyor. Günlüğe bak: $root\logs\server.log" -ForegroundColor Yellow
}

# --- Güvenlik duvarı (yalnızca yönetici ise) -----------------------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
$ruleName = "Blokara 2v2 $Port"
if ($isAdmin) {
  if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow `
      -Protocol TCP -LocalPort $Port -Profile Private | Out-Null
    Write-Host "Güvenlik duvarı: $Port (özel ağ) açıldı."
  }
} else {
  Write-Host "Not: Aynı Wi-Fi'daki telefonlar erişemezse, yönetici PowerShell'de şunu çalıştır:" -ForegroundColor Yellow
  Write-Host "  New-NetFirewallRule -DisplayName `"Blokara 2v2 $Port`" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Private"
}

Write-Host ""
Write-Host "Durum : powershell -ExecutionPolicy Bypass -File install-service.ps1 -Status"
Write-Host "Kaldır: powershell -ExecutionPolicy Bypass -File install-service.ps1 -Remove"
Write-Host "Günlük: $root\logs\server.log"
