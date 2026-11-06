/* Çeviri kapsama testi: arayüzdeki her metin 74 dilin hepsinde bulunmalı.
   node test/i18n-test.cjs */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const publicDir = path.join(__dirname, "..", "public");
const problems = [];

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(publicDir, "i18n-data.js"), "utf8"), ctx);
const data = ctx.window.BLOK_I18N;
const langs = Object.keys(data);
const base = data.en;

if (langs.length < 74) problems.push("Beklenen 74 dil, bulunan " + langs.length + ".");

/* 1) Tüm diller İngilizceyle aynı anahtar kümesine sahip olmalı. */
for (const lang of langs) {
  const missing = Object.keys(base).filter((key) => !(key in data[lang]));
  if (missing.length) problems.push(lang + ": " + missing.length + " anahtar eksik (ör. " + missing[0] + ")");
  const empty = Object.keys(data[lang]).filter((key) => !String(data[lang][key]).trim());
  if (empty.length) problems.push(lang + ": " + empty.length + " boş çeviri (ör. " + empty[0] + ")");
}

/* 2) HTML'de görünen/duyurulan metinlerin tamamı sözlükte olmalı. */
const html = fs.readFileSync(path.join(publicDir, "index.html"), "utf8");
const body = html
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<!--[\s\S]*?-->/g, " ");
const texts = new Set();
body.replace(/>([^<>]+)</g, (_, text) => {
  const value = text.replace(/\s+/g, " ").trim();
  if (value && /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(value)) texts.add(value);
  return "";
});
for (const match of body.matchAll(/(?:placeholder|aria-label|title|alt)="([^"]+)"/g)) {
  const value = match[1].replace(/\s+/g, " ").trim();
  if (value) texts.add(value);
}
/* Marka adları, kısa etiketler ve biçimlendirilebilir örnekler çevrilmez. */
const skip = /^(Blokara|1v1|VS|P1|P2|SOLO|[KA-Z0-9]{5}|0 \/ \d+ XP)$/;
for (const text of texts) {
  if (skip.test(text)) continue;
  if (!(text in base)) problems.push("index.html metni sözlükte yok: " + JSON.stringify(text));
  else {
    const missing = langs.filter((lang) => !(text in data[lang]));
    if (missing.length) problems.push(JSON.stringify(text) + " " + missing.length + " dilde eksik");
  }
}

/* 3) Yeni eklenen "Çevrimiçi" rozeti her dilde gerçekten çevrilmiş olmalı
   (Türkçe sözlük yoktur; anahtarın kendisi Türkçe kaynak metindir). */
const untranslated = langs.filter((lang) => data[lang]["Çevrimiçi"] === "Çevrimiçi");
if (untranslated.length) problems.push("'Çevrimiçi' çevrilmemiş: " + untranslated.join(", "));

/* 4) JS'te üretilen menü metinleri de her dilde bulunmalı: profil
   sekmeleri, efektler ve hazır avatar adları HTML'de geçmez. */
const dynamic = [
  "Efektler", "Avatar", "Klasik", "Piksel", "Baloncuk", "Kıvılcım",
  "Konfeti", "Havai fişek", "Yıldız", "Kutu patlama efekti", "Kazanma efekti",
  "Avatar seç", "Avatarı kaldır", "Avatar seçildi.", "Avatar kaldırıldı.",
  "Tilki", "Panda", "Kurbağa", "Kedi", "Ayı", "Penguen", "Aslan", "Tavşan",
  "Robot", "Uzaylı", "Kral", "Havalı"
];
for (const key of dynamic) {
  if (!(key in base)) {
    problems.push("Dinamik menü anahtarı sözlükte yok: " + JSON.stringify(key));
    continue;
  }
  const missing = langs.filter((lang) => !(key in data[lang]));
  if (missing.length) problems.push(JSON.stringify(key) + " " + missing.length + " dilde eksik");
}

if (problems.length) {
  problems.slice(0, 25).forEach((p) => console.error("✗ " + p));
  console.error("Çeviri testi başarısız (" + problems.length + " sorun).");
  process.exit(1);
}
console.log("Çeviri testi geçti (" + langs.length + " dil, " + Object.keys(base).length + " anahtar, " + texts.size + " arayüz metni).");
