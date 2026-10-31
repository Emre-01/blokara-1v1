# Blok İki 2.0 — Tasarım Notları

Bu belge, oyunu "tek oyunluk deneme"den "her gün açılan" bir oyuna çevirmek için
yapılan kararları ve gerekçelerini toplar. Uygulama sırası da bu belgedeki sıradır.

## Araştırmadan çıkan ilkeler

Block Blast'ın (Hungry Studio, 40M+ günlük oyuncu) yapısını inceleyen analizler ve
casual puzzle tasarım yazılarından çıkan ortak noktalar:

1. **Oturum kısa, sonu net.** 1–3 dakikalık turlar; oyuncu kaybetse de "bir daha" der.
2. **Anlık geri bildirim (juice).** Gecikmesiz yerleşme, hızlı çözülen animasyon,
   parçacık/patlama, ses, titreşim. "Hız" değil "temizlik" önemli.
3. **Dinamik zorluk.** Blok dağıtımı oyuncunun durumuna göre yumuşar/sertleşir.
   (Bunu kopyalamıyoruz; adil ve şeffaf kalacağız. "Şans" değil "beceri" hissi.)
4. **Kaybetme korkusu.** Seri (streak), günlük hedef, rekor. Bunlar geri dönüş sebebi.
5. **Kısa vadeli ödül + uzun vadeli ilerleme.** Coin/XP + seviye + başarımlar.
6. **Sosyal kanıt.** "Rekorunu geçtin", "oyuncuların %X'ini geçtin".
7. **Bırakıp dönme kolaylığı.** Yarıda bırakınca ceza yok; tek dokunuşla devam.

Kaynak notları: The Experimentation Group (dinamik zorluk, APS), Balancy (Block Blast
deconstruction: win-streak, social proof, god mode), Turbine Games (D60 %28),
FriendlyGameDev (üç oyun çekirdeği: skor, macera, gizli tetris).

## Bu oyuna özgü karar: "iki kişilik" kimliğini koru

Block Blast tek kişilik. Bizim farkımız iki kişilik olması. Bu yüzden:

- Tek kişilik mod **giriş kapısı** (APK'yı kuran hemen oynayabilsin).
- **Ortak tahta** = omuz omuza, "birlikte hayatta kalma" gerilimi.
- **Rakip** = baskı (garbage), aynı blok sırası, karşılıklı sabotaj.
- **Bot** = tek başına rakip modunu da oynanabilir kılar (APK tek başına açılırsa ölü kalmasın).

## Uygulanan sistemler

### 1. Süre + ödül + ceza
Üç sayaç modu (her iki oyun modunda da seçilebilir):

| Mod | Davranış |
|---|---|
| **Ortak sayaç** | Tek sayaç, varsayılan 2:00. Satır patlatınca süre kazanılır. Süre bitince yüksek puan kazanır. |
| **Sıra başına** | Her oyuncuya 30 sn. Hamle yapınca yenilenir. Süresi dolan **−15 puan** ceza alır ve sıra geçer. |
| **Süresiz** | Klasik sonsuz mod. |

Ödül: patlayan satır başına **+2 sn**, combo arttıkça satır başına ek **+0,75 sn**.
Ceza: sıra sayacı biterse −15 puan + sıra kaybı; ortak sayaçta süre biterse tur biter.

### 1b. Puanlama
Blok yerleştirmek **puan vermez**. Puan yalnızca patlayan çizgilerden gelir:

- Patlayan her satır veya sütun: **25 puan**.
- Aynı hamlede hem satır hem sütun patlarsa ek olarak **haç bonusu**: +90 puan,
  ayrıca kesişen her satır×sütun çifti için +35 puan.
- Combo (üst üste patlatma) tüm puanı çarpar: 1. patlama ×1, 2. ×2, 3. ×3…

Örnek: tek satır 25, iki satır 50, satır+sütun (haç) 175; combo ×2 ile haç 350.
Katsayılar `game-core.js` içinde `LINE_POINTS`, `CROSS_BONUS`, `CROSS_POINTS` olarak durur.

### 2. Juice (oyun hissi)
- Patlayan her hücre için parçacık (canvas, tek katman).
- Patlama noktasında yüzen puan yazısı (`+24`, `+36`).
- 2+ satırda ekran sarsıntısı; 3+ satırda konfeti.
- Combo bandı: "COMBO ×3" ölçeklenerek girer.
- Yerleşme: blok "pop" + hafif titreşim; patlama: artan perdeli ses.
- Sonsuz döngü yok: her animasyon ≤ 500 ms, oyuncuyu bekletmez.

### 3. Profil, XP, coin, seviye
Yerel (localStorage). Sunucu gerekmez, çevrimdışı çalışır.
- Oyun sonunda: puan → XP ve coin.
- Seviye eğrisi: `seviye n için 80·n^1.18` XP (erken seviyeler hızlı, sonra yavaşlar).
- Coin: puan/40 + satır×2 + galibiyet bonusu + günlük bonus.
- Rekor: mod başına (bot, ortak, rakip, günlük).

### 4. Günün Tahtası (daily challenge)
- Tarihten türetilen sabit tohum → herkes aynı blok sırasını alır.
- Günde bir kez puanlanır (tekrar oynanır ama rekor sayılmaz).
- 7 günlük şerit görünür; gün atlanırsa seri sıfırlanır (kaybetme korkusu).
- Ödül: 20 coin + puan/50, seri arttıkça bonus.

### 5. Başarımlar
12 başarım, her biri ilerleme çubuğu ve coin ödülüyle. Kilit açılınca sonuç ekranında
şerit, konfeti ve ödül sesi. Liste: İlk Adım, Satır Ustası (50), Tahta Temizleyici (250),
Combo Kralı (×3), Zincir Tepkimesi (×5), Rakip Korkusu (5 galibiyet), Seri Galip (3 seri),
Binlik, Üç Bin, Sadık Oyuncu (3 gün), Haftalık Ritüel (7 gün), Blok Terzisi (500 blok).

### 6. Güçlendiriciler — sonraki sürüm
Bomba / çekiç / karıştır fikri tasarlandı ama **bu sürümde yok**. Profil ve coin altyapısı
hazır olduğu için sonraki adımda eklenebilir; eklendiğinde online'da sunucu doğrulaması
gerekir. Bu sürümde coin yalnızca başarım ve tur ödülü olarak birikiyor.

### 7. Rakip baskısı (versus)
Aynı hamlede 2 satır → rakibe **1 çöp satır**, 3+ satır → **2 çöp satır**.
Çöp satır 2 deliklidir (temizlenebilir), alttan yukarı itilir. Rakip hamle yapmadan
önce uygulanır ve uyarı şeridi olarak görünür. Üst satır doluyken çöp gelirse oyuncu kaybeder.

### 8. Bot
Tek başına rakip modu. Zorluk: kolay / orta / zor.
Sezgisel: satır patlatmayı, kompakt yerleşimi ve kenar kullanımını ödüllendirir;
delik (üstü kapalı boşluk) ve pürüzlülüğü cezalandırır. Zorluk, en iyi hamleler
arasından seçim yüzdesini belirler.

### 9. Sonuç ekranı
Büyük puan, rekor kutlaması, XP/coin kazanımı, kazanılan başarımlar, günlük durumu,
tek dokunuşla "Tekrar" ve "Ana menü". Sonuç ekranı kapatılabilir (yarıda bırakma cezası yok).

### 10. Ayarlar
Ses, titreşim, varsayılan süre modu, ilerlemeyi sıfırla.

### 11. Paketleme (APK)
Gradle'sız derleme: `android/build-apk.ps1` aapt2 → javac → d8 → zipalign → apksigner
zincirini doğrudan çalıştırır. Web varlıkları `assets/www` altına kopyalanır, `-ServerUrl`
parametresi verilirse yayınlanan sunucu adresi `assets/server.txt` olarak gömülür.
WebView `file:///android_asset/www/index.html` açar; uzaktan oyun için gömülü adres,
yerel oyunlar için hiçbir şey gerekmez.

## Uygulanmayanlar (bilinçli)
- Reklam / IAP: yok. Oyun ücretsiz ve temiz kalacak.
- Enerji / can sistemi: yok. "İstediğin kadar oyna" ilkesi korunuyor.
- Yapay zorluk (kasıtlı ölümcül blok): yok. Bloklar adil ve tohumla tekrarlanabilir.
- Hesap / bulut kayıt: yerel profil yeterli; online oda zaten sunucuda.

## Teknik sınırlar
- Sunucu otoriter: süre, hamle, güçlendirici ve baskı sunucuda hesaplanır.
- Çekirdek (`game-core.js`) tarayıcı + Node ortak; tek kişilik, ortak ve rakip aynı motoru kullanır.
- Profil tamamen istemcide; online oyunda sunucuya gönderilmez (mahremiyet + basitlik).
