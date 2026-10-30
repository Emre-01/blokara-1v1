# Blok İki

Block Blast'ın iki kişilik, tarayıcı tabanlı yorumu. Tek kurulumla hem aynı cihazda
hem de oda koduyla uzaktan oynanır. Telefona Android uygulaması gibi kurulabilir (PWA).

## İki mod

**Ortak tahta** — Tek 8×8 tahta, tek ortak skor. Oyuncular sırayla blok yerleştirir.
Her oyuncunun katkısı ayrı sayılır. Tahta tıkanınca tur biter.

**Rakip** — Her oyuncunun kendi tahtası vardır ama iki taraf da **aynı blok sırasını**
alır. Tahtası dolan oyuncu kaybeder. Online modda iki oyuncu aynı anda oynar.

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

1. Ana sayfada **Aynı cihazda oyna** ile hemen başla.
2. Uzaktan için adını yaz, modu seç, **Oda kur**. Çıkan 5 haneli kodu arkadaşına
   gönder. Arkadaşın aynı sayfada kodu girip **Odaya katıl** der.
3. Oda sahibi **Oyunu başlat**'a basar.
4. Blokları tahtaya sürükle. Kısa dokunuşla bloğu seçip tahtadaki bir kareye
   dokunarak da yerleştirebilirsin.
5. Klavyeyle de oynanır: blok üzerinde **Enter** ile seç, **ok tuşlarıyla** gez,
   **Enter** ile bırak, **Esc** ile vazgeç.
6. Tamamlanan her satır/sütun patlar. Üst üste patlatmak combo çarpanını yükseltir.

Puanlama: yerleşen her blok için 1 puan; patlayan her satır için `10 × satır × combo`.
Combo, art arda patlayan hamlelerde büyür, patlamayan hamlede sıfırlanır.

## Telefona kurma (Android)

1. Oyunu HTTPS üzerinden aç (Render/tünel adresi ya da kendi alan adın).
2. Chrome menüsü → **Uygulamayı yükle** / **Ana ekrana ekle**.
3. Artık tam ekran, çevrimdışı açılabilen bir uygulama olarak çalışır.
   Yerel oyunlar internet olmadan da oynanır; online mod sunucu ister.

APK olarak paketlemek istersen Capacitor ile sarmalayabilirsin:

```bash
npm i -D @capacitor/cli @capacitor/core
npx cap init "Blok İki" com.ornek.blokiki --web-dir=public
npm i @capacitor/android
npx cap add android
npx cap sync android
```

Uygulama içinden online oynanacaksa `public/app.js` içindeki bağlantı adresini
(`wsUrl`) kendi HTTPS sunucuna yönlendir veya WebView'a sunucu adresini yükle.

## Dosyalar

```
blockblast/
  server.cjs              statik sunucu + sıfır bağımlılıklı WebSocket + odalar
  public/
    index.html
    styles.css
    app.js                arayüz, sürükle-bırak, online oturum
    game-core.js          tahta, bloklar, puanlama (tarayıcı + Node ortak)
    manifest.webmanifest  PWA
    sw.js                 çevrimdışı önbellek
    icons/
  package.json
  render.yaml
```

Sunucu otoritedir: hamleleri doğrular, tahtaları ve blok sırasını kendi tutar.
İstemci sadece `{t:"move", piece, row, col}` gönderir; skor sunucuda hesaplanır.

## Testler

```bash
npm test            # ikisini birlikte çalıştırır
node test/core-test.cjs    # oyun kuralları ve puanlama (14 test)
node test/socket-test.cjs  # oda/WebSocket akışı; kendi sunucusunu 8099'da açar
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
