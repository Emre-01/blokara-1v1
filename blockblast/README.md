# Blok İki

Block Blast'ın iki kişilik yorumu. Aynı cihazda ya da oda koduyla uzaktan oynanır.
Telefona Android uygulaması (APK) olarak kurulabilir, internetsiz de açılır.

## İki mod

**Ortak tahta** — Tek 8×8 tahta, tek ortak skor. Oyuncular sırayla blok yerleştirir.
Her oyuncunun katkısı ayrı sayılır. Tahta tıkanınca tur biter.

**Rakip** — Her oyuncunun kendi tahtası vardır ama iki taraf da **aynı blok sırasını**
alır. Tahtası dolan oyuncu kaybeder. İki satır birden patlatan oyuncu rakibinin
tahtasına çöp satır iter (2 satır → 1 çöp, 3+ satır → 2 çöp).

## Süre, ceza, ödül

Üç süre modu var; ana sayfadaki **Süre** seçicisinden ya da odada oda sahibi tarafından
seçilir.

| Mod | Davranış |
| --- | --- |
| **Ortak süre** (2:00) | Tek sayaç iki oyuncu için de akar. Süre bitince yüksek skor kazanır; ortak modda tur biter. |
| **Sıra süresi** (0:30) | Her oyuncunun sırası için ayrı sayaç. Süre dolarsa **−15 puan ceza** ve sıra geçer. Rakip modunda her oyuncunun kendi saati vardır. |
| **Süresiz** | Sayaç yok, ceza yok. Sadece tahta tıkanınca biter. |

**Ödül:** Patlayan her satır **+2 saniye**, combo her kademesi **+0,75 saniye** kazandırır.
Sayaç, başlangıç süresinin en fazla 1,5 katına kadar dolabilir.

**Kalıcı ilerleme (cihazda):** Her tur sonunda XP ve coin kazanılır; seviye atlanır,
rekorlar tutulur. 12 başarım açılabilir, her biri coin ödüllü. **Günün tahtası** her gün
aynı blok dizisini verir; günlük seriyi sürdürmek bonus coin kazandırır. Tüm bunlar
`localStorage` üzerinde çalışır, yani APK çevrimdışıyken de kaydedilir.

## Çalıştırma

Gereksinim: Node.js 18 veya üstü. Başka paket yok, `npm install` gerekmez.

```bash
cd blockblast
node server.cjs
```

Tarayıcıda `http://localhost:8080` adresini aç.

Aynı Wi-Fi üzerindeki telefondan oynamak için bilgisayarın yerel IP'sini kullan:

```bash
# Windows
ipconfig
# örn: http://192.168.1.34:8080
```

Windows güvenlik duvarı sorarsa Node.js için özel ağ erişimine izin ver.

## Uzaktan oynamak

Oyun iki tarayıcıyı WebSocket üzerinden aynı sunucuya bağlar. Sunucunun internete
açık olması gerekir. Üç pratik yol:

### 1. Tünel (en hızlı deneme)

```bash
node server.cjs
# ayrı bir terminalde:
cloudflared tunnel --url http://localhost:8080
# veya:
ngrok http 8080
```

Verdiği `https://...` adresini arkadaşına gönder. Sayfa HTTPS olduğu için WebSocket
otomatik olarak `wss://` kullanır.

### 2. Ücretsiz Node barındırma (Render / Railway / Fly.io)

Depoyu bağla, çalıştırma komutunu `node server.cjs` yap. `PORT` ortam değişkeni
otomatik okunur. Render için hazır `render.yaml` dosyası vardır. WebSocket desteği
bu sağlayıcılarda açıktır.

### 3. Kendi sunucun

`node server.cjs` çalıştır, 8080 portunu bir reverse proxy (Caddy / Nginx) arkasına
al ve HTTPS ver. `SSL_KEY` + `SSL_CERT` ortam değişkenleriyle Node doğrudan HTTPS de
başlatabilir:

```bash
SSL_KEY=/etc/ssl/key.pem SSL_CERT=/etc/ssl/cert.pem node server.cjs
```

> Aynı ağda oynuyorsanız internete açmanız gerekmez; yerel IP yeterlidir.

## Nasıl oynanır

1. Ana sayfada **Bota karşı oyna** ile tek başına başla ya da bir mod kartından
   **Aynı cihazda oyna** de.
2. Uzaktan için adını yaz, modu seç, **Oda kur**. Çıkan 5 haneli kodu arkadaşına
   gönder. Arkadaşın aynı sayfada kodu girip **Odaya katıl** der.
3. Oda sahibi süre modunu seçer ve **Oyunu başlat**'a basar.
4. Blokları tahtaya sürükle. Kısa dokunuşla bloğu seçip tahtadaki bir kareye
   dokunarak da yerleştirebilirsin.
5. Klavyeyle de oynanır: blok üzerinde **Enter** ile seç, **ok tuşlarıyla** gez,
   **Enter** ile bırak, **Esc** ile vazgeç.
6. Tamamlanan her satır/sütun patlar. Üst üste patlatmak combo çarpanını yükseltir.

Puanlama: yerleşen her blok için 1 puan; patlayan her satır için `10 × satır × combo`.
Combo, art arda patlayan hamlelerde büyür, patlamayan hamlede sıfırlanır.

## Telefona kurma (Android APK)

APK hazır olarak `android/build/blok-iki.apk` altında üretilir. Gradle gerekmez; yalnızca
JDK + Android SDK build-tools kullanılır (aapt2 → javac → d8 → zipalign → apksigner).

```powershell
cd blockblast
powershell -ExecutionPolicy Bypass -File android\build-apk.ps1 `
  -ServerUrl "https://senin-sunucun.onrender.com"
```

`-ServerUrl` verilirse adres APK'nın içine gömülür (`assets/server.txt`), arkadaşın
hiçbir ayar yapmadan uzaktan oynayabilir. Adres verilmezse uygulama içindeki
**Sunucu adresi** alanı kullanılır (`http://10.0.2.2:8080` varsayılanı emülatör içindir).

Kurulum:

```powershell
adb install -r android\build\blok-iki.apk
```

APK `file:///android_asset/www/index.html` adresini bir WebView'da açar; yerel oyunlar
tamamen çevrimdışıdır, uzaktan oyun gömülü sunucu adresini kullanır.

PWA olarak kurmak da mümkün: oyunu HTTPS üzerinden aç, Chrome menüsü →
**Uygulamayı yükle**. Artık tam ekran ve çevrimdışı açılabilir.

## Dosyalar

```
blockblast/
  server.cjs              statik sunucu + sıfır bağımlılıklı WebSocket + odalar
  public/
    index.html
    styles.css
    app.js                arayüz, sürükle-bırak, online oturum, saat, bot
    game-core.js          tahta, bloklar, puanlama, süre, çöp satır, bot
    progress.js           XP/coin/seviye/başarım/günlük (localStorage)
    fx.js                 parçacık, konfeti, sarsıntı, titreşim
    manifest.webmanifest  PWA
    sw.js                 çevrimdışı önbellek
    icons/
  android/
    build-apk.ps1         Gradle'sız APK derleme
    java/.../MainActivity.java
    drive.cjs             emülatördeki WebView'ı CDP ile sürme aracı
  test/
  package.json
  render.yaml
  DESIGN.md               tasarım kararları ve gerekçeleri
```

Sunucu otoritedir: hamleleri doğrular, tahtaları, blok sırasını ve saatleri kendi tutar.
İstemci sadece `{t:"move", piece, row, col}` gönderir; skor ve süre sunucuda hesaplanır.

## Testler

```bash
npm test                     # hepsini çalıştırır
node test/core-test.cjs      # oyun kuralları, süre, çöp satır, bot (20 test)
node test/socket-test.cjs    # oda/WebSocket akışı + otoriter saat; sunucuyu 8099'da açar
node --experimental-websocket test/online-flow.cjs   # iki sekmeli uçtan uca akış (17 kontrol)
node test/check-html.cjs     # HTML/UTF-8/varlık sağlık kontrolü
```

`test/inspect.cjs` geliştirme aracıdır: başsız Chrome ile mobil ekran görüntüsü
alır ve yatay taşma ölçer.

```bash
node --experimental-websocket test/inspect.cjs http://127.0.0.1:8080/ 390 844 shot.png
```

## Notlar

- Oda kodları karışabilecek harfleri (I, O, 0, 1) kullanmaz.
- Sekme kapanırsa oyuncu 90 saniye içinde aynı tarayıcıdan geri dönebilir.
- Sunucu yeniden başlarsa odalar silinir.
- Servis çalışanı varlıkları ağdan çeker, çevrimdışıyken önbellekten sunar; böylece
  güncellemeler takılı kalmaz.
- Bu proje Block Blast ile bağlantılı değildir; ona saygıyla yapılmış iki kişilik
  bir yorumdur.
