# Sunucuyu yayına alma (ücretsiz)

Oyunun tek cihaz modları (bot, aynı telefon) internetsiz çalışır. Yalnızca
**uzaktan oyna** için bir sunucu gerekir. Sunucu tek dosya Node uygulamasıdır,
npm bağımlılığı yoktur, WebSocket'i kendi içinde barındırır — bu yüzden
Docker/Node kabul eden her ücretsiz platformda çalışır.

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
  -Release -VersionName "1.2" -VersionCode 3
```

⚠ Tünel adresi **geçicidir**: `cloudflared` kapanınca ya da yeniden başlayınca
adres değişir, bilgisayar kapanınca oyun uzaktan oynanamaz. Arkadaşlarına kalıcı
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
git -c user.name="Emre" -c user.email="emre@local" commit -m "Blok Iki sunucusu"
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
   `render.yaml` her şeyi ayarlar (ücretsiz plan, Frankfurt, `/healthz` sağlık kontrolü).
3. 2–3 dakika sonra adresin hazır olur: `https://blok-iki.onrender.com`
   (Blueprint'teki `name` neyse o; çakışırsa Render sonuna harf ekler).

Adresi tarayıcıda aç, "Blok İki" ana ekranını görüyorsan sunucu ayakta.

> Blueprint kullanmak istemezsen: **New → Web Service** → depoyu seç →
> Runtime **Node**, Build Command boş, Start Command `node server.cjs`, Plan **Free**.

### 3. APK'ya adresi göm

```powershell
cd blockblast
powershell -ExecutionPolicy Bypass -File android\build-apk.ps1 `
  -ServerUrl "https://blok-iki.onrender.com" `
  -Release -VersionName "1.1" -VersionCode 2
```

Çıktı: `android/build/Blok-Iki-1.1.apk`. Bu dosyayı telefona atıp kur; artık
arkadaşınla **kodla katıl** üzerinden, farklı ağlarda bile oynayabilirsin.

Sunucu adresi değişirse aynı komutu yeni adresle tekrar çalıştır — tek değişen
`assets/server.txt` olur.

## Sağlık kontrolü

```powershell
curl https://blok-iki.onrender.com/healthz     # "ok" döner
```

## Alternatif: kendi bilgisayarın (aile/aynı Wi-Fi)

```powershell
cd blockblast
node server.cjs        # http://<bilgisayar-ip>:8080
powershell -ExecutionPolicy Bypass -File android\build-apk.ps1 `
  -ServerUrl "http://192.168.1.75:8080" -Release -VersionName "1.1" -VersionCode 2
```

Bilgisayar kapalıyken uzaktan oyun çalışmaz; aynı Wi-Fi'daki telefonlar çalışır.

## Alternatif: Koyeb / Hugging Face Spaces (Docker)

Depodaki `Dockerfile` hazır. Koyeb'de **Create Service → GitHub → Dockerfile**,
port `8080`, plan **Free** seç. Hugging Face Spaces'te **New Space → Docker**,
boş şablon, dosyaları yükle; Space adresi `https://<kullanici>-<space>.hf.space`
olur. İkisinde de WebSocket desteklenir.
