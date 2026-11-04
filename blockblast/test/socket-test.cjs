/* Blokara 1v1 sunucu testi — node test/socket-test.cjs  (sunucu 8099'da ayağa kalkar) */
"use strict";

const { spawn } = require("child_process");
const path = require("path");
const assert = require("assert");

// Node 20'de WebSocket deneysel bayrakla gelir; gerekirse kendini yeniden başlatır.
if (typeof WebSocket === "undefined") {
  const child = spawn(process.execPath, ["--experimental-websocket", __filename], { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code || 0));
  return;
}

const PORT = 8099;
const URL = "ws://127.0.0.1:" + PORT + "/ws";
const server = spawn(process.execPath, [path.join(__dirname, "..", "server.cjs")], {
  env: Object.assign({}, process.env, { PORT: String(PORT), HOST: "127.0.0.1" }),
  stdio: ["ignore", "pipe", "pipe"]
});

server.stdout.on("data", (d) => process.stdout.write("[server] " + d));
server.stderr.on("data", (d) => process.stderr.write("[server] " + d));

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const inbox = [];
    const waiters = [];
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      const index = waiters.findIndex((w) => w.match(msg));
      if (index >= 0) {
        const waiter = waiters.splice(index, 1)[0];
        clearTimeout(waiter.timer);
        waiter.resolve(msg);
      } else {
        inbox.push(msg);
      }
    });
    ws.addEventListener("open", () => resolve({
      ws,
      send: (obj) => ws.send(JSON.stringify(obj)),
      next: (match, timeout) => new Promise((res, rej) => {
        const found = inbox.findIndex(match);
        if (found >= 0) return res(inbox.splice(found, 1)[0]);
        const waiter = { match, resolve: res };
        waiter.timer = setTimeout(() => {
          const i = waiters.indexOf(waiter);
          if (i >= 0) waiters.splice(i, 1);
          rej(new Error("Zaman aşımı: " + match));
        }, timeout || 3000);
        waiters.push(waiter);
      }),
      close: () => ws.close()
    }));
    ws.addEventListener("error", () => reject(new Error("bağlantı hatası")));
  });
}

const isState = (msg) => msg.t === "state";
const isWelcome = (msg) => msg.t === "welcome";

async function main() {
  await wait(600);

  /* ---------- rakip modu ---------- */
  const a = await connect();
  a.send({ t: "create", mode: "versus", name: "Ada" });
  const welcomeA = await a.next(isWelcome);
  assert.strictEqual(welcomeA.you, 0);
  assert.strictEqual(welcomeA.state.phase, "lobby");
  assert.strictEqual(welcomeA.state.mode, "versus");
  const code = welcomeA.code;
  assert.match(code, /^[A-Z0-9]{5}$/);

  const b = await connect();
  b.send({ t: "join", code, name: "Efe" });
  const welcomeB = await b.next(isWelcome);
  assert.strictEqual(welcomeB.you, 1);
  assert.strictEqual(welcomeB.state.players.length, 2);

  // oda sahibi olmayan başlatamaz
  b.send({ t: "start" });
  const denied = await b.next((m) => m.t === "error" && /oda sahibi/i.test(m.message));
  assert.ok(/oda sahibi/i.test(denied.message));

  a.send({ t: "start" });
  const started = await a.next((m) => isState(m) && m.state.phase === "playing");
  assert.strictEqual(started.state.phase, "playing");
  const startedB = await b.next((m) => isState(m) && m.state.phase === "playing");
  assert.strictEqual(startedB.state.mode, "versus");
  assert.ok(Array.isArray(startedB.state.players[1].board));

  // iki oyuncunun blok dizisi aynı olmalı
  assert.deepStrictEqual(
    started.state.players[0].tray.map((p) => p.shape),
    started.state.players[1].tray.map((p) => p.shape)
  );

  // oyuncu 1 (Ada) geçerli hamle yapar
  const trayA = started.state.players[0].tray;
  let placed = false;
  for (let p = 0; p < trayA.length && !placed; p++) {
    for (let r = 7; r >= 0 && !placed; r--) {
      for (let c = 7; c >= 0 && !placed; c--) {
        a.send({ t: "move", piece: p, row: r, col: c });
        try {
          const msg = await a.next((m) => (m.t === "state" && m.state.phase === "playing") || m.t === "error", 700);
          if (msg.t === "state") {
            placed = true;
            assert.ok(msg.state.players[0].blocks > 0);
            const seen = await b.next((m) => m.t === "state" && m.state.phase === "playing");
            assert.strictEqual(seen.state.players[0].blocks, msg.state.players[0].blocks);
          }
        } catch (error) { /* sığmadı, devam */ }
      }
    }
  }
  assert.ok(placed, "hiçbir hamle kabul edilmedi");

  // rakip modunda sıra yok: Efe de aynı anda oynayabilir
  const trayB = startedB.state.players[1].tray;
  let placedB = false;
  for (let p = 0; p < trayB.length && !placedB; p++) {
    for (let r = 0; r < 8 && !placedB; r++) {
      for (let c = 0; c < 8 && !placedB; c++) {
        b.send({ t: "move", piece: p, row: r, col: c });
        try {
          const msg = await b.next((m) => (m.t === "state" && m.state.players[1].blocks > 0) || m.t === "error", 600);
          if (msg.t === "state") {
            placedB = true;
            assert.ok(msg.state.players[1].blocks > 0);
            await a.next((m) => m.t === "state" && m.state.players[1].blocks > 0);
          }
        } catch (error) { /* sığmadı, devam */ }
      }
    }
  }
  assert.ok(placedB, "rakip hamlesi kabul edilmedi");

  // yeniden bağlanma: b'nin oturumu ile yeni socket
  const tokenB = welcomeB.token;
  const b2 = await connect();
  b2.send({ t: "rejoin", code, token: tokenB });
  const welcomeB2 = await b2.next(isWelcome);
  assert.strictEqual(welcomeB2.you, 1);
  assert.strictEqual(welcomeB2.state.phase, "playing");
  assert.strictEqual(welcomeB2.state.players[1].name, "Efe");
  assert.ok(welcomeB2.state.players[1].blocks > 0);

  // ayrılma: oyun biter, kazanan rakip
  b2.send({ t: "leave" });
  await b2.next((m) => m.t === "left");
  const over = await a.next((m) => isState(m) && m.state.phase === "over");
  assert.strictEqual(over.state.winner, 0);

  // yeniden başlatma (oda sahibi) — iki oyuncu da bağlı olmalı
  b2.send({ t: "rejoin", code, token: tokenB });
  await b2.next(isWelcome);
  a.send({ t: "rematch" });
  const restarted = await a.next((m) => isState(m) && m.state.phase === "playing" && m.state.players.every((p) => p.score === 0));
  assert.strictEqual(restarted.state.players[0].score, 0);
  assert.strictEqual(restarted.state.players[1].score, 0);

  a.close();
  b.close();
  await wait(200);

  /* ---------- lobide yeniden bağlanma (eski socket hâlâ açıkken) ---------- */
  const e = await connect();
  e.send({ t: "create", mode: "coop", name: "Ece" });
  const welcomeE = await e.next(isWelcome);
  const e2 = await connect();
  e2.send({ t: "rejoin", code: welcomeE.code, token: welcomeE.token });
  const welcomeE2 = await e2.next(isWelcome);
  assert.strictEqual(welcomeE2.you, 0);
  assert.strictEqual(welcomeE2.state.players.length, 1);
  assert.strictEqual(welcomeE2.state.players[0].name, "Ece");
  const kicked = await e.next((m) => m.t === "error" && /başka bir cihaz/.test(m.message));
  assert.ok(/başka bir cihaz/.test(kicked.message));
  e2.close();
  await wait(150);

  /* ---------- ortak tahta + kurallar ---------- */
  const c = await connect();
  c.send({ t: "create", mode: "coop", name: "Deniz" });
  const welcomeC = await c.next(isWelcome);
  assert.strictEqual(welcomeC.state.mode, "coop");
  const coopCode = welcomeC.code;

  const d = await connect();
  d.send({ t: "join", code: coopCode, name: "Can" });
  await d.next(isWelcome);

  // modu sadece oda sahibi değiştirebilir
  d.send({ t: "mode", mode: "versus" });
  const modeError = await d.next((m) => m.t === "error" && /oda sahibi/i.test(m.message));
  assert.ok(/oda sahibi/i.test(modeError.message));

  d.send({ t: "join", code: "ZZZZZ", name: "Yanlış" });
  const badJoin = await d.next((m) => m.t === "error" && /oda yok/i.test(m.message));
  assert.ok(/oda yok/i.test(badJoin.message));

  c.send({ t: "start" });
  const coopStart = await c.next((m) => isState(m) && m.state.phase === "playing");
  assert.strictEqual(coopStart.state.turnBased, true);
  assert.ok(coopStart.state.shared);
  assert.ok(Array.isArray(coopStart.state.shared.board));

  // sıra Deniz'de; Can hamle yapamaz
  d.send({ t: "move", piece: 0, row: 0, col: 0 });
  const notYours = await d.next((m) => m.t === "error" && /Sıra/.test(m.message));
  assert.ok(/Sıra/.test(notYours.message));

  // Deniz hamle yapar, sıra Can'a geçer
  const coopTray = coopStart.state.shared.tray;
  let moved = false;
  for (let p = 0; p < coopTray.length && !moved; p++) {
    for (let r = 0; r < 8 && !moved; r++) {
      for (let col = 0; col < 8 && !moved; col++) {
        c.send({ t: "move", piece: p, row: r, col });
        const msg = await c.next(
          (m) => (m.t === "state" && m.state.phase === "playing" && m.state.seq > coopStart.state.seq) || m.t === "error",
          600
        ).catch(() => null);
        if (msg && msg.t === "state") {
          moved = true;
          assert.strictEqual(msg.state.turn, 1);
          const shared = msg.state.shared;
          assert.ok(shared.blocks > 0);
          const flat = shared.board.flat().filter(Boolean).length;
          assert.ok(flat > 0, "ortak tahtada blok yok");
        }
      }
    }
  }
  assert.ok(moved, "ortak modda hamle kabul edilmedi");

  // geçersiz mesaj türü
  c.send({ t: "hack" });
  const unknown = await c.next((m) => m.t === "error" && /Bilinmeyen/.test(m.message));
  assert.ok(/Bilinmeyen/.test(unknown.message));

  c.close();
  d.close();
  await wait(200);

  /* ---------- süre modu ve sunucu saati ---------- */
  const f = await connect();
  f.send({ t: "create", mode: "versus", name: "Süre" });
  const welcomeF = await f.next(isWelcome);
  assert.strictEqual(welcomeF.state.timeMode, "shared");
  assert.strictEqual(welcomeF.state.timeLeft, 120);

  const g = await connect();
  g.send({ t: "join", code: welcomeF.code, name: "Sayaç" });
  const welcomeG = await g.next(isWelcome);

  // süre modunu sadece oda sahibi seçer
  g.send({ t: "timer", mode: "turn" });
  const timerDenied = await g.next((m) => m.t === "error" && /süre modunu/i.test(m.message));
  assert.ok(/süre modunu/i.test(timerDenied.message), "oyuncu 2 süre modunu değiştirememeli");

  f.send({ t: "timer", mode: "turn" });
  const timerStateF = await f.next((m) => isState(m) && m.state.timeMode === "turn");
  assert.strictEqual(timerStateF.state.timeMode, "turn");
  await g.next((m) => isState(m) && m.state.timeMode === "turn");

  f.send({ t: "start" });
  const timed = await f.next((m) => isState(m) && m.state.phase === "playing");
  assert.strictEqual(timed.state.timeMode, "turn");
  assert.strictEqual(timed.state.timeLimit, 120);
  assert.strictEqual(timed.state.turnLimit, 30);

  f.close();
  g.close();
  await wait(200);

  /* ---------- ortak sayaç sunucuda akıyor ---------- */
  const h = await connect();
  h.send({ t: "create", mode: "versus", name: "Akış" });
  const welcomeH = await h.next(isWelcome);
  const i = await connect();
  i.send({ t: "join", code: welcomeH.code, name: "Sayaç" });
  await i.next(isWelcome);

  h.send({ t: "start" });
  const sharedStart = await h.next((m) => isState(m) && m.state.phase === "playing");
  assert.strictEqual(sharedStart.state.timeMode, "shared");
  const ticked = await h.next(
    (m) => isState(m) && m.state.phase === "playing" && m.state.timeLeft != null && m.state.timeLeft < 120,
    4000
  );
  assert.ok(ticked.state.timeLeft < 120, "sunucu saati akmıyor");

  // oyun sırasında süre modu değiştirilemez
  h.send({ t: "timer", mode: "none" });
  const late = await h.next((m) => isState(m) && m.state.timeMode === "none", 900).catch(() => null);
  assert.strictEqual(late, null, "oyun sırasında süre modu değişmemeli");

  h.close();
  i.close();
  await wait(200);

  /* ---------- rastgele eşleşme ---------- */
  const m1 = await connect();
  m1.send({ t: "quickmatch", name: "Rastgele 1", mode: "versus" });
  const queued = await m1.next((m) => m.t === "queued");
  assert.strictEqual(queued.waiting, 1);

  const m2 = await connect();
  m2.send({ t: "quickmatch", name: "Rastgele 2", mode: "versus" });
  const matched1 = await m1.next(isWelcome);
  const matched2 = await m2.next(isWelcome);
  assert.strictEqual(matched1.state.phase, "playing");
  assert.strictEqual(matched2.state.phase, "playing");
  assert.strictEqual(matched1.state.mode, "versus");
  assert.strictEqual(matched1.state.players.length, 2);
  assert.strictEqual(matched1.you, 0);
  assert.strictEqual(matched2.you, 1);
  assert.strictEqual(matched1.state.players[0].name, "Rastgele 1");
  assert.strictEqual(matched2.state.players[1].name, "Rastgele 2");
  assert.strictEqual(matched1.code, matched2.code);
  assert.ok(Array.isArray(matched2.state.players[1].board));

  // eşleşen oyun normal akışla oynanabilir
  const quickTray = matched2.state.players[1].tray;
  let quickMoved = false;
  for (let p = 0; p < quickTray.length && !quickMoved; p++) {
    for (let r = 0; r < 8 && !quickMoved; r++) {
      for (let c = 0; c < 8 && !quickMoved; c++) {
        m2.send({ t: "move", piece: p, row: r, col: c });
        const moved = await m2.next(
          (m) => (m.t === "state" && m.state.players[1].blocks > 0) || m.t === "error",
          700
        ).catch(() => null);
        if (moved && moved.t === "state") quickMoved = true;
      }
    }
  }
  assert.ok(quickMoved, "eşleşen oyunda hamle kabul edilmedi");

  // kuyruktan iptal
  const m3 = await connect();
  m3.send({ t: "quickmatch", name: "İptal", mode: "versus" });
  await m3.next((m) => m.t === "queued");
  m3.send({ t: "cancelmatch" });
  const cancelled = await m3.next((m) => m.t === "matchcancel");
  assert.strictEqual(cancelled.t, "matchcancel");

  m1.close();
  m2.close();
  m3.close();
  await wait(200);

  /* ---------- arkadaşlar: durum, arama ve davet ---------- */
  const f1 = await connect();
  f1.send({ t: "presence", code: "K7M2QX", name: "Ada" });
  const presenceAck = await f1.next((m) => m.t === "presence");
  assert.strictEqual(presenceAck.ok, true);
  assert.strictEqual(presenceAck.code, "K7M2QX");

  const f2 = await connect();
  f2.send({ t: "presence", code: "p-3", name: "Efe" });
  const badCode = await f2.next((m) => m.t === "presence");
  assert.strictEqual(badCode.ok, false, "geçersiz kod reddedilmeli");

  f2.send({ t: "lookup", code: "k7m2qx" });
  const found = await f2.next((m) => m.t === "lookup");
  assert.strictEqual(found.online, true);
  assert.strictEqual(found.name, "Ada");

  f2.send({ t: "lookup", code: "ZZZZZZ" });
  const missing = await f2.next((m) => m.t === "lookup");
  assert.strictEqual(missing.online, false);

  // Davet için gerçek bir oda gerekir.
  f2.send({ t: "create", mode: "versus", name: "Efe" });
  const inviteRoom = await f2.next(isWelcome);

  f2.send({ t: "invite", to: "K7M2QX", code: inviteRoom.code });
  const invited = await f2.next((m) => m.t === "invited");
  assert.strictEqual(invited.ok, true);
  const incoming = await f1.next((m) => m.t === "invite");
  assert.strictEqual(incoming.code, inviteRoom.code);
  assert.strictEqual(incoming.from, "Efe");
  assert.strictEqual(incoming.mode, "versus");

  // Çevrimdışı arkadaşa davet hata döndürür.
  f2.send({ t: "invite", to: "ZZZZZZ", code: inviteRoom.code });
  const offlineInvite = await f2.next((m) => m.t === "invited");
  assert.strictEqual(offlineInvite.ok, false);

  // Bağlantı kapanınca durum temizlenir; son bilinen ad korunur.
  f1.close();
  await wait(200);
  f2.send({ t: "lookup", code: "K7M2QX" });
  const gone = await f2.next((m) => m.t === "lookup");
  assert.strictEqual(gone.online, false);
  assert.strictEqual(gone.name, "Ada", "çevrimdışı arkadaşın son adı korunmalı");

  f2.close();
  await wait(150);

  console.log("\nTüm sunucu testleri geçti.");
}

main().then(() => {
  server.kill();
  process.exit(0);
}).catch((error) => {
  console.error("\nTEST BAŞARISIZ:", error);
  server.kill();
  process.exit(1);
});
