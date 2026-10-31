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
    if (ready) return;
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

  /* ---- oda kur / katıl ---- */
  await a.evaluate(`document.getElementById('player-name').value = 'Ada';`);
  const created = await a.evaluate(`(async () => {
    document.getElementById('player-name').value = 'Ada';
    document.querySelector('[data-host="coop"]').click();
    await new Promise(r => setTimeout(r, 1200));
    return { screen: document.getElementById('screen-lobby').hidden ? 'home' : 'lobby',
             code: document.getElementById('lobby-code').textContent };
  })()`);
  ok("oda oluşturuldu", created.screen === "lobby" && /^[A-Z0-9]{5}$/.test(created.code), created);
  const code = created.code;

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
    const mv = window.BlokIki.botMove(s0.shared.board, s0.shared.tray, 'hard');
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
    const mv = window.BlokIki.botMove(s0.shared.board, s0.shared.tray, 'hard');
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
    await new Promise(r => setTimeout(r, 1200));
    document.getElementById('start-btn');
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
    const mv = window.BlokIki.botMove(s0.players[0].board, s0.players[0].tray, 'hard');
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
