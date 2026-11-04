# Google Play Console — hazır bilgiler (Blokara 1v1)

Bu dosya Play Console'a **kopyala-yapıştır** yapılacak metinleri ve form
cevaplarını içerir. Sürüm: `2.0.4` (`versionCode 16`).

| Alan | Değer |
|---|---|
| Paket adı | `tr.blokiki.app` |
| Varsayılan dil | Türkçe (tr-TR) |
| Kategori | Bulmaca (Puzzle) |
| Etiketler | blok, bulmaca, 1v1, arkadaşla oyna, sıra tabanlı |
| Ücret | Ücretsiz (reklam içerir, uygulama içi satın alma var) |
| Yaş aralığı | 3+ (şiddet/uygunsuz içerik yok) |
| Destek e-postası | emredincel01@gmail.com |
| Gizlilik politikası | `https://SUNUCU/privacy.html` (SUNUCU = kalıcı sunucu adresi) |

---

## 1. Mağaza kaydı (Store listing)

**Uygulama adı (30 karakter):**

```
Blokara 1v1
```

**Kısa açıklama (80 karakter):**

```
Blok patlat, satır patlat: tek başına rekor kır ya da arkadaşınla kapış.
```

**Tam açıklama (4000 karakter sınırı — bu metin ~900):**

```
Blokara 1v1, klasik blok yerleştirme oyununu arkadaşlarınla kapışmaya çevirir.
Blokları tahtaya sürükle, satırları ve sütunları patlat, combo yap. Ama dikkat:
tahta tıkanırsa oyun biter.

ÜÇ MOD

• Tek kişilik — Kendi tahtanda, kendi hızında oyna. Rekorunu kır, seviye atla,
  başarımları topla.
• Ortak tahta — İki oyuncu, tek tahta, tek skor. Aynı telefonu elden ele verin;
  sırayla blok koyup satırları birlikte patlatın. Ne kadar dayanırsınız?
• Rakip — Herkesin kendi tahtası, blok dizisi aynı. İlk tıkanan kaybeder.

ARKADAŞINLA OYNA

Oda kur ve 5 haneli kodu paylaş, arkadaşın koda katılsın. Ya da "Rastgele
eşleş" ile aynı anda bekleyen biriyle hemen rakip ol. İnternet bağlantısı
yeterli; hesap açmak zorunlu değil.

SENİ BEKLEYENLER

• Combo, perfect (satır + sütun) ve seri patlatma ödülleri
• Seviye, XP, coin ve 10 başarım
• Konfeti, şok dalgası ve ses efektleriyle canlı geri bildirim
• 70'ten fazla dil — cihaz dilini otomatik algılar
• Reklamsız oynamak için tek seferlik "reklamları kaldır" seçeneği

NASIL OYNANIR

Blokları tahtadaki boş alanlara sürükle. Bir satırı ya da sütunu tamamen
doldurduğunda patlar ve yer açılır. Yerleştirecek blok kalmadığında oyun
biter. Sıra tabanlı modlarda süre dolmadan hamleni yap.

Blokara 1v1 ücretsizdir. Reklamları kaldırmak istersen uygulama içinden tek
seferlik satın alma yapabilirsin.

Gizlilik: https://SUNUCU/privacy.html
Destek: emredincel01@gmail.com
```

**Görseller (hazır, `store/` klasöründe):**

| Varlık | Dosya | Boyut |
|---|---|---|
| Uygulama simgesi | `store/play-icon-512.png` | 512×512 |
| Öne çıkan grafik | `store/play-feature-1024x500.png` | 1024×500 |
| Telefon ekran görüntüleri | `store/screens/tr/01…06.png` | 1080×1920 |
| Uyarlanabilir simge katmanı | `store/icon-foreground-512.png` | 512×512 |

Ekran görüntüsü sırası: ana ekran → tek kişilik → rakip → oda kodu →
ortak tahta → sonuç.

---

## 2. Veri güvenliği formu (Data safety)

Uygulama veri topluyor: **Evet**. Veriler aktarım sırasında şifreleniyor:
**Evet**. Kullanıcı silme talebi: **Evet** (e-posta ile).

| Veri türü | Toplanır | Paylaşılır | Amaç | Zorunlu |
|---|---|---|---|---|
| Ad (takma ad) | Evet | Hayır | Uygulama işlevi (odaya katılanlar görür) | Hayır |
| Kullanıcı kimliği (Google/Play Games) | Evet | Hayır | Hesap yönetimi, reklamsız sürümün tanınması | Hayır |
| Oyun içi ilerleme (XP, coin, başarım) | Evet | Hayır | Uygulama işlevi | Hayır |
| Uygulama etkileşimleri (oda kodu, mod, tahta durumu) | Evet | Hayır | Uygulama işlevi, çok oyunculu oturum | Hayır |
| Tanılama / çökme | Hayır | — | — | — |
| Konum, kişiler, fotoğraf, finans | Hayır | — | — | — |

**Reklam:** Uygulama Google AdMob reklamları gösterir. AdMob, reklam
kimliği ve cihaz bilgilerini kendi politikasına göre işler. Formda
"Reklam veya pazarlama" amacıyla **Cihaz kimlikleri → Toplanır, paylaşılır**
olarak işaretleyin (AdMob SDK'sının beyanı).

**Silme:** Kullanıcı `emredincel01@gmail.com` adresine yazarak adını ve
oyun içi ilerlemesini sildirebilir (politikada 8. bölüm).

---

## 3. İçerik derecelendirmesi (Content rating — IARC)

| Soru | Cevap |
|---|---|
| Kategori | Oyun |
| Şiddet (gerçekçi/çizgi) | Hayır |
| Kan, yaralanma | Hayır |
| Cinsellik / çıplaklık | Hayır |
| Küfür / argo | Hayır |
| Uyuşturucu, alkol, tütün | Hayır |
| Kumar (simüle dahil) | Hayır |
| Korku / rahatsız edici görüntü | Hayır |
| Kullanıcı etkileşimi (sohbet, kullanıcı içeriği) | **Hayır** (sadece hazır ifadeler, serbest sohbet yok) |
| Kullanıcılar arası veri paylaşımı | **Evet** (takma ad ve oda kodu) |
| Konum paylaşımı | Hayır |
| Dijital satın alma | **Evet** (reklamları kaldır) |
| Reklam | **Evet** |

Beklenen sonuç: **Herkes / 3+**.

---

## 4. Uygulama içi ürün

Play Console → Para kazanma → Uygulama içi ürünler → **Tek seferlik ürün**:

| Alan | Değer |
|---|---|
| Ürün kimliği | `remove_ads` |
| Ad | Reklamları kaldır |
| Açıklama | Tüm reklamları kalıcı olarak kaldırır. |
| Fiyat | Önerilen: ₺29,99 (ülkeye göre otomatik) |
| Durum | Etkin |

Ürün kimliği `android/app/build.gradle.kts` içindeki
`blokiki.removeAdsProduct` varsayılanıyla (`remove_ads`) aynı olmalı.
Fiyatı Play Console belirler; kodda fiyat yoktur.

---

## 5. Sürüm notları (2.0.4)

```
• Ana ekran sadeleşti: "Aynı cihaz" ve "Çevrimiçi" bölümleri ayrıldı.
• Oynat düğmeleri yenilendi, dokunma alanı büyüdü.
• Arkadaşınla oyna paneli açık temaya kavuştu; yazılar daha okunur.
• Küçük ekranlarda taşma giderildi.
• "Çevrimiçi" rozeti 74 dilde çevrildi.
• Kazanma efekti zenginleşti: ışık huzmeleri, altın kıvılcımlar, geniş fanfar.
• Satır ve sütun patlamaları artık ayrı seslerle duyuluyor; ikisi birden
  patlarsa özel "perfect" sesi çalıyor.
```

---

## 6. Yükleme sırası (kontrol listesi)

- [ ] Play Console'da uygulama oluştur: ad `Blokara 1v1`, varsayılan dil Türkçe,
      tür "Oyun", ücretsiz.
- [ ] Play App Signing'i aç (yeni yükleme için önerilir; mevcut keystore'u
      yedekle).
- [ ] Mağaza kaydı: metinler + simge + öne çıkan grafik + 6 ekran görüntüsü.
- [ ] Gizlilik politikası URL'si (kalıcı sunucu adresi + `/privacy.html`).
- [ ] Veri güvenliği formu (bölüm 2).
- [ ] İçerik derecelendirmesi anketi (bölüm 3).
- [ ] Reklam beyanı: "Reklam içeriyor" işaretle.
- [ ] Uygulama içi ürün `remove_ads` oluştur ve etkinleştir.
- [ ] AAB yükle: `android/dist/Blokara-1v1-2.0.4.aab`.
- [ ] Kapalı test → 12 test kullanıcısı → 14 gün → üretime geçiş.
- [ ] Üretim öncesi `assets/server.txt` kalıcı sunucu adresini gösteriyor mu
      kontrol et (tünel adresi kalıcı değildir).

> **Önemli:** APK/AAB içindeki sunucu adresi gömülüdür
> (`android/app/src/main/assets/server.txt`). Tünel adresi her yeniden
> başlatmada değiştiği için yayın öncesi kalıcı bir sunucu (Render, Fly.io,
> VPS) adresiyle **yeniden derlenmelidir**.
