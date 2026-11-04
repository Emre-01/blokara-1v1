# Sunucuyu yayına alma (ücretsiz)

> **En kısa yol:** `powershell -ExecutionPolicy Bypass -File deploy-render.ps1`
> Depoyu kontrol eder, Render Blueprint bağlantısını panoya kopyalar.
> Tek gereken: ücretsiz bir GitHub deposu + ücretsiz Render hesabı
> (kart istemez). Adres kalıcıdır: `https://blok-iki.onrender.com`.


Oyunun tek cihaz modları (tek kişilik, aynı telefon) internetsiz çalışır. Yalnızca
**arkadaşınla oyna** (oda kodu veya rastgele eşleşme) modu için bir sunucu gerekir. Sunucu
tek dosya Node uygulamasıdır, npm bağımlılığı yoktur, WebSocket'i kendi içinde
barındırır — bu yüzden Docker/Node kabul eden her ücretsiz platformda çalışır.

## Hızlı deneme: Cloudflare tüneli (hesap gerekmez)

Bilgisayarında sunucu çalışırken, tek komutla internetten erişilebilir bir adres al:

```powershell
# 1) oyun sunucusu
cd blockblast
node server.cjs                      # http://localhost:8080

# 2) ikinci terminalde tünel (cloudflared.exe bir kez indirilir)
cloudflared tunnel --url http://127.0.0.1:8080
```

Çıktıdaki `https://....trycloudflare.com` adresini APK'ya göm:

```powershell
powershell -ExecutionPolicy Bypass -File android\build-apk.ps1 `
  -ServerUrl "https://....trycloudflare.com" `
  -Release -VersionName "1.8" -VersionCode 10
```

⚠ Tünel adresi **geçicidir**: `cloudflared` kapanınca ya da yeniden başlayınca
adres değişir, bilgisayar kapanınca arkadaşınla oyun oynanamaz. Arkadaşlarına kalıcı
bir APK vermek için aşağıdaki adımı kullan.

## Kalıcı ve ücretsiz: Render

| | Render (önerilen) | Koyeb | Fly.io | Vercel/Netlify |
|---|---|---|---|---|
| Ücretsiz | ✅ (kart istemez) | ✅ | ❌ kart ister | ✅ |
| WebSocket | ✅ | ✅ | ✅ | ❌ |
| Kurulum | Blueprint (tek dosya) | Docker | CLI | — |

Sınır: Render ücretsiz planı ~15 dakika boşta kalınca uyur. Uyanması 30–60 saniye
sürer; oyun bunu bildirir ("Sunucu uyanıyor…") ve bağlantıyı 45 saniye bekler.

### 1. Kodu bir GitHub deposuna koy

Depo **herkese açık** olabilir (kodda gizli bilgi yok). GitHub'da boş bir depo
aç, sonra bu klasörde:

```powershell
cd blockblast
git init
git add .
git -c user.name="Emre" -c user.email="emre@local" commit -m "Blokara 1v1 sunucusu"
git branch -M main
git remote add origin https://github.com/<kullanici>/blok-iki.git
git push -u origin main
```

Konsol yerine tarayıcı istersen: GitHub → **Add file → Upload files** → bu
klasördeki `package.json`, `server.cjs`, `public/`, `Dockerfile`, `render.yaml`
dosyalarını sürükle.

### 2. Render'da yayına al

1. <https://render.com> → **Get Started** → GitHub ile giriş yap.
2. **New → Blueprint** → depoyu seç → **Apply**.
   Depo kökünde `render.yaml` varsa o kullanılır ve oyun sunucusunu
   `rootDir: blockblast` ile işaret eder. Yalnızca `blockblast` klasörünü ayrı
   depoya koyduysan içindeki `render.yaml` her şeyi ayarlar (ücretsiz plan,
   Frankfurt, `/healthz` sağlık kontrolü).
3. 2–3 dakika sonra adresin hazır olur: `https://blok-iki.onrender.com`
   (Blueprint'teki `name` neyse o; çakışırsa Render sonuna harf ekler).

Adresi tarayıcıda aç, "Blokara 1v1" ana ekranını görüyorsan sunucu ayakta.
Bundan sonra kendi bilgisayarın kapalı olsa da web adresinden ve APK'dan
oynanabilir; yalnızca Render'ın ücretsiz planı boşta uykuya geçebilir.

> Blueprint kullanmak istemezsen: **New → Web Service** → depoyu seç →
> Runtime **Node**, Build Command boş, Start Command `node server.cjs`, Plan **Free**.

### 3. APK'ya adresi göm

```powershell
cd blockblast
powershell -ExecutionPolicy Bypass -File android\build-apk.ps1 `
  -ServerUrl "https://blok-iki.onrender.com" `
  -Release -VersionName "1.8" -VersionCode 10
```

Çıktı: `android/dist/Blokara-1v1-1.8.apk`. Bu dosyayı telefona atıp kur; artık
arkadaşınla **kodla katıl** veya **Rastgele eşleş** üzerinden, farklı ağlarda
bile oynayabilirsin. Yayın adresi ayakta olduğu sürece kendi bilgisayarın kapalı
olsa da oyun çalışır.

Sunucu adresi değişirse aynı komutu yeni adresle tekrar çalıştır — tek değişen
`assets/server.txt` olur.

## Sağlık kontrolü

```powershell
curl https://blok-iki.onrender.com/healthz     # "ok" döner
```

## Sunucuyu hiç kapatmamak

Ücretsiz barındırmada bile "hiç kapanmasın" istiyorsan üç katman birlikte çalışır:

| Katman | Ne yapar | Nerede |
|---|---|---|
| Süreç bekçisi | Çöken/donmuş sunucuyu yeniden başlatır | `server-guard.cjs` |
| İşletim sistemi | Makine açılınca sunucuyu başlatır | `install-service.ps1` / `docker compose` |
| Dış dürtme | Boştaki sunucuyu uyandırır | `.github/workflows/keepalive.yml` |

### Kendi bilgisayarında (Windows, yönetici gerekmez)

```powershell
cd blockblast
powershell -ExecutionPolicy Bypass -File install-service.ps1
```

Görev `BlokIkiServer` adıyla kurulur; oturum açılışında başlar, bekçi üzerinden
çalışır. Kontrol ve kaldırma:

```powershell
powershell -ExecutionPolicy Bypass -File install-service.ps1 -Status
powershell -ExecutionPolicy Bypass -File install-service.ps1 -Remove
```

Bekçi 15 sn'de bir `/healthz` yoklar, 3 başarısız denemeden sonra donmuş süreci
öldürüp temiz başlatır; çökmede 1→30 sn artan bekleme uygular. Günlük:
`blockblast/logs/server.log`.

> Aynı Wi-Fi'daki telefonlar bağlanamıyorsa güvenlik duvarında 8080 portunu aç
> (betik yönetici ise kendisi açar, değilse komutu yazar).

### VPS / NAS / Linux

```bash
cd blockblast
docker compose up -d
```

`restart: always` + Docker healthcheck sayesinde makine yeniden başlasa da sunucu
kalkar.

### Render ücretsiz planı

Render çöken süreci kendisi yeniden başlatır; tek sorun boşta uyumasıdır. Depoya
`SUNUCU_URL` sırrını ekle; `keepalive.yml` 10 dakikada bir `/healthz` çağırır.
Daha sık ve güvenilir kontrol için UptimeRobot'ta ücretsiz bir HTTP izleyici
açıp adresi `https://<sunucu>/healthz` yap (5 dakikada bir).

## Alternatif: kendi bilgisayarın (aile/aynı Wi-Fi)

```powershell
cd blockblast
node server.cjs        # http://<bilgisayar-ip>:8080
powershell -ExecutionPolicy Bypass -File android\build-apk.ps1 `
  -ServerUrl "http://192.168.1.85:8080" -Release -VersionName "1.8" -VersionCode 10
```

Bilgisayar kapalıyken oda oyunu çalışmaz; aynı Wi-Fi'daki telefonlar çalışır.

## Alternatif: Koyeb / Hugging Face Spaces (Docker)

Depodaki `Dockerfile` hazır. Koyeb'de **Create Service → GitHub → Dockerfile**,
port `8080`, plan **Free** seç. Hugging Face Spaces'te **New Space → Docker**,
boş şablon, dosyaları yükle; Space adresi `https://<kullanici>-<space>.hf.space`
olur. İkisinde de WebSocket desteklenir.
