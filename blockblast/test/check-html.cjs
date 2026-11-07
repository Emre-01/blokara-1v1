/* index.html sağlık kontrolü: UTF-8 bozulması, eksik varlık, kırık id.
   node test/check-html.cjs */
"use strict";
const fs = require("fs");
const path = require("path");

const publicDir = path.join(__dirname, "..", "public");
const file = path.join(publicDir, "index.html");
const buffer = fs.readFileSync(file);
const html = buffer.toString("utf8");
const problems = [];

if (buffer[0] === 0xef) problems.push("Dosya BOM ile başlıyor.");

const broken = (html.match(/\uFFFD/g) || []).length;
if (broken) problems.push(broken + " adet bozuk karakter (U+FFFD) var.");
if (!html.includes("İçeriğe geç")) problems.push("Türkçe karakterler bozulmuş olabilir (atlama bağlantısı yok).");

const refs = [...html.matchAll(/(?:href|src)="([^"#][^"]*)"/g)]
  .map((m) => m[1])
  .filter((ref) => !/^(https?:|data:|mailto:)/.test(ref));
refs.forEach((ref) => {
  if (!fs.existsSync(path.join(publicDir, ref))) problems.push("Eksik varlık: " + ref);
});

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const seen = new Set();
ids.forEach((id) => {
  if (seen.has(id)) problems.push("Yinelenen id: " + id);
  seen.add(id);
});

// app.js'in aradığı kritik düğümler (bazıları render sırasında üretilir)
const app = fs.readFileSync(path.join(publicDir, "app.js"), "utf8");
const generated = new Set(["time-left", "tray", "board-shared", "board-me", "board-0", "board-1", "board-rival", "duel-turn", "turn-note", "lobby-slots", "name-edit-input", "friend-code-input", "friend-add-form", "friend-list", "duel-stage", "emote-btn"]);
const required = [...app.matchAll(/\$\("#([a-z0-9-]+)"\)/gi)].map((m) => m[1]);
[...new Set(required)].forEach((id) => {
  if (generated.has(id)) return;
  if (!seen.has(id)) problems.push("app.js '#" + id + "' arıyor ama HTML'de yok.");
});

if (problems.length) {
  problems.forEach((p) => console.error("✗ " + p));
  process.exit(1);
}
console.log("index.html sağlıklı (" + ids.length + " id, " + refs.length + " varlık).");

/* Emote animasyon laboratuvarı: ayrı bir geliştirici sayfası. Sunucu
   satır içi betiği engellediği için mantığı emote-lab.js dosyasında olmalı. */
const labFile = path.join(publicDir, "emote-lab.html");
if (!fs.existsSync(labFile)) {
  console.error("✗ emote-lab.html yok.");
  process.exit(1);
}
const lab = fs.readFileSync(labFile, "utf8");
const labProblems = [];
if (/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/.test(lab)) {
  labProblems.push("satır içi betik var; CSP engeller, emote-lab.js kullanılmalı.");
}
["emotes.js", "emote-lab.js", "styles.css"].forEach((ref) => {
  if (!lab.includes('"' + ref + '"')) labProblems.push("emote-lab.html '" + ref + "' dosyasını yüklemiyor.");
  if (!fs.existsSync(path.join(publicDir, ref))) labProblems.push("Eksik varlık: " + ref);
});
if (!fs.existsSync(path.join(publicDir, "emote-lab.js"))) {
  labProblems.push("emote-lab.js yok.");
}
if (labProblems.length) {
  labProblems.forEach((p) => console.error("✗ " + p));
  process.exit(1);
}
console.log("emote laboratuvarı sağlıklı.");
