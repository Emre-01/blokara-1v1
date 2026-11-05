# Google Play yayın rehberi — Blokara 1v1

Bu dosya, uygulamayı Google Play’e yüklemek için gereken adımları ve
depodaki hazırlıkları özetler.

> Oyunun görünen adı yayından önce değişecek olsa da **paket adı
> `tr.blokiki.app` kalmalıdır**. Paket adı değişirse mevcut kurulumlar ve
> imza/Play kaydı bozulur.

---

## 1. Hazır olanlar

> Mağaza metinleri, veri güvenliği ve derecelendirme cevapları için
> `store/PLAY-LISTING.md` dosyasına bakın.

| Gereksinim | Durum |
|---|---|
| Paket adı | `tr.blokiki.app` (değiştirilmemeli) |
| Sürüm | `versionName 2.1.0`, `versionCode 22` |
| Hedef API | 36 (Android 16) — Play’in 2026 gereksinimi |
| Min API | 23 (Android 6.0) |
| Derleme | Gradle 8.14.3 + Android Gradle Plugin 8.12.3, JDK 17 |
| Release imzası | `android/release.keystore` (Gradle `signingConfigs`) |
| Hata ayıklama kapalı | Release derlemesinde `debuggable="false"` |
| Düz HTTP kapalı | Release derlemesinde `usesCleartextTraffic="false"` |
| 64-bit | Yerel kütüphane yok; tüm cihazlarla uyumlu |
| Gizlilik politikası | `public/privacy.html` |
| Hesap girişi | Google Play Games (Android) + Google OAuth (web/yedek) |
| Reklam | AdMob: geçiş + ödüllü + alt banner (varsayılan: resmî test kimlikleri) |
| Sunucu güvenliği | CSP, güvenlik başlıkları, Origin kontrolü, bağlantı/oda sınırları, giriş denemesi sınırı |
| Güncelleme | HTML/JS/CSS `no-cache`; servis çalışanı sürümü `blok-iki-v18` |
| WebView güvenliği | Dosya/content erişimi kapalı, karışık içerik release'te engelli, dış linkler şema denetiminden geçer |

---

## 2. İmza anahtarı (en kritik adım)

Play Console’a yüklenen her sürüm **aynı** anahtarla imzalanmalıdır. Anahtarı
kaybederseniz uygulamayı bir daha güncelleyemezsiniz.

```powershell
# 1) Anahtarı ve parolayı güvenli bir yere yedekleyin (bulut + fiziksel disk).
Copy-Item android\release.keystore "$env:USERPROFILE\Desktop\blok-iki-YEDEK.keystore"

# 2) Parmak izlerini not edin (Play Console, Play Games ve Google OAuth için gerekir).
keytool -list -v -keystore android\release.keystore -alias blokiki
```

- Yerel varsayılan parola: `blokiki-release` (alias `blokiki`).
- Kalıcı parolaları `android/local.properties` içinde veya ortam
  değişkenlerinde tutun (dosya sürüm kontrolüne girmez):

```properties
blokiki.storePass=guclu-parola
blokiki.keyPass=guclu-parola
blokiki.keyAlias=blokiki
```

- `*.keystore` `.gitignore` içindedir; anahtar depoya eklenmez.
- Play Console’da **Play App Signing**’i açın. Google, uygulama imzalama
  anahtarını kendisi yönetir; siz yalnızca “upload key” ile yüklersiniz.
  Google’ın uygulama imzalama sertifikasının SHA-1’ini de Google OAuth ve
  Play Games ayarlarına eklemeyi unutmayın.

---

## 3. Google Play Games kurulumu (önerilen giriş)

Play Games, oyuncunun Play profil adını ve avatarını getirir. Play Games
tanımlı değilse uygulama otomatik olarak Google OAuth’a düşer.

### a) Play Console’da oyun hizmetini açın

1. Play Console → uygulamanız → **Play Games Services → Setup and management → Configuration**.
2. Oyun adını ve kategorisini girin, şartları kabul edin.
3. **Credentials** bölümünde **Add credential → Android** seçin.
4. **Package name:** `tr.blokiki.app`
5. **SHA-1:** yukarıdaki `keytool` çıktısındaki **upload** SHA-1’i. Play App
   Signing kullanıyorsanız Google’ın **app signing** SHA-1’ini de ikinci bir
   credential olarak ekleyin.
6. Kaydettikten sonra size **Application ID** (ör. `123456789`) verilir.

### b) Uygulamaya kimliği verin

`android/local.properties` içine yazın:

```properties
blokiki.gamesAppId=123456789
```

veya derleme komutuna `-GamesAppId 123456789` ekleyin. Kimlik `0`/boşsa Play
Games SDK başlatılmaz; hesap şeridi Google OAuth düğmesini gösterir.

### c) Test kullanıcıları

Play Console → Play Games Services → **Testers** bölümüne kendi Play
hesabınızı ve test edecek kişileri ekleyin. Aksi halde giriş penceresi
“hesap yetkili değil” diyebilir.

> Not: Play Games girişi yalnızca Play Store’dan kurulmuş imzalı sürümde
> tam çalışır. Emülatörde Google Play Hizmetleri varsa ve cihaz hesabı test
> kullanıcısıysa çalışır; yoksa uygulama Google OAuth’a düşer.

---

## 4. AdMob kurulumu

### a) Hesap açma

1. <https://admob.google.com> → **Sign up**.
2. Google hesabınızla girin; ülke, para birimi ve vergi bilgilerini doldurun.
3. **Ödeme** bölümünden adres/ödeme yöntemini tamamlayın (reklam geliri için
   zorunlu).

### b) Uygulamayı ekleme

1. AdMob → **Apps → Add app**.
2. Platform: **Android**. Uygulama Play’de yayındaysa “Yes, it’s listed on a
   store” seçip `tr.blokiki.app` ile eşleştirin. Yayında değilse “No” seçin.
3. Uygulama adını girin (yayın adı ne olacaksa onu kullanın).
4. Size **App ID** verilir: `ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY`.

### c) Reklam birimleri

**Ad units → Add ad unit** ile üç birim oluşturun:

| Tür | Önerilen ad | Kullanım |
|---|---|---|
| Interstitial | `Blokara 1v1 - Gecis` | Oyun sonucu kapandıktan sonra her turda bir |
| Rewarded | `Blokara 1v1 - Odullu` | Sonuç ekranında “Reklam izle, 2× coin” |
| Banner | `Blokara 1v1 - Alt Banner` | Oyun ekranının altında, oyun sırasında |

Her birim için `ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ` biçiminde bir kimlik
alırsınız.

### d) Kimlikleri uygulamaya verme

`android/local.properties` dosyasına ekleyin:

```properties
blokiki.admobAppId=ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY
blokiki.admobInterstitial=ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ
blokiki.admobRewarded=ca-app-pub-XXXXXXXXXXXXXXXX/WWWWWWWWWW
blokiki.admobBanner=ca-app-pub-XXXXXXXXXXXXXXXX/VVVVVVVVVV
```

Bu dosya sürüm kontrolüne girmez. Kimlik verilmezse Google’ın **resmî test
kimlikleri** kullanılır; test reklamları Play politikasına uygundur ve
yanlışlıkla kendi reklamınıza tıklama riski oluşturmaz.

> **Kendi reklamlarınıza asla tıklamayın.** Geliştirme sırasında mutlaka test
> kimlikleriyle çalışın; aksi halde AdMob hesabı askıya alınabilir.

### e) app-ads.txt (yayın sonrası)

1. Play mağaza kaydındaki **website** alanına kendi alan adınızı girin
   (ör. `https://SUNUCU`).
2. AdMob → **Apps → app-ads.txt** bölümündeki satırı kopyalayın.
3. Bu satırı alan adının kökünde `https://ALANADINIZ/app-ads.txt` olarak
   yayınlayın.

### f) Rıza (UMP)

Uygulama, Avrupa/İngiltere kullanıcıları için Google’ın UMP rıza formunu
otomatik gösterir. AdMob → **Privacy & messaging** bölümünde bir mesaj
oluşturup yayınlayın; aksi halde form gösterilmez ve kişiselleştirilmiş
reklamlar sınırlanır.

---

## 5. Reklamları kaldır (uygulama içi satın alma)

Tek seferlik, tüketilmeyen bir ürün kullanılır. Ürün kimliği varsayılan olarak
`remove_ads`; gerekirse `blokiki.removeAdsProduct` ile değiştirilebilir.

### a) Play Console'da ürün oluşturma

1. Play Console → uygulama → **Monetize → Products → In-app products**.
2. **Create product**:
   - Product ID: `remove_ads` (kodda beklenen kimlik)
   - Name: `Reklamları kaldır`
   - Description: `Oyun sonu geçiş reklamlarını ve alt banner'ı kalıcı olarak kapatır.`
   - Price: istediğiniz fiyat (ör. ₺29,99)
3. Ürünü **Active** yapın.
4. Test için: **License testing** listesine kendi hesabınızı ekleyin; test
   satın almaları ücretsizdir ve kart bilgisi istemez.
5. Uygulamanın imzalı AAB'sini **Internal testing** kanalına yükleyin; ürün
   yalnızca Play'de yayınlanmış bir sürümle test edilebilir.

### b) Davranış

- Satın alma başarılı olunca onaylanır (acknowledge) ve cihazda saklanır.
- Uygulama açılışında Play’den satın alma durumu doğrulanır.
- Reklamlar kaldırıldıysa geçiş reklamı ve alt banner **hiç gösterilmez**;
  ödüllü reklam kullanıcı isterse çalışmaya devam eder.
- Satın alma cihazda `blokara_billing` tercihlerinde tutulur; kullanıcı aynı
  Play hesabıyla başka cihazda da sahipliği alır (Play doğrulaması).

### c) Kimliği değiştirme

```properties
blokiki.removeAdsProduct=remove_ads
```

---

## 6. Google OAuth kurulumu (web + yedek giriş)

İki ayrı OAuth istemcisi gerekir (Google Cloud Console → APIs & Services →
Credentials):

### a) Web istemcisi (tarayıcı sürümü)

1. **Create credentials → OAuth client ID → Web application**
2. **Authorized JavaScript origins:** oyunun yayınlandığı adres
   (örn. `https://blok-iki.onrender.com`). `localhost` geliştirme içindir.
3. İstemci kimliğini sunucuya verin:

```powershell
$env:GOOGLE_CLIENT_IDS = "1234567890-web.apps.googleusercontent.com"
node server.cjs
```

### b) Android istemcisi (APK)

1. **Create credentials → OAuth client ID → Android**
2. **Package name:** `tr.blokiki.app`
3. **SHA-1:** yukarıdaki release SHA-1’i; Play App Signing varsa Google’ın
   uygulama imzalama SHA-1’ini de ayrı bir istemci olarak ekleyin.
4. APK’yı bu kimlikle derleyin:

```powershell
powershell -ExecutionPolicy Bypass -File android\build-apk.ps1 `
  -Release `
  -ServerUrl "https://SUNUCU-ADRESI" `
  -GoogleAndroidClientId "1234567890-android.apps.googleusercontent.com" `
  -GamesAppId 123456789
```

> Play Games ve Android OAuth istemcisi yoksa uygulama sorunsuz çalışır;
> hesap şeridi yalnızca web girişini gösterir veya kapalı kalır.

### c) Sunucu tarafı doğrulama

Sunucu, gelen `id_token`’ı Google’ın açık anahtarlarıyla (JWKS) doğrular:
imza, `iss`, `aud` ve `exp`. `aud` için web ve Android kimliklerinin ikisini
birden kabul etmek üzere virgülle verin:

```powershell
$env:GOOGLE_CLIENT_IDS = "WEB_ID.apps.googleusercontent.com,ANDROID_ID.apps.googleusercontent.com"
```

---

## 7. Sunucu ortam değişkenleri

| Değişken | Açıklama |
|---|---|
| `PORT` | Varsayılan `8080` |
| `HOST` | Varsayılan `0.0.0.0` |
| `GOOGLE_CLIENT_IDS` | Virgülle web/Android istemci kimlikleri |
| `ORIGINS` | Ek izinli WebSocket kaynakları (virgülle) |
| `MAX_ROOMS` | Varsayılan 400 |
| `MAX_CONNECTIONS` | Varsayılan 600 |
| `MAX_CONNECTIONS_PER_IP` | Varsayılan 6 |
| `JOIN_FAIL_LIMIT` | 1 dakikada hatalı oda kodu sınırı (12) |
| `SSL_KEY` / `SSL_CERT` | Doğrudan HTTPS için sertifika yolları |

> Cloudflare tüneli yalnızca test içindir. Play’e çıkmadan önce kalıcı bir
> barındırma (Render, Railway, Fly.io, VPS) kullanın; tünel kapanınca
> arkadaşla oyun modu çalışmaz.

---

## 8. Play Console'a yükleme

1. **Uygulama oluştur:** yayın adı ne olacaksa onu girin, varsayılan dil
   Türkçe, oyun kategorisi.
2. **Uygulama içeriği** formlarını doldurun:
   - Gizlilik politikası URL’si: `https://SUNUCU/privacy.html`
   - Veri güvenliği: aşağıdaki tabloyu kullanın.
   - Reklam: **evet** (reklam içeriyor).
   - Uygulama içi satın alma: **evet** (`remove_ads`, reklamları kaldırma).
   - Yaş derecelendirmesi: şiddet/içerik yok → genellikle 3+ / Herkes.
3. **Kapalı test** kanalına AAB yükleyin (yeni hesaplar için genellikle en az
   12 test kullanıcısı ve 14 gün gerekir).
4. **Mağaza girişi** için ekran görüntüleri, açıklama ve simge ekleyin.

### Veri güvenliği beyanı (önerilen yanıtlar)

| Soru | Yanıt |
|---|---|
| Kişisel bilgi topluyor mu? | Evet — ad, isteğe bağlı Google/Play Games profil bilgisi |
| Veriler paylaşılıyor mu? | Evet — reklam hizmeti (Google AdMob) ile |
| Veriler şifreli iletilir mi? | Evet (HTTPS/WSS) |
| Kullanıcı silme talep edebilir mi? | Evet — uygulama içi “Çıkış yap” ve destek e-postası |
| Veriler reklam için kullanılıyor mu? | Evet — reklam kimliği ve reklam etkileşimi |
| Toplanan veri türleri | Ad, uygulama içi ilerleme, cihazda saklanan tercihler, **reklam kimliği** |
| Veri türü: Cihaz veya diğer kimlikler | Evet — reklam kimliği (AD_ID) |

> Uygulama `com.google.android.gms.permission.AD_ID` iznini kullanır. Play
> Console veri güvenliği formunda **Reklam kimliği** seçeneğini işaretleyin.
> Ayrıca “Uygulama içeriği → Reklamlar” bölümünde reklam içerdiğini belirtin.

### Mağaza metni önerisi

> **Kısa açıklama:** Arkadaşınla aynı tahtada ya da rakip olarak blok diz.
>
> **Tam açıklama:** Blokara 1v1, iki kişilik bir blok yerleştirme oyunudur.
> Aynı telefonda sırayla oynayın veya oda koduyla arkadaşlarınıza bağlanın.
> Ortak tahtada birlikte hayatta kalın, rakip modunda birbirinizi geçin.
> Play Games ile giriş yaparak adınızı kaydedin.

### Gerekli görseller

| Görsel | Boyut |
|---|---|
| Uygulama simgesi | 512×512 PNG (şeffaflık yok) |
| Öne çıkan görsel | 1024×500 PNG/JPG |
| Telefon ekran görüntüsü | En az 2 adet, 1080×1920 veya benzeri |
| Tablet ekran görüntüsü | İsteğe bağlı (önerilir) |

Ekran görüntülerini emülatörden alabilirsiniz:

```powershell
adb exec-out screencap -p > ekran-1.png
```

---

## 9. Yayın öncesi son kontrol listesi

- [ ] `release.keystore` yedeklendi, parola güvenli yerde
- [ ] Play App Signing açıldı, upload key yüklendi
- [ ] `GOOGLE_CLIENT_IDS` sunucuda tanımlı
- [ ] Google Cloud’da web + Android OAuth istemcileri ve SHA-1’ler doğru
- [ ] Play Games uygulama kimliği (`blokiki.gamesAppId`) tanımlı
- [ ] Play Games test kullanıcıları eklendi
- [ ] AdMob uygulama kimliği ve üç reklam birimi tanımlı
- [ ] AdMob test kimlikleriyle reklamlar denendi
- [ ] UMP mesajı AdMob panelinde yayınlandı
- [ ] `remove_ads` ürünü Play Console’da aktif ve fiyatı girildi
- [ ] Lisans testi hesabı eklendi, test satın alması yapıldı
- [ ] Satın alma sonrası geçiş reklamı ve alt banner çıkmıyor
- [ ] `app-ads.txt` alan adında yayında
- [ ] Sunucu HTTPS üzerinden erişilebilir (`/healthz` → `ok`)
- [ ] `privacy.html` yayında ve iletişim e-postası gerçek
- [ ] Release AAB `debuggable=false`, `usesCleartextTraffic=false`
- [ ] WebView'da dosya/content erişimi kapalı ve karışık içerik engelli (release)
- [ ] Dış bağlantılar yalnızca http/https/mailto/tel şemalarıyla açılıyor
- [ ] `versionCode` bir önceki yüklemeden büyük
- [ ] Mağaza görselleri ve açıklama hazır
- [ ] Kapalı testte gerçek cihazda oda oyunu, Play Games girişi ve reklamlar denendi

---

## 10. Release derleme

### a) Play’e yüklenecek AAB (önerilen)

```powershell
powershell -ExecutionPolicy Bypass -File android\build-aab.ps1 `
  -ServerUrl "https://SUNUCU-ADRESI" `
  -GoogleAndroidClientId "ANDROID_ID.apps.googleusercontent.com" `
  -GamesAppId 123456789 `
  -VersionName "2.1.0" -VersionCode 22
```

Çıktı: `android/dist/Blokara-1v1-2.1.0.aab` (Gradle `bundleRelease`, release
anahtarıyla imzalı). Google Play yeni uygulamalarda **AAB** ister.

### b) Doğrudan kurulacak APK (arkadaş/test)

```powershell
# Geliştirme / emülatör
powershell -ExecutionPolicy Bypass -File android\build-apk.ps1 `
  -ServerUrl "http://10.0.2.2:8080"

# Release APK
powershell -ExecutionPolicy Bypass -File android\build-apk.ps1 `
  -Release `
  -ServerUrl "https://SUNUCU-ADRESI" `
  -GoogleAndroidClientId "ANDROID_ID.apps.googleusercontent.com" `
  -GamesAppId 123456789 `
  -VersionName "2.1.0" -VersionCode 22
```

Çıktı: `android/dist/Blokara-1v1-2.1.0.apk`

### c) Doğrudan Gradle

```powershell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.17.10-hotspot"
cd android
.\gradlew.bat :app:assembleDebug "-Pblokiki.serverUrl=http://10.0.2.2:8080"
.\gradlew.bat :app:bundleRelease
```

Gradle çıktıları:

- `android/app/build/outputs/apk/debug/app-debug.apk`
- `android/app/build/outputs/apk/release/app-release.apk`
- `android/app/build/outputs/bundle/release/app-release.aab`

### Doğrulama

```powershell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.17.10-hotspot"
& "$env:LOCALAPPDATA\Android\Sdk\build-tools\36.1.0\apksigner.bat" verify --print-certs android\dist\Blokara-1v1-2.1.0.apk
```

AAB içindeki manifesti görmek için Android Studio’nun **Build → Analyze APK**
aracını veya Play Console’un yükleme doğrulamasını kullanın.

### Reklamların test edilmesi

1. Test kimlikleriyle derleyin (varsayılan).
2. Emülatörde/cihazda bir tur bitirin, sonuç ekranını kapatın.
3. Logcat’te `BlokAds` etiketini izleyin:

```powershell
adb logcat -s BlokAds BlokPlayGames
```

4. İkinci tur sonunda geçiş reklamı, oyun sırasında ekranın altında banner,
   sonuç ekranındaki düğmeyle ödüllü reklam açılmalı. Reklam yoksa
   `adb logcat` çıktısındaki hata mesajına bakın
   (cihazda internet/Play Hizmetleri ve doğru App ID gerekir).
