/* İki sekmeli çevrimiçi akış testi (Chrome CDP + yerel sunucu).
   node --experimental-websocket test/online-flow.cjs */
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

if (typeof WebSocket === "undefined") {
  const child = spawn(process.execPath, ["--experimental-websocket", __filename].concat(process.argv.slice(2)), { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code || 0));
  return;
}

const SERVER_PORT = 8097;
const CDP_PORT = 9466;
const ROOT = path.join(__dirname, "..");
const BASE = "http://127.0.0.1:" + SERVER_PORT + "/";

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].find((p) => fs.existsSync(p));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, [path.join(ROOT, "server.cjs")], {
  env: Object.assign({}, process.env, { PORT: String(SERVER_PORT), HOST: "127.0.0.1" }),
  stdio: ["ignore", "pipe", "pipe"]
});
server.stdout.on("data", (d) => process.stdout.write("[sunucu] " + d));
server.stderr.on("data", (d) => process.stderr.write("[sunucu] " + d));

let chrome = null;
const profile = path.join(os.tmpdir(), "blok-online-" + process.pid);

function getJson(pathname, method) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: CDP_PORT, path: pathname, method: method || "GET" }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.on("error", reject);
    req.end();
  });
}

async function waitForChrome() {
  for (let i = 0; i < 80; i++) {
    try { await getJson("/json/version"); return; } catch (e) { await wait(200); }
  }
  throw new Error("Chrome açılmadı");
}

async function openPage(url) {
  const target = await getJson("/json/new?" + encodeURIComponent(url), "PUT");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const entry = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)));
      else entry.resolve(msg.result);
    }
  });
  const call = (method, params) => new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params: params || {} }));
  });
  await call("Runtime.enable");
  await call("Emulation.setDeviceMetricsOverride", { width: 420, height: 900, deviceScaleFactor: 1, mobile: true });
  const evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error("JS: " + JSON.stringify(result.exceptionDetails.exception || result.exceptionDetails));
    return result.result && result.result.value;
  };
  return { ws, evaluate, close: () => ws.close() };
}

async function boot(page) {
  for (let i = 0; i < 40; i++) {
    const ready = await page.evaluate("!!(window.BlokDebug && document.getElementById('player-name'))").catch(() => false);
    if (ready) {
      await page.evaluate(`window.__anyMove = function (board, tray) {
        for (var p = 0; p < (tray || []).length; p++) {
          var piece = tray[p];
          if (!piece) continue;
          for (var r = 0; r < window.BlokIki.SIZE; r++) {
            for (var c = 0; c < window.BlokIki.SIZE; c++) {
              if (window.BlokIki.canPlace(board, piece, r, c)) return { piece: p, row: r, col: c };
            }
          }
        }
        return null;
      };`);
      return;
    }
    await wait(200);
  }
  throw new Error("Sayfa hazır olmadı");
}

const sleepEval = (ms) => "new Promise(r=>setTimeout(r," + ms + "))";

let step = 0;
function ok(name, condition, detail) {
  step++;
  if (!condition) {
    console.error("✗ " + name + (detail === undefined ? "" : " → " + JSON.stringify(detail)));
    throw new Error(name);
  }
  console.log("✓ " + name);
}

async function main() {
  await wait(700);

  chrome = spawn(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-proxy-server",
    "--remote-debugging-port=" + CDP_PORT,
    "--user-data-dir=" + profile,
    "--no-first-run",
    "about:blank"
  ], { stdio: "ignore" });
  await waitForChrome();

  const a = await openPage(BASE + "?test=1");
  const b = await openPage(BASE + "?test=1");
  await boot(a);
  await boot(b);

  /* ---- bot oynanabilirliği tamamen kaldırıldı ---- */
  const botGone = await a.evaluate(`({
    playBot: !!document.getElementById('play-bot'),
    botLevel: !!document.getElementById('bot-level'),
    botButton: !!document.querySelector('[data-bot]'),
    botText: /bota karşı/i.test(document.body.innerText)
  })`);
  ok("bota karşı oynama arayüzden kaldırıldı",
    !botGone.playBot && !botGone.botLevel && !botGone.botButton && !botGone.botText, botGone);

  /* ---- arkadaşınla oyna: katlanan menü yok, doğrudan seçim ---- */
  const panel = await a.evaluate(`(async () => {
    const card = document.getElementById('online-card');
    const visible = (id) => { const el = document.getElementById(id); return !!el && !el.hidden; };
    const before = { create: visible('pane-create'), join: visible('pane-join'), match: visible('pane-match') };
    document.getElementById('tab-join').click();
    await new Promise(r => setTimeout(r, 250));
    const afterJoin = { create: visible('pane-create'), join: visible('pane-join'), match: visible('pane-match') };
    document.getElementById('tab-match').click();
    await new Promise(r => setTimeout(r, 250));
    const afterMatch = { create: visible('pane-create'), join: visible('pane-join'), match: visible('pane-match') };
    document.getElementById('tab-create').click();
    return {
      details: !!card.querySelector('details, summary'),
      heading: card.querySelector('h2').textContent.trim(),
      banned: /uzaktan/i.test(card.innerText),
      badge: (card.querySelector('.online-badge') || {}).textContent?.trim() || '',
      tabs: [...card.querySelectorAll('.play-tab')].map(t => t.textContent.trim()),
      before, afterJoin, afterMatch,
      focused: afterJoin.join
    };
  })()`);
  ok("arkadaşınla oyna panelinde açılır menü yok, üç yol doğrudan görünüyor",
    !panel.details && panel.tabs.length === 3 && panel.before.create &&
    !panel.before.join && !panel.before.match, panel);
  ok("sekmeler arasında geçiş yapılıyor",
    panel.afterJoin.join && !panel.afterJoin.create && !panel.afterJoin.match &&
    panel.afterMatch.match && !panel.afterMatch.create && !panel.afterMatch.join, panel);
  ok("panel 'Çevrimiçi' rozetiyle ayrılıyor, eski 'uzaktan' ifadesi yok",
    !panel.banned && panel.badge === "Çevrimiçi" && panel.heading === "Arkadaşınla oyna", panel);

  /* ---- hesap: ad alanı hesap şeridinde, giriş zorunlu değil ---- */
  const account = await a.evaluate(`(async () => {
    const strip = document.getElementById('account-strip');
    const input = document.getElementById('player-name');
    const signIn = document.getElementById('name-signin');
    const edit = document.getElementById('name-edit');
    const insideStrip = !!input && strip.contains(input);
    const onlineCard = document.getElementById('online-card');
    const notInOnlineCard = !!input && !onlineCard.contains(input);
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 60));
    const emptyAvatar = document.getElementById('account-avatar').textContent.trim();
    input.value = 'Ada';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 60));
    const typedAvatar = document.getElementById('account-avatar').textContent.trim();
    window.BlokGoogleResult({ name: 'Zeynep', sub: 'test-1' });
    await new Promise(r => setTimeout(r, 120));
    const afterSignIn = {
      input: input.value,
      stillVisible: !input.closest('.field') || getComputedStyle(input).display !== 'none',
      signoutVisible: !document.getElementById('google-signout').hidden
    };
    document.getElementById('google-signout').click();
    await new Promise(r => setTimeout(r, 80));
    return {
      insideStrip, notInOnlineCard, emptyAvatar, typedAvatar,
      signInGone: !signIn, editGone: !edit,
      afterSignIn,
      afterSignOut: { value: input.value, signoutHidden: document.getElementById('google-signout').hidden }
    };
  })()`);
  ok("ad alanı 'Misafir oyuncu' şeridine taşındı, giriş düğmeleri kaldırıldı",
    account.insideStrip && account.notInOnlineCard && account.signInGone && account.editGone, account);
  ok("yazılan ad avatarı ve giriş durumunu günceller",
    account.emptyAvatar === "?" && account.typedAvatar === "A" &&
    account.afterSignIn.input === "Zeynep" && account.afterSignIn.stillVisible &&
    account.afterSignIn.signoutVisible, account);
  ok("çıkış yapınca son ad korunur",
    account.afterSignOut.value === "Zeynep" && account.afterSignOut.signoutHidden, account);

  /* ---- oda kur / katıl ---- */
  await a.evaluate(`document.getElementById('player-name').value = 'Ada';`);
  const created = await a.evaluate(`(async () => {
    document.getElementById('player-name').value = 'Ada';
    document.querySelector('[data-host="coop"]').click();
    await new Promise(r => setTimeout(r, 250));
    /* Oda ayarları artık oda açılırken sorulur: pencereyi onayla. */
    const start = document.querySelector('[data-setup-start]');
    if (start) start.click();
    await new Promise(r => setTimeout(r, 1200));
    return { screen: document.getElementById('screen-lobby').hidden ? 'home' : 'lobby',
             setup: !!document.querySelector('[data-setup-start]'),
             code: document.getElementById('lobby-code').textContent };
  })()`);
  ok("oda oluşturuldu", created.screen === "lobby" && /^[A-Z0-9]{5}$/.test(created.code), created);
  const code = created.code;

  /* ---- paylaş: sistem menüsü açar; kopyala yalnızca kodu yazar ---- */
  const shareUi = await a.evaluate(`(async () => {
    const shared = [];
    let copied = [];
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (payload) => { shared.push(payload); return Promise.resolve(); }
    });
    const realCopy = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (text) => { copied.push(text); return Promise.resolve(); } }
    });
    document.getElementById('share-code').click();
    await new Promise(r => setTimeout(r, 120));
    const afterShareCopies = copied.slice();
    document.getElementById('copy-code').click();
    await new Promise(r => setTimeout(r, 120));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: realCopy });
    delete navigator.share;
    return {
      shared: shared.length,
      sharedText: shared[0] ? String(shared[0].text || '') : '',
      sharedUrl: shared[0] ? String(shared[0].url || '') : '',
      afterShareCopies,
      copied,
      code: document.getElementById('lobby-code').textContent.trim()
    };
  })()`);
  ok("paylaş düğmesi paylaşım menüsünü açıyor, panoya kopyalamıyor",
    shareUi.shared === 1 && shareUi.afterShareCopies.length === 0 &&
    shareUi.sharedText.includes(code) && shareUi.sharedUrl.includes("oda=" + code), shareUi);
  ok("kopyala düğmesi yalnızca oda kodunu kopyalıyor",
    shareUi.copied.length === 1 && shareUi.copied[0].trim() === code, shareUi);

  const joined = await b.evaluate(`(async () => {
    document.getElementById('player-name').value = 'Efe';
    document.getElementById('join-code').value = '${code}';
    document.getElementById('join-form').requestSubmit();
    await new Promise(r => setTimeout(r, 1200));
    return { screen: document.getElementById('screen-lobby').hidden ? 'home' : 'lobby',
             slots: document.querySelectorAll('#lobby-slots .slot').length,
             timerLocked: [...document.querySelectorAll('#lobby-timer button')].every(x => x.disabled) };
  })()`);
  ok("ikinci oyuncu odaya girdi", joined.screen === "lobby" && joined.slots === 2, joined);
  ok("süre modu oda sahibinde (misafirde kilitli)", joined.timerLocked === true, joined);

  /* ---- arkadaşlar: ses düğmesinin yanında, kod ekleme ve davet ---- */
  const friendUi = await a.evaluate(`(async () => {
    const sound = document.getElementById('sound-btn');
    const btn = document.getElementById('friends-btn');
    const header = btn ? btn.parentElement : null;
    const order = header ? [...header.children].map(el => el.id).filter(Boolean) : [];
    btn.click();
    await new Promise(r => setTimeout(r, 350));
    const code = document.getElementById('my-friend-code');
    const stored = localStorage.getItem('blokara.friendCode');
    const sheetOpen = !document.getElementById('overlay').hidden;
    return { exists: !!btn, beforeSound: order.indexOf('friends-btn') < order.indexOf('sound-btn'),
             sheetOpen, code: code ? code.textContent.trim() : '', stored,
             hasForm: !!document.getElementById('friend-add-form') };
  })()`);
  ok("arkadaş menüsü ses düğmesinin yanında açılıyor",
    friendUi.exists && friendUi.beforeSound && friendUi.sheetOpen && friendUi.hasForm, friendUi);
  ok("arkadaş kodu üretiliyor ve gösteriliyor",
    /^[A-Z0-9]{6}$/.test(friendUi.code) && friendUi.code === friendUi.stored, friendUi);

  const otherCode = await b.evaluate(`(async () => {
    window.BlokDebug.setFriendCode('K7M2QX');
    await new Promise(r => setTimeout(r, 250));
    return window.BlokDebug.friendCode();
  })()`);
  const friendAdd = await a.evaluate(`(async () => {
    const input = document.getElementById('friend-code-input');
    input.value = '${otherCode}';
    document.getElementById('friend-add-form').requestSubmit();
    await new Promise(r => setTimeout(r, 900));
    const rows = [...document.querySelectorAll('#friend-list .friend-row')];
    return { count: rows.length, text: rows.length ? rows[0].innerText : '',
             stored: JSON.parse(localStorage.getItem('blokara.friends') || '[]'),
             inviteButton: !!document.querySelector('[data-friend-invite="${otherCode}"]') };
  })()`);
  ok("arkadaş kodla ekleniyor ve çevrimiçi görünüyor",
    friendAdd.count === 1 && /çevrimiçi/.test(friendAdd.text) &&
    /Efe/.test(friendAdd.text) &&
    friendAdd.stored.some(f => f.code === otherCode) && friendAdd.inviteButton, friendAdd);

  /* Arkadaş adını değiştirince liste sunucudaki yeni adı göstermeli. */
  await b.evaluate(`(async () => {
    const input = document.getElementById('player-name');
    input.value = 'Efe Yeni';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 800));
  })()`);
  const liveName = await a.evaluate(`(async () => {
    document.querySelector('#overlay [data-close]').click();
    await new Promise(r => setTimeout(r, 150));
    document.getElementById('friends-btn').click();
    await new Promise(r => setTimeout(r, 900));
    const row = document.querySelector('#friend-list .friend-row');
    return { text: row ? row.innerText : '' };
  })()`);
  ok("arkadaş listesi kişinin güncel adını gösteriyor",
    /Efe Yeni/.test(liveName.text), liveName);

  const inviteSent = await a.evaluate(`(async () => {
    document.querySelector('[data-friend-invite="${otherCode}"]').click();
    await new Promise(r => setTimeout(r, 700));
    return { room: window.BlokDebug.snapshot() ? true : false,
             toast: document.getElementById('toast').textContent.trim() };
  })()`);
  const inviteSeen = await b.evaluate(`(async () => {
    await new Promise(r => setTimeout(r, 400));
    const banner = document.getElementById('invite-banner');
    const data = { hidden: banner.hidden,
                   from: document.getElementById('invite-from').textContent.trim(),
                   code: document.getElementById('invite-code').textContent.trim() };
    document.getElementById('invite-dismiss').click();
    await new Promise(r => setTimeout(r, 150));
    data.dismissed = document.getElementById('invite-banner').hidden;
    return data;
  })()`);
  ok("arkadaşa davet gönderiliyor", /davet/i.test(inviteSent.toast), inviteSent);
  ok("davet karşı tarafta oda koduyla görünüyor ve kapatılabiliyor",
    !inviteSeen.hidden && inviteSeen.from === "Ada" && inviteSeen.code === code && inviteSeen.dismissed, inviteSeen);

  await a.evaluate(`(async () => {
    document.querySelector('#overlay [data-close]').click();
    await new Promise(r => setTimeout(r, 200));
    return true;
  })()`);

  const timerLayout = await a.evaluate(`(async () => {
    const box = document.getElementById('lobby-timer');
    const b = box.getBoundingClientRect();
    const buttons = [...box.querySelectorAll('button')].map((el) => {
      const r = el.getBoundingClientRect();
      return { text: el.textContent, left: r.left, right: r.right, width: r.width };
    });
    return {
      overflowX: box.scrollWidth - box.clientWidth,
      boxLeft: b.left,
      boxRight: b.right,
      buttons
    };
  })()`);
  ok("lobi süre seçici kapsayıcıdan taşmıyor",
    timerLayout.overflowX <= 1 && timerLayout.buttons.length === 3 &&
    timerLayout.buttons.every((x) => x.left >= timerLayout.boxLeft - 1 && x.right <= timerLayout.boxRight + 1),
    timerLayout);

  /* ---- süre modu değişimi iki tarafta görünür ---- */
  const hostTimer = await a.evaluate(`(async () => {
    document.querySelector('#lobby-timer button[data-time="turn"]').click();
    await new Promise(r => setTimeout(r, 700));
    return [...document.querySelectorAll('#lobby-timer button')].map(x => x.getAttribute('aria-pressed'));
  })()`);
  const guestTimer = await b.evaluate(`(async () => {
    await new Promise(r => setTimeout(r, 400));
    return [...document.querySelectorAll('#lobby-timer button')].map(x => x.getAttribute('aria-pressed'));
  })()`);
  ok("süre modu iki tarafta eşit", JSON.stringify(hostTimer) === JSON.stringify(guestTimer) && hostTimer[1] === "true", { hostTimer, guestTimer });

  /* ---- oyunu başlat ---- */
  const started = await a.evaluate(`(async () => {
    document.getElementById('start-btn').click();
    await new Promise(r => setTimeout(r, 1200));
    return { game: !document.getElementById('screen-game').hidden,
             mode: window.BlokDebug.snapshot().mode,
             timeMode: window.BlokDebug.snapshot().timeMode,
             turnLimit: window.BlokDebug.snapshot().turnLimit };
  })()`);
  ok("oyun başladı (coop + sıra süresi)", started.game && started.mode === "coop" && started.timeMode === "turn", started);

  const guestGame = await b.evaluate(`(async () => {
    await new Promise(r => setTimeout(r, 400));
    return { game: !document.getElementById('screen-game').hidden, mode: window.BlokDebug.snapshot().mode };
  })()`);
  ok("misafir de oyun ekranında", guestGame.game === true && guestGame.mode === "coop", guestGame);

  /* ---- sıra: A oynar, B görür ---- */
  const moveA = await a.evaluate(`(async () => {
    const s0 = window.BlokDebug.snapshot();
    const mv = window.__anyMove(s0.shared.board, s0.shared.tray);
    if (!mv) return { error: 'hamle yok' };
    const p = document.querySelector('.piece[data-piece="' + mv.piece + '"]');
    const r = p.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', isPrimary: true,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    p.dispatchEvent(new PointerEvent('pointerdown', o));
    await new Promise(r => setTimeout(r, 80));
    document.dispatchEvent(new PointerEvent('pointerup', o));
    await new Promise(r => setTimeout(r, 250));
    document.querySelector('.cell[data-r="' + mv.row + '"][data-c="' + mv.col + '"]').click();
    await new Promise(r => setTimeout(r, 1200));
    const s = window.BlokDebug.snapshot();
    return { sharedScore: s.shared.score, turn: s.turn, seq: s.seq, mv,
             filled: s.shared.board.flat().filter(Boolean).length };
  })()`);
  ok("A hamlesi sunucuya gitti", moveA.filled > 0 && moveA.turn === 1, moveA);

  const seenB = await b.evaluate(`(async () => {
    await new Promise(r => setTimeout(r, 600));
    const s = window.BlokDebug.snapshot();
    return { sharedScore: s.shared.score, turn: s.turn,
             hint: document.getElementById('game-hint').textContent,
             filled: s.shared.board.flat().filter(Boolean).length };
  })()`);
  ok("B hamleyi gördü ve sıra onda", seenB.filled === moveA.filled && seenB.turn === 1, seenB);
  ok("ortak tahtada taş var", seenB.filled > 0, seenB);

  /* ---- sahte hamle reddedilmeli: sırası olmayan oyuncu ---- */
  const illegal = await a.evaluate(`(async () => {
    const before = window.BlokDebug.snapshot().seq;
    window.BlokDebug.send({ t: 'move', piece: 0, row: 0, col: 5 });
    await new Promise(r => setTimeout(r, 700));
    return { seq: window.BlokDebug.snapshot().seq, before };
  })()`);
  ok("sırası olmayan oyuncunun hamlesi yok sayıldı", illegal.seq === illegal.before, illegal);

  /* ---- B oynar, A görür ---- */
  const moveB = await b.evaluate(`(async () => {
    const s0 = window.BlokDebug.snapshot();
    const mv = window.__anyMove(s0.shared.board, s0.shared.tray);
    if (!mv) return { error: 'hamle yok' };
    const p = document.querySelector('.piece[data-piece="' + mv.piece + '"]');
    const r = p.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', isPrimary: true,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    p.dispatchEvent(new PointerEvent('pointerdown', o));
    await new Promise(r => setTimeout(r, 80));
    document.dispatchEvent(new PointerEvent('pointerup', o));
    await new Promise(r => setTimeout(r, 250));
    document.querySelector('.cell[data-r="' + mv.row + '"][data-c="' + mv.col + '"]').click();
    await new Promise(r => setTimeout(r, 1000));
    const s = window.BlokDebug.snapshot();
    return { turn: s.turn, mv, filled: s.shared.board.flat().filter(Boolean).length };
  })()`);
  const afterB = await a.evaluate(`(async () => {
    await new Promise(r => setTimeout(r, 600));
    const s = window.BlokDebug.snapshot();
    return { turn: s.turn, filled: s.shared.board.flat().filter(Boolean).length };
  })()`);
  ok("B hamlesi A'ya yansıdı ve sıra A'ya döndü", afterB.filled > moveA.filled && afterB.turn === 0, { moveA, moveB, afterB });

  /* ---- süre cezası: iki tarafta da ceza sayısı artmalı ---- */
  const penaltySeen = await a.evaluate(`(async () => {
    const before = window.BlokDebug.snapshot().players.map(p => p.penalties);
    await new Promise(r => setTimeout(r, 34000));
    const s = window.BlokDebug.snapshot();
    return { before, after: s.players.map(p => p.penalties), reason: s.reason, phase: s.phase };
  })()`);
  ok("sıra süresi dolunca ceza işlendi", penaltySeen.after.some((v, i) => v > penaltySeen.before[i]), penaltySeen);

  /* ---- rakip modu: ayrı tahtalar, aynı bloklar ---- */
  /* ---- rakip modu: önce misafir, sonra sahip odadan çıkar ---- */
  const exitB = await b.evaluate(`(async () => {
    document.getElementById('exit-btn').click();
    await new Promise(r => setTimeout(r, 250));
    const confirm = document.querySelector('[data-confirm]');
    if (confirm) confirm.click();
    await new Promise(r => setTimeout(r, 800));
    return { screen: document.getElementById('screen-home').hidden ? 'other' : 'home' };
  })()`);
  if (exitB.screen !== "home") throw new Error("B ana menüye dönemedi: " + JSON.stringify(exitB));

  const exitA = await a.evaluate(`(async () => {
    document.getElementById('exit-btn').click();
    await new Promise(r => setTimeout(r, 250));
    const confirm = document.querySelector('[data-confirm]');
    if (confirm) confirm.click();
    await new Promise(r => setTimeout(r, 800));
    return { screen: document.getElementById('screen-home').hidden ? 'other' : 'home' };
  })()`);
  if (exitA.screen !== "home") throw new Error("A ana menüye dönemedi: " + JSON.stringify(exitA));

  const versusRoom = await a.evaluate(`(async () => {
    document.querySelector('[data-host="versus"]').click();
    await new Promise(r => setTimeout(r, 250));
    const start = document.querySelector('[data-setup-start]');
    if (start) start.click();
    await new Promise(r => setTimeout(r, 1200));
    return { code: document.getElementById('lobby-code').textContent,
             lobby: !document.getElementById('screen-lobby').hidden };
  })()`);
  ok("rakip odası kuruldu", versusRoom.lobby && /^[A-Z0-9]{5}$/.test(versusRoom.code), versusRoom);

  const versusJoin = await b.evaluate(`(async () => {
    document.getElementById('join-code').value = '${versusRoom.code}';
    document.getElementById('join-form').requestSubmit();
    await new Promise(r => setTimeout(r, 1400));
    return { slots: document.querySelectorAll('#lobby-slots .slot').length,
             lobby: !document.getElementById('screen-lobby').hidden };
  })()`);
  ok("rakip odasına katıldı", versusJoin.slots === 2, versusJoin);

  /* ---- lobi kapışma ayarları: varsayılan sırayla, düğmeler oda sahibinde ---- */
  const paceDefault = await a.evaluate(`(async () => {
    await new Promise(r => setTimeout(r, 400));
    const s = window.BlokDebug.snapshot();
    return {
      turnBased: s.turnBased,
      pace: [...document.querySelectorAll('#lobby-pace button')].map(x => x.getAttribute('aria-pressed')),
      paceVisible: !document.getElementById('lobby-pace-row').hidden,
      limit: document.getElementById('lobby-limit-value').textContent
    };
  })()`);
  ok("rakip odası sırayla başlıyor ve süre ayarı görünüyor",
    paceDefault.turnBased === true && paceDefault.paceVisible &&
    paceDefault.pace[0] === "true" && /2:00/.test(paceDefault.limit), paceDefault);

  const paceSwitch = await a.evaluate(`(async () => {
    document.querySelector('#lobby-pace button[data-pace="live"]').click();
    await new Promise(r => setTimeout(r, 500));
    const live = window.BlokDebug.snapshot().turnBased;
    document.querySelector('#lobby-pace button[data-pace="turn"]').click();
    await new Promise(r => setTimeout(r, 500));
    return { live, back: window.BlokDebug.snapshot().turnBased };
  })()`);
  ok("doldurma düzeni iki tarafta değişiyor", paceSwitch.live === false && paceSwitch.back === true, paceSwitch);

  const limitStep = await a.evaluate(`(async () => {
    document.querySelector('#lobby-limit-row [data-step="1"]').click();
    await new Promise(r => setTimeout(r, 500));
    return { value: document.getElementById('lobby-limit-value').textContent,
             limit: window.BlokDebug.snapshot().timeLimit };
  })()`);
  const limitSeen = await b.evaluate(`(async () => {
    await new Promise(r => setTimeout(r, 300));
    return { value: document.getElementById('lobby-limit-value').textContent,
             limit: window.BlokDebug.snapshot().timeLimit };
  })()`);
  ok("süre ince ayarı 15'er saniye artıyor ve karşı tarafa yansıyor",
    limitStep.limit === 135 && limitSeen.limit === 135 &&
    /2:15/.test(limitStep.value) && limitStep.value === limitSeen.value, { limitStep, limitSeen });

  await a.evaluate(`(async () => {
    document.getElementById('start-btn').click();
    await new Promise(r => setTimeout(r, 1400));
    return true;
  })()`);
  const boards = await Promise.all([a, b].map((page) => page.evaluate(`(async () => {
    await new Promise(r => setTimeout(r, 500));
    const s = window.BlokDebug.snapshot();
    return { mode: s.mode, boards: s.players.map(p => (p.tray || []).map(x => x && x.name).join(',')),
             separate: !!s.players[0].board && !!s.players[1].board };
  })()`)));
  ok("rakip modunda iki ayrı tahta var", boards[0].mode === "versus" && boards[0].separate && boards[1].separate, boards);
  ok("blok dizisi iki tarafta aynı", boards[0].boards[0] === boards[1].boards[1], boards);

  await a.evaluate(`(async () => {
    const s0 = window.BlokDebug.snapshot();
    const mv = window.__anyMove(s0.players[0].board, s0.players[0].tray);
    if (!mv) return false;
    const piece = document.querySelector('.piece[data-piece="' + mv.piece + '"]');
    const r = piece.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', isPrimary: true,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    piece.dispatchEvent(new PointerEvent('pointerdown', o));
    await new Promise(r => setTimeout(r, 80));
    document.dispatchEvent(new PointerEvent('pointerup', o));
    await new Promise(r => setTimeout(r, 300));
    document.querySelector('.cell[data-r="' + mv.row + '"][data-c="' + mv.col + '"]').click();
    await new Promise(r => setTimeout(r, 1200));
    return true;
  })()`);
  const rivalView = await b.evaluate(`(async () => {
    await new Promise(r => setTimeout(r, 500));
    const s = window.BlokDebug.snapshot();
    return { mine: s.players[1].score, rival: s.players[0].score,
             rivalCells: s.players[0].board.flat().filter(Boolean).length };
  })()`);
  ok("rakip modunda hamle karşı tahtaya taşınmıyor", rivalView.rivalCells > 0 && rivalView.mine === 0, { rivalView });

  const peerView = await b.evaluate(`(async () => {
    await new Promise(r => setTimeout(r, 400));
    const mine = document.querySelector('#board-me');
    const rival = document.querySelector('#board-rival');
    const area = document.getElementById('table-area');
    const banner = document.getElementById('duel-turn');
    if (!mine || !rival || !area) return { exists: false };
    const mr = mine.getBoundingClientRect();
    const rr = rival.getBoundingClientRect();
    const ar = area.getBoundingClientRect();
    const front = document.querySelector('#duel-stage .duel-card.is-front');
    const back = document.querySelector('#duel-stage .duel-card.is-back');
    return {
      exists: true,
      /* İki tahta aynı sahnede üst üste durur; sıradaki öne gelir. */
      sameStage: !!mine.closest('.duel-stage') && mine.closest('.duel-stage') === rival.closest('.duel-stage'),
      centered: Math.abs((mr.left + mr.width / 2) - (rr.left + rr.width / 2)) <= 8,
      sideBySide: Math.abs(mr.top - rr.top) <= 10 && (mr.right <= rr.left + 1 || rr.right <= mr.left + 1),
      frontBoard: front ? (front.querySelector('.board') || {}).id : '',
      backHidden: back ? getComputedStyle(back).opacity === "0" : false,
      inside: mr.left >= ar.left - 2 && mr.right <= ar.right + 2,
      rivalCells: rival.querySelectorAll('.on').length,
      banner: banner ? banner.textContent : '',
      turn: window.BlokDebug.snapshot().turn
    };
  })()`);
  ok("tahtalar aynı sahnede üst üste, sıradaki önde ve bant doğru oyuncuyu gösteriyor",
    peerView.exists && peerView.sameStage && peerView.centered && !peerView.sideBySide && peerView.inside &&
    peerView.frontBoard === "board-me" && peerView.backHidden &&
    peerView.rivalCells === rivalView.rivalCells && /Sıra sende/.test(peerView.banner), peerView);

  /* ---- emote: oyun sırasında dört ifade, karşı tarafa canlı ulaşır ---- */
  const emoteSend = await a.evaluate(`(async () => {
    const overlay = document.getElementById('overlay');
    if (!overlay.hidden) {
      const close = overlay.querySelector('.sheet [data-close]');
      if (close) close.click();
      await new Promise(r => setTimeout(r, 350));
    }
    const btn = document.getElementById('emote-btn');
    const visible = !!btn && !btn.hidden;
    const debug = { screen: window.BlokDebug.snapshot().phase,
      overlay: !overlay.hidden,
      overlayText: overlay.hidden ? '' : overlay.innerText.slice(0, 80),
      homeHidden: document.getElementById('screen-home').hidden,
      gameHidden: document.getElementById('screen-game').hidden };
    btn.click();
    await new Promise(r => setTimeout(r, 140));
    const tray = document.getElementById('emote-tray');
    const chips = [...tray.querySelectorAll('[data-emote]')]
      .filter((x) => !x.hidden).map(x => x.dataset.emote);
    const expanded = btn.getAttribute('aria-expanded');
    const openBefore = !tray.hidden;
    tray.querySelector('[data-emote="laugh"]').click();
    await new Promise(r => setTimeout(r, 180));
    return { visible, debug, expanded, openBefore, chips, openAfter: !tray.hidden,
      mine: !!document.querySelector('.emote-bubble.emote-laugh'),
      status: document.getElementById('emote-status').textContent };
  })()`);
  ok("oyun sırasında emote düğmesi dört ifadeyi açıyor ve gönderiyor",
    emoteSend.visible && emoteSend.expanded === "true" && emoteSend.openBefore &&
    !emoteSend.openAfter &&
    emoteSend.chips.join(",") === "laugh,clap,cry,angry" &&
    emoteSend.mine && /laugh|Gülme/i.test(emoteSend.status), emoteSend);

  const emoteSeen = await b.evaluate(`(async () => {
    await new Promise(r => setTimeout(r, 500));
    return { bubble: !!document.querySelector('.emote-bubble.emote-laugh'),
             who: document.querySelector('.emote-who') ? document.querySelector('.emote-who').textContent : '',
             status: document.getElementById('emote-status').textContent };
  })()`);
  ok("emote karşı oyuncuya ulaşıyor ve gönderenin adını gösteriyor",
    emoteSeen.bubble && emoteSeen.who.length > 0 && /laugh|Gülme/i.test(emoteSeen.status), emoteSeen);

  /* ---- tek kişilik mod ---- */
  for (const page of [a, b]) {
    await page.evaluate(`(async () => {
      document.getElementById('exit-btn').click();
      await new Promise(r => setTimeout(r, 250));
      const confirm = document.querySelector('[data-confirm]');
      if (confirm) confirm.click();
      await new Promise(r => setTimeout(r, 700));
      return true;
    })()`);
  }

  const winnerText = await a.evaluate(`(async () => {
    /* Aynı cihazda iki tahtalı kart artık yok; rakip motoru yalnızca
       çevrimiçi oyunda kullanılıyor. Sonuç akışını doğrudan başlat. */
    window.BlokDebug.start('versus');
    await new Promise(r => setTimeout(r, 600));
    window.BlokDebug.finish(0, 'Oyuncu 1 kazandı.');
    await new Promise(r => setTimeout(r, 250));
    const title = document.querySelector('#overlay h2');
    const badge = document.querySelector('#overlay .result-badge');
    const hint = document.getElementById('game-hint');
    const emotes = [...document.querySelectorAll('#overlay .result-emotes [data-emote]')]
      .map((el) => el.dataset.emote);
    const clap = document.querySelector('#overlay .result-emotes [data-emote="clap"]');
    if (clap) clap.click();
    await new Promise(r => setTimeout(r, 160));
    return { title: title ? title.textContent : '', badge: badge ? badge.textContent : '',
             hint: hint ? hint.textContent : '', emotes,
             bubble: !!document.querySelector('.emote-bubble.emote-clap'),
             status: document.getElementById('emote-status').textContent };
  })()`);
  ok("kazanan metni 'Kazandın!' diyor",
    winnerText.title === "Kazandın!" && winnerText.badge === "kazandın" &&
    /^Kazandın[.!]$/.test(winnerText.hint), winnerText);
  ok("tur bittiğinde sonuç penceresinden emote gönderilebiliyor",
    winnerText.emotes.join(",") === "laugh,clap,cry,angry" && winnerText.bubble &&
    /clap|Alkış/i.test(winnerText.status), winnerText);

  await a.evaluate(`(async () => {
    const home = document.querySelector('#overlay [data-home]');
    if (home) home.click();
    await new Promise(r => setTimeout(r, 500));
    return true;
  })()`);

  const solo = await a.evaluate(`(async () => {
    document.querySelector('[data-local="solo"]').click();
    await new Promise(r => setTimeout(r, 700));
    const s = window.BlokDebug.snapshot();
    return {
      game: !document.getElementById('screen-game').hidden,
      mode: s.mode,
      players: s.players.length,
      timeMode: s.timeMode,
      cards: document.querySelectorAll('#scoreboard .score-card').length,
      soloClass: document.getElementById('scoreboard').classList.contains('solo'),
      timer: !!document.querySelector('#timer-track:not([hidden])')
    };
  })()`);
  ok("tek kişilik mod açılıyor", solo.game && solo.mode === "solo" && solo.players === 1, solo);
  ok("tek kişilikte tek kart ve sayaç yok",
    solo.cards === 1 && solo.soloClass && solo.timeMode === "none" && !solo.timer, solo);

  const soloMove = await a.evaluate(`(async () => {
    const s0 = window.BlokDebug.snapshot();
    const mv = window.__anyMove(s0.players[0].board, s0.players[0].tray);
    if (!mv) return { error: 'hamle yok' };
    const piece = document.querySelector('.piece[data-piece="' + mv.piece + '"]');
    const r = piece.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', isPrimary: true,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    piece.dispatchEvent(new PointerEvent('pointerdown', o));
    await new Promise(r => setTimeout(r, 80));
    document.dispatchEvent(new PointerEvent('pointerup', o));
    await new Promise(r => setTimeout(r, 300));
    document.querySelector('.cell[data-r="' + mv.row + '"][data-c="' + mv.col + '"]').click();
    await new Promise(r => setTimeout(r, 900));
    const s = window.BlokDebug.snapshot();
    return { blocks: s.players[0].blocks, phase: s.phase, players: s.players.length };
  })()`);
  ok("tek kişilikte hamle yapılıyor", soloMove.blocks > 0 && soloMove.players === 1, soloMove);

  /* ---- her tur sonunda bir geçiş reklamı ---- */
  const interstitial = await a.evaluate(`(async () => {
    window.__ads = 0;
    window.BlokAds = {
      available: () => true,
      hasRewarded: () => false,
      free: () => false,
      showInterstitial: () => { window.__ads += 1; },
      showRewarded: () => {},
      requestConsent: () => {},
      refresh: () => {}
    };
    const round = async (label) => {
      window.BlokDebug.start('solo');
      await new Promise(r => setTimeout(r, 350));
      window.BlokDebug.finish(null, 'test');
      await new Promise(r => setTimeout(r, 350));
      const shown = !document.getElementById('overlay').hidden;
      const close = document.querySelector('#overlay [data-close]') ||
                    document.querySelector('#overlay .sheet-actions .btn');
      if (close) close.click();
      await new Promise(r => setTimeout(r, 900));
      return shown ? window.__ads : -1;
    };
    const first = await round('1');
    const second = await round('2');
    /* Sonraki kontroller için temiz bir tek kişilik oyun bırak. */
    window.BlokDebug.start('solo');
    await new Promise(r => setTimeout(r, 400));
    return { first, second, free: localStorage.getItem('blokara.adsFree') };
  })()`);
  ok("her turdan sonra bir geçiş reklamı isteniyor",
    interstitial.first === 1 && interstitial.second === 2, interstitial);

  /* ---- oyun sırasında alt banner ---- */
  const bannerAd = await a.evaluate(`(async () => {
    window.__banner = { show: 0, hide: 0 };
    window.BlokAds.hasBanner = () => true;
    window.BlokAds.showBanner = () => { window.__banner.show += 1; };
    window.BlokAds.hideBanner = () => { window.__banner.hide += 1; };
    window.BlokAdsEvent('banner-loaded');
    window.BlokAdsEvent('banner:56');
    await new Promise(r => setTimeout(r, 200));
    const running = {
      show: window.__banner.show,
      hide: window.__banner.hide,
      adB: getComputedStyle(document.documentElement).getPropertyValue('--ad-b').trim()
    };
    window.BlokDebug.finish(null, 'test');
    await new Promise(r => setTimeout(r, 450));
    const result = {
      show: window.__banner.show,
      hide: window.__banner.hide,
      overlay: !document.getElementById('overlay').hidden
    };
    const close = document.querySelector('#overlay [data-close]') ||
                  document.querySelector('#overlay .sheet-actions .btn');
    if (close) close.click();
    await new Promise(r => setTimeout(r, 500));
    const afterClose = { show: window.__banner.show, hide: window.__banner.hide };
    /* Sonraki kontroller için taze bir tek kişilik oyun bırak. */
    window.BlokDebug.start('solo');
    await new Promise(r => setTimeout(r, 400));
    return { running, result, afterClose };
  })()`);
  ok("oyun sırasında alt banner açılıyor, sonuç penceresinde gizleniyor",
    bannerAd.running.show >= 1 && bannerAd.running.adB === "56px" &&
    bannerAd.result.overlay && bannerAd.result.hide >= 1 &&
    bannerAd.afterClose.show > bannerAd.running.show, bannerAd);

  /* ---- oyun içi menüden ad değiştirme ---- */
  const rename = await a.evaluate(`(async () => {
    document.getElementById('game-menu-btn').click();
    await new Promise(r => setTimeout(r, 250));
    const hasEntry = !!document.querySelector('#overlay [data-rename]');
    document.querySelector('#overlay [data-rename]').click();
    await new Promise(r => setTimeout(r, 250));
    const input = document.getElementById('name-edit-input');
    const opened = !!input;
    if (input) {
      input.value = 'Ada2';
      document.querySelector('#overlay [data-save-name]').click();
      await new Promise(r => setTimeout(r, 200));
    }
    return {
      hasEntry, opened,
      stored: localStorage.getItem('blokiki.name'),
      field: document.getElementById('player-name').value,
      closed: document.getElementById('overlay').hidden
    };
  })()`);
  ok("ad oyun içi menüden de değiştirilebiliyor",
    rename.hasEntry && rename.opened && rename.stored === "Ada2" &&
    rename.field === "Ada2" && rename.closed, rename);

  const feedback = await a.evaluate(`(async () => {
    const AC = window.AudioContext || window.webkitAudioContext;
    let oscillators = 0;
    if (AC) {
      const original = AC.prototype.createOscillator;
      AC.prototype.createOscillator = function () {
        oscillators += 1;
        return original.apply(this, arguments);
      };
    }
    const g = window.BlokDebug.game();
    g.players[0].board = window.BlokIki.emptyBoard();
    g.players[0].tray = [{ shape: 0, name: 'nokta', cells: [[0, 0]], w: 1, h: 1, color: 'coral' }];
    window.BlokDebug.fillRegion(7, 0, 1, 7, 'mint');
    const before = oscillators;
    const piece = document.querySelector('.piece[data-piece="0"]');
    const r = piece.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', isPrimary: true,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    piece.dispatchEvent(new PointerEvent('pointerdown', o));
    await new Promise(r => setTimeout(r, 60));
    document.dispatchEvent(new PointerEvent('pointerup', o));
    await new Promise(r => setTimeout(r, 120));
    document.querySelector('.cell[data-r="7"][data-c="7"]').click();
    await new Promise(r => setTimeout(r, 400));
    const s = window.BlokDebug.snapshot();
    return {
      score: s.players[0].score,
      texts: [...document.querySelectorAll('.fx-text')].map((el) => el.textContent),
      shaking: document.documentElement.classList.contains('screen-shake'),
      flashing: !!document.querySelector('.fx-flash'),
      hasShakeFn: typeof window.BlokFx.screenShake === 'function',
      hasFlashFn: typeof window.BlokFx.flash === 'function',
      scoreSound: oscillators > before
    };
  })()`);
  ok("satır patlaması güçlü geri bildirim veriyor",
    feedback.score > 0 && feedback.hasShakeFn && feedback.hasFlashFn &&
    feedback.shaking && feedback.flashing && feedback.scoreSound &&
    feedback.texts.some((text) => /^(GOOD|GREAT|PERFECT)!$/.test(text)), feedback);

  /* Satır ve sütun aynı hamlede patlarsa PERFECT + güçlü ekran efekti. */
  const crossFeedback = await a.evaluate(`(async () => {
    const g = window.BlokDebug.game();
    g.players[0].board = window.BlokIki.emptyBoard();
    g.players[0].score = 0;
    g.players[0].tray = [{ shape: 0, name: 'nokta', cells: [[0, 0]], w: 1, h: 1, color: 'coral' }];
    window.BlokDebug.fillRegion(7, 0, 1, 7, 'mint');
    window.BlokDebug.fillRegion(0, 7, 7, 1, 'mint');
    const piece = document.querySelector('.piece[data-piece="0"]');
    const r = piece.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', isPrimary: true,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    piece.dispatchEvent(new PointerEvent('pointerdown', o));
    await new Promise(r => setTimeout(r, 60));
    document.dispatchEvent(new PointerEvent('pointerup', o));
    await new Promise(r => setTimeout(r, 120));
    document.querySelector('.cell[data-r="7"][data-c="7"]').click();
    await new Promise(r => setTimeout(r, 160));
    const s = window.BlokDebug.snapshot();
    return {
      score: s.players[0].score,
      texts: [...document.querySelectorAll('.fx-text')].map((el) => el.textContent),
      shaking: document.documentElement.classList.contains('screen-shake'),
      crossFlash: !!document.querySelector('.fx-flash.cross'),
      perfectText: !!document.querySelector('.fx-text.perfect')
    };
  })()`);
  ok("satır + sütun patlaması PERFECT ve ekran parlaması veriyor",
    crossFeedback.score >= 100 && crossFeedback.shaking && crossFeedback.crossFlash &&
    crossFeedback.perfectText &&
    crossFeedback.texts.indexOf("PERFECT!") >= 0, crossFeedback);

  await a.evaluate(`(async () => {
    document.getElementById('exit-btn').click();
    await new Promise(r => setTimeout(r, 250));
    const confirm = document.querySelector('[data-confirm]');
    if (confirm) confirm.click();
    await new Promise(r => setTimeout(r, 700));
    return true;
  })()`);

  /* ---- rastgele eşleşme (iki sekme) ---- */
  await a.evaluate(`document.getElementById('player-name').value = 'Rastgele A';`);
  await b.evaluate(`document.getElementById('player-name').value = 'Rastgele B';`);
  await a.evaluate(`document.getElementById('quick-match').click()`);
  await wait(300);
  const waiting = await a.evaluate(`(async () => {
    await new Promise(r => setTimeout(r, 400));
    const btn = document.getElementById('quick-match');
    return { screen: document.getElementById('screen-home').hidden ? 'other' : 'home',
             text: btn.textContent, pressed: btn.getAttribute('aria-pressed') };
  })()`);
  ok("ilk oyuncu eşleşme kuyruğunda bekliyor",
    waiting.screen === "home" && /iptal/i.test(waiting.text) && waiting.pressed === "true", waiting);

  await b.evaluate(`document.getElementById('quick-match').click()`);
  await wait(1600);
  const matched = await Promise.all([a, b].map((page) => page.evaluate(`(async () => {
    await new Promise(r => setTimeout(r, 400));
    const s = window.BlokDebug.snapshot();
    const stage = document.getElementById('duel-stage');
    return { game: !document.getElementById('screen-game').hidden, mode: s.mode,
             players: s.players.length, room: window.BlokDebug.status().room,
             peer: !!document.getElementById('board-rival'),
             stage: !!stage,
             cards: stage ? stage.querySelectorAll('.duel-card').length : 0,
             front: stage ? stage.querySelectorAll('.duel-card.is-front').length : 0 };
  })()`)));
  ok("rastgele eşleşme iki oyuncuyu aynı oyuna koydu",
    matched[0].game && matched[1].game && matched[0].mode === "versus" &&
    matched[0].players === 2 && matched[1].players === 2 &&
    matched[0].room && matched[0].room === matched[1].room, matched);
  ok("eşleşen oyunda iki tahta tek sahnede, sıradaki önde görünüyor",
    matched[0].peer && matched[1].peer &&
    matched[0].stage && matched[1].stage &&
    matched[0].cards === 2 && matched[1].cards === 2 &&
    matched[0].front === 1 && matched[1].front === 1, matched);

  a.close();
  b.close();
  console.log("\nÇevrimiçi akış testi geçti (" + step + " kontrol).");
}

main().then(() => {
  if (chrome) chrome.kill();
  server.kill();
  process.exit(0);
}).catch((error) => {
  console.error("\nTEST BAŞARISIZ:", error.message);
  if (chrome) chrome.kill();
  server.kill();
  process.exit(1);
});
