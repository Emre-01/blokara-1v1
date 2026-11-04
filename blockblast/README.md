# Blokara 1v1

Tek kişilik ve iki kişilik blok oyunu. Tek başına rekor kır, aynı cihazda iki kişi
oyna ya da oda kodu/rastgele eşleşme ile arkadaşlarınla kapış.
Telefona Android uygulaması (APK) olarak kurulabilir, internetsiz de açılır.

## Üç mod

**Tek kişilik** — Kendi 8×8 tahtanda oynarsın. Satır ve sütunları patlatıp combo
yaparsın; tahta tıkanınca tur biter. Sayaç yoktur, bu yüzden kendi hızında
oynayıp rekorunu yükseltirsin.

**Ortak tahta** — Tek 8×8 tahta, tek ortak skor. Oyuncular sırayla blok yerleştirir.
Her oyuncunun katkısı ayrı sayılır. Tahta tıkanınca tur biter.

**Rakip** — Her oyuncunun kendi tahtası vardır ama iki taraf da **aynı blok sırasını**
alır. Tahtası dolan oyuncu kaybeder. Çevrimiçi rakip oyununda arkadaşının tahtası
seninkiyle aynı anda, yanda daha küçük olarak görünür. İki satır birden patlatan
oyuncu rakibinin tahtasına çöp satır iter (2 satır → 1 çöp, 3+ satır → 2 çöp).

## Süre, ceza, ödül

İki kişilik turlarda üç süre modu var; ana sayfadaki **Süre** seçicisinden ya da
odada oda sahibi tarafından seçilir. Tek kişilik modda sayaç kapalıdır.

| Mod | Davranış |
| --- | --- |
| **Ortak süre** (2:00) | Tek sayaç iki oyuncu için de akar. Süre bitince yüksek skor kazanır; ortak modda tur biter. |
| **Sıra süresi** (0:30) | Her oyuncunun sırası için ayrı sayaç. Süre dolarsa **−15 puan ceza** ve sıra geçer. Rakip modunda her oyuncunun kendi saati vardır. |
| **Süresiz** | Sayaç yok, ceza yok. Sadece tahta tıkanınca biter. |

**Ödül:** Patlayan her satır **+2 saniye**, combo her kademesi **+0,75 saniye** kazandırır.
Sayaç, başlangıç süresinin en fazla 1,5 katına kadar dolabilir.

**Kalıcı ilerleme (cihazda):** Her tur sonunda XP ve coin kazanılır; seviye atlanır,
rekorlar tutulur. 12 başarım açılabilir, her biri coin ödüllü. Tüm bunlar
`localStorage` üzerinde çalışır, yani APK çevrimdışıyken de kaydedilir.

## Hesap girişi (Play Games + Google)

İsteğe bağlıdır; giriş yapılmazsa oyun misafir olarak aynı şekilde çalışır.
Giriş yapılınca görünen ad ve profil resmi oda adında kullanılır.

**Android / Play Games:** Google Play Games Services v2 SDK, sessiz oturum ve
oyuncu adı/avatarı sağlar. Uygulama kimliği tanımlı değilse SDK kapanır ve
Google OAuth’a düşer.

**Android / Google OAuth:** Tarayıcı OAuth 2.0 + PKCE akışı yedek olarak kalır.
İstemci kimliği APK’ya `assets/google.txt` olarak gömülür, dönüş şeması
`com.googleusercontent.apps.<kimlik-öneki>:/oauth2redirect` olur.

**Web:** Google Identity Services düğmesi `GET /api/config` ile gelen istemci
kimliğiyle çizilir. `POST /api/auth/google` jetonu sunucuda RS256 imza, `iss`,
`aud` ve `exp` açısından doğrular.

Giriş yapıldığında ad, hesap profilinden **otomatik** gelir; oyuncudan ayrıca
ad yazması istenmez. Adını değiştirmek isteyen, hesap şeridindeki veya oyun içi
menüdeki **Adı değiştir** düğmesini kullanır. Misafirken ad alanının yanındaki
**Giriş yap** düğmesi doğrudan Play Games / Google oturumunu başlatır.

### Adlandırma davranışı

| Durum | Ad alanı | Ad |
|---|---|---|
| Misafir | Görünür | Oyuncunun yazdığı ad |
| Giriş yapılmış | Gizli | Play Games / Google profili |
| "Adı değiştir" | Açılır | Oyuncunun yazdığı ad (cihazda saklanır) |
| Çıkış | Görünür | Son kullanılan ad |

```powershell
# Sunucu: web + Android kimliklerini virgülle ver
$env:GOOGLE_CLIENT_IDS = "WEB_ID.apps.googleusercontent.com,ANDROID_ID.apps.googleusercontent.com"
node server.cjs

# APK: Android kimliği + Play Games kimliğiyle derle
powershell -ExecutionPolicy Bypass -File android\build-apk.ps1 `
  -ServerUrl "https://senin-sunucun" `
  -GoogleAndroidClientId "ANDROID_ID.apps.googleusercontent.com" `
  -GamesAppId 123456789
```

## Reklamlar (AdMob)

- **Geçiş reklamı:** oyun sonucu ekrandan kalkınca, **her turdan sonra** bir kez.
- **Alt banner:** yalnızca oyun ekranındayken, ekranın altında sabit banner.
- **Ödüllü reklam:** sonuç ekranında “Reklam izle, 2× coin” düğmesi.
- **Reklamları kaldır:** tek seferlik uygulama içi satın alma (`remove_ads`).
  Satın alınınca geçiş reklamı ve banner hiç gösterilmez; ödüllü reklam isteğe
  bağlı kalır.
- Varsayılan olarak Google’ın **resmî test kimlikleri** kullanılır. Kalıcı
  kimlikler `android/local.properties` içinde tutulur (sürüm kontrolüne girmez).
- Avrupa/İngiltere için UMP rıza formu otomatik gösterilir.

Tam kurulum (AdMob hesabı, reklam birimleri, Play Games, uygulama içi ürün,
SHA-1, Play Console, veri güvenliği beyanı, mağaza görselleri) için
**`PLAY-STORE.md`** dosyasına bak.

## Arkadaşlar

Üst çubuktaki **arkadaşlar** düğmesi (ses düğmesinin yanında) cihazda kalan bir
arkadaş listesi açar:

- Her oyuncunun 6 haneli bir **arkadaş kodu** vardır; kopyalanıp paylaşılabilir.
- Arkadaş koduyla ekleme; liste çevrimiçi/çevrimdışı durumunu gösterir.
- Liste, arkadaşın **sunucudaki güncel adını** gösterir; arkadaş adını
  değiştirdiğinde ya da yeniden bağlandığında otomatik tazelenir. Çevrimdışıyken
  son bilinen ad korunur.
- **Davet et**: oda varsa kod doğrudan gider; oda yoksa önce rakip odası kurulur.
- Davet alan oyuncunun ekranında “Katıl” şeridi çıkar ve tek dokunuşla odaya girer.

Durum bilgisi sunucuda yalnızca bellekte tutulur; hesap veya veritabanı gerekmez.

## Güvenlik

Sunucu herkese açık çalışacak şekilde sertleştirildi:

- Güvenlik başlıkları ve `Content-Security-Policy` (Google GSI’ya izinli);
- yalnızca `GET`, `HEAD`, `POST` metotları; API için CORS ve `OPTIONS`;
- WebSocket `Origin` doğrulaması (`file://` / APK ve aynı köken kabul, `ORIGINS` ile genişletilir);
- IP başına ve toplam bağlantı sınırı, oda sayısı sınırı;
- dakikada hatalı oda kodu denemesi sınırı;
- kimlik doğrulama gövdesi 16 KB ile sınırlı (413 ile reddedilir);
- WebView’da dosya kaynakları arası erişim kapalı, yalnızca HTTPS/WSS.

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

### Hiç kapanmayan sunucu (7/24)

`node server.cjs` elle çalıştırıldığında terminal kapanınca ya da süreç çökünce
oyun durur. Kalıcı çalıştırmak için iki katman var:

**Windows (tek komut, yönetici gerekmez):**

```powershell
cd blockblast
powershell -ExecutionPolicy Bypass -File install-service.ps1          # kur + başlat
powershell -ExecutionPolicy Bypass -File install-service.ps1 -Status  # durum + sağlık
powershell -ExecutionPolicy Bypass -File install-service.ps1 -Remove  # kaldır
```

Bu komut `server-guard.cjs` bekçisini bir Windows Görevi olarak kaydeder; görev
oturum açılışında ve makine uyandığında kendiliğinden başlar. Bekçi:

- sunucuyu ayrı bir süreçte çalıştırır, çökünce 1 sn'den başlayıp en fazla 30 sn
  bekleyerek yeniden başlatır (çökme döngüsünde makineyi yormaz),
- 15 saniyede bir `/healthz` yoklar; 3 kez üst üste yanıt gelmezse donmuş süreci
  öldürüp temiz başlatır,
- aynı anda iki bekçi çalışmasını `logs/guard.pid` kilidiyle engeller,
- günlüğü `logs/server.log` dosyasına yazar (2 MB'da döndürür).

**Docker (Linux / NAS / VPS):**

```bash
docker compose up -d      # restart: always + healthcheck
docker compose logs -f
```

Bekçiyi doğrudan da çalıştırabilirsin: `npm run guard` (veya `node server-guard.cjs`).

> `logs/` ve `run-server.ps1` sürüm kontrolüne girmez. Görev adı varsayılan
> `BlokIkiServer`; farklı port için `-Port 9000` ver.

## Arkadaşınla oynamak

Oyun iki tarayıcıyı WebSocket üzerinden aynı sunucuya bağlar. Sunucunun internete
açık olması gerekir. Kendi odanı kurup 5 haneli kodu paylaşabilir ya da
**Rastgele eşleş** düğmesiyle aynı anda bekleyen biriyle hemen oynayabilirsin.
Eşleşme kuyruğu sunucuda tutulur; eşleşen iki oyuncu doğrudan rakip modunda
oyuna alınır. Üç pratik yayınlama yolu:

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

Render'ın ücretsiz planı boşta uykuya geçer. Depodaki
`.github/workflows/keepalive.yml` işi, `SUNUCU_URL` sırrı tanımlıysa `/healthz`
adresini 10 dakikada bir dürtükleyerek sunucuyu uyanık tutar (depo → Settings →
Secrets and variables → Actions → `SUNUCU_URL`).

### 3. Kendi sunucun

`node server.cjs` çalıştır, 8080 portunu bir reverse proxy (Caddy / Nginx) arkasına
al ve HTTPS ver. `SSL_KEY` + `SSL_CERT` ortam değişkenleriyle Node doğrudan HTTPS de
başlatabilir:

```bash
SSL_KEY=/etc/ssl/key.pem SSL_CERT=/etc/ssl/cert.pem node server.cjs
```

> Aynı ağda oynuyorsanız internete açmanız gerekmez; yerel IP yeterlidir.

## Nasıl oynanır

1. Ana sayfada **Tek kişilik** kartından tek başına oyna; **Ortak tahta** veya
   **Rakip** kartından aynı cihazda iki kişi oyna.
2. Arkadaşınla oynamak için adını yaz. Hazır bir rakiple eşleşmek için **Rakip bul**'a bas
   ya da modu seçip **Oda kur**. Çıkan 5 haneli kodu arkadaşına gönder.
   Arkadaşın aynı sayfada kodu girip **Katıl** der.
3. Oda sahibi süre modunu seçer ve **Oyunu başlat**'a basar. Rastgele eşleşmede
   oyun kendiliğinden başlar.
4. Blokları tahtaya sürükle. Kısa dokunuşla bloğu seçip tahtadaki bir kareye
   dokunarak da yerleştirebilirsin.
5. Klavyeyle de oynanır: blok üzerinde **Enter** ile seç, **ok tuşlarıyla** gez,
   **Enter** ile bırak, **Esc** ile vazgeç.
6. Tamamlanan her satır/sütun patlar. Üst üste patlatmak combo çarpanını yükseltir.
   Satır + sütunu aynı hamlede patlatırsan **PERFECT!**, iki satırda **GREAT!**
   geri bildirimi ve ekran sarsıntısı gelir.

Puanlama: yerleştirme puan vermez. Yalnızca patlayan çizgiler puan kazandırır —
her satır/sütun 25 puan, aynı hamlede satır + sütun patlarsa ekstra haç bonusu
(90 + 35 × kesişim) gelir ve combo hepsini çarpar.

## Telefona kurma (Android APK)

Derleme Gradle ile yapılır (JDK 17 + Android SDK). Gradle sarmalayıcısı
(`android/gradlew.bat`) depoda hazırdır; ilk derlemede bağımlılıkları indirir.

```powershell
cd blockblast
powershell -ExecutionPolicy Bypass -File android\build-apk.ps1 `
  -ServerUrl "https://senin-sunucun.onrender.com"
```

`-ServerUrl` verilirse adres APK'nın içine gömülür (`assets/server.txt`), arkadaşın
hiçbir ayar yapmadan odaya katılabilir. Adres verilmezse oyun yalnızca tek cihazda
(aynı telefonda iki kişi) oynanır.

Yayın sürümü (kendi imza anahtarınla, telefona kurulabilir):

```powershell
powershell -ExecutionPolicy Bypass -File android\build-apk.ps1 `
  -ServerUrl "https://senin-sunucun.onrender.com" `
  -Release -VersionName "1.8" -VersionCode 10 `
  -GoogleAndroidClientId "ANDROID_ID.apps.googleusercontent.com" `
  -GamesAppId 123456789
```

Çıktı: `android/dist/Blokara-1v1-1.8.apk`. İmza anahtarı `android/release.keystore`
ile imzalanır (dosya `.gitignore` içinde; yedeğini mutlaka al ve güncellemelerde
aynı anahtarı kullan).

Google Play’e yüklenecek **AAB** (önerilen):

```powershell
powershell -ExecutionPolicy Bypass -File android\build-aab.ps1 `
  -ServerUrl "https://senin-sunucun.onrender.com" `
  -VersionName "1.8" -VersionCode 10
```

Çıktı: `android/dist/Blokara-1v1-1.8.aab` (Gradle `bundleRelease`).
Ayrıntılar: `PLAY-STORE.md`.

Kurulum:

```powershell
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
```

APK `file:///android_asset/www/index.html` adresini bir WebView'da açar; yerel oyunlar
tamamen çevrimdışıdır, arkadaşla oyun gömülü sunucu adresini kullanır.

PWA olarak kurmak da mümkün: oyunu HTTPS üzerinden aç, Chrome menüsü →
**Uygulamayı yükle**. Artık tam ekran ve çevrimdışı açılabilir.

## Dosyalar

```
blockblast/
  server.cjs              statik sunucu + sıfır bağımlılıklı WebSocket + odalar
  server-guard.cjs        7/24 bekçi: çöken/donmuş sunucuyu yeniden başlatır
  install-service.ps1     Windows görevi olarak kurar (otomatik başlar)
  docker-compose.yml      Docker ile restart: always + healthcheck
  logs/                   sunucu günlüğü (sürüm kontrolüne girmez)
  public/
    index.html
    styles.css
    app.js                arayüz, sürükle-bırak, oda oturumu, eşleşme, saat
    game-core.js          tahta, bloklar, puanlama, süre, çöp satır, modlar
    progress.js           XP/coin/seviye/başarım (localStorage)
    fx.js                 parçacık, konfeti, sarsıntı, titreşim
    manifest.webmanifest  PWA
    sw.js                 çevrimdışı önbellek
    icons/
  android/
    gradlew.bat           Gradle 8.14.3 sarmalayıcısı
    app/build.gradle.kts  sürüm, AdMob/Play Games kimlikleri, imza
    build-apk.ps1         APK derleme (Gradle)
    build-aab.ps1         AAB (Play) derleme (Gradle)
    app/src/main/java/.../MainActivity.java        WebView + köprüler
    app/src/main/java/.../AdsManager.java          AdMob + UMP rıza
    app/src/main/java/.../BillingManager.java      Play Billing ("reklamları kaldır")
    app/src/main/java/.../PlayGamesManager.java    Play Games oturumu
    drive.cjs             emülatördeki WebView'ı CDP ile sürme aracı
  test/
  package.json
  render.yaml
  PLAY-STORE.md           Google Play yayın rehberi
  DESIGN.md               tasarım kararları ve gerekçeleri
```

Sunucu otoritedir: hamleleri doğrular, tahtaları, blok sırasını ve saatleri kendi tutar.
İstemci sadece `{t:"move", piece, row, col}` gönderir; skor ve süre sunucuda hesaplanır.

## Testler

```bash
npm test                     # hepsini çalıştırır
node test/core-test.cjs      # oyun kuralları, modlar, süre, çöp satır, şekiller (26 test)
node test/socket-test.cjs    # oda/WebSocket, otoriter saat, rastgele eşleşme; sunucuyu 8099'da açar
node --experimental-websocket test/online-flow.cjs   # iki sekmeli uçtan uca akış (44 kontrol)
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
- Android uygulamasında geri tuşu önce açık kartı kapatır, oyunda duraklatma menüsünü
  açar; yalnızca ana sayfadayken uygulamadan çıkar.
- Yerel oyunda (tek kişilik/aynı cihaz) süre, menü açıkken ve uygulama arkadayken durur.
  Çevrimiçi oyunda süre sunucuda işlediği için durmaz.
- Rastgele eşleşme kuyruğu bellekte tutulur; 2 dakika rakip bulunamazsa istek
  zaman aşımına uğrar. Sunucu yeniden başlarsa kuyruk ve odalar silinir.
- Oyun ekranında ekranın kararması engellenir; uygulama öne döndüğünde kopmuş
  çevrimiçi bağlantı kendiliğinden tazelenir.
- Sürüklerken blok parmağın ~36px üstünde durur; parmak bloğu kapatmaz. Dolu ya da
  taşan bir hedefte tahtada önizleme binmez, blok kırmızı çerçeveyle uyarır ve
  bırakınca yerleşmez.
