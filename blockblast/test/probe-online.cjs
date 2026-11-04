/* İki tarayıcı ile çevrimiçi rakip ekranını ölçer.
   Kullanım: node test/probe-online.js <w> <h> [--shot out.png] */
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const width = Number(process.argv[2] || 360);
const height = Number(process.argv[3] || 640);
const shotIndex = process.argv.indexOf("--shot");
const shotPath = shotIndex > 0 ? process.argv[shotIndex + 1] : null;
const BASE = process.argv[4] && !process.argv[4].startsWith("--") ? process.argv[4] : "http://127.0.0.1:8080";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function launch(port) {
  const profile = path.join(os.tmpdir(), "blok-onl-" + port + "-" + Date.now());
  const log = fs.openSync(path.join(os.tmpdir(), "blok-onl-" + port + ".log"), "w");
  const proc = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--remote-debugging-port=" + port, "--user-data-dir=" + profile,
    "--no-first-run", "--no-default-browser-check", "about:blank"
  ], { stdio: ["ignore", log, log] });
  return proc;
}

function getJson(port, p) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: p }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(JSON.parse(body)));
    }).on("error", reject);
  });
}

async function attach(port, w, h) {
  let page;
  for (let i = 0; i < 80; i++) {
    try {
      const list = await getJson(port, "/json/list");
      page = list.find((t) => t.type === "page");
      if (page) break;
    } catch (e) { /* bekle */ }
    await sleep(250);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
    }
  });
  const send = (method, params) => new Promise((resolve, reject) => {
    const mid = ++id; pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  const evaluate = async (expression) => {
    const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails.exception));
    return res.result.value;
  };
  return { send, evaluate, ws };
}

(async () => {
  const p1 = 9700 + Math.floor(Math.random() * 100);
  const p2 = p1 + 100;
  const host = launch(p1);
  const guest = launch(p2);
  try {
    const a = await attach(p1, width, height);
    const b = await attach(p2, width, height);
    await a.send("Page.navigate", { url: BASE + "/?test=1" });
    await b.send("Page.navigate", { url: BASE + "/?test=1" });
    await sleep(2600);

    const code = await a.evaluate(`(async () => {
      const n = document.getElementById('player-name');
      n.value = 'Ada'; n.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('[data-host="versus"]').click();
      await new Promise(r => setTimeout(r, 1600));
      return document.getElementById('lobby-code').textContent.trim();
    })()`);

    await b.evaluate(`(async () => {
      const n = document.getElementById('player-name');
      n.value = 'Efe'; n.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('[data-pane="join"]').click();
      await new Promise(r => setTimeout(r, 150));
      document.getElementById('join-code').value = '${code}';
      document.getElementById('join-btn').click();
      await new Promise(r => setTimeout(r, 1600));
      return true;
    })()`);

    await a.evaluate(`(async () => {
      document.getElementById('start-btn').click();
      await new Promise(r => setTimeout(r, 1800));
      return true;
    })()`);
    await sleep(1200);

    const measure = `(() => {
      const de = document.documentElement;
      const out = [];
      document.querySelectorAll('*').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if (r.left < -1 || r.right > innerWidth + 1) {
          out.push({ t: el.tagName.toLowerCase(), c: String(el.className||'').slice(0,34), i: el.id, l: Math.round(r.left), r: Math.round(r.right) });
        }
      });
      const board = document.querySelector('.board');
      const br = board ? board.getBoundingClientRect() : null;
      const rect = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height), pad: cs.padding, cols: cs.gridTemplateColumns, gap: cs.gap };
      };
      return {
        vw: innerWidth, docW: de.scrollWidth, hScroll: de.scrollWidth > innerWidth,
        gameScrollW: document.getElementById('screen-game').scrollWidth,
        gameClientW: document.getElementById('screen-game').clientWidth,
        board: br ? { l: Math.round(br.left), r: Math.round(br.right), w: Math.round(br.width) } : null,
        screen: rect('#screen-game'),
        scoreboard: rect('.scoreboard'),
        cards: [...document.querySelectorAll('.score-card')].map(c => { const r = c.getBoundingClientRect(); return { cls: c.className, l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) }; }),
        pill: rect('.turn-pill'),
        versus: rect('.online-versus'),
        peer: rect('.peer-panel'),
        out: out.slice(0, 12)
      };
    })()`;

    const resA = await a.evaluate(measure);
    const resB = await b.evaluate(measure);
    console.log(JSON.stringify({ code, host: resA, guest: resB }, null, 2));

    if (shotPath) {
      const shot = await b.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(shotPath, Buffer.from(shot.data, "base64"));
      console.log("shot:", shotPath);
    }
    a.ws.close(); b.ws.close();
    host.kill(); guest.kill();
    process.exit(0);
  } catch (err) {
    console.error("probe-online failed:", err.message);
    host.kill(); guest.kill();
    process.exit(1);
  }
})();
