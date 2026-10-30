/* Geliştirme aracı: mobil görünüm ölçümü + ekran görüntüsü (Chrome CDP).
   node --experimental-websocket test/inspect.cjs [url] [genişlik] [yükseklik] [çıktı.png] [js] */
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

const url = process.argv[2] || "http://127.0.0.1:8080/";
const width = Number(process.argv[3] || 390);
const height = Number(process.argv[4] || 844);
const outFile = process.argv[5] || path.join(os.tmpdir(), "blok-shot.png");
const scriptArg = process.argv[6] || "";
const script = scriptArg.startsWith("@") ? fs.readFileSync(scriptArg.slice(1), "utf8") : scriptArg;

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].find((p) => fs.existsSync(p));

const PORT = 9455 + (process.pid % 40);
const profile = path.join(os.tmpdir(), "blok-cdp-" + process.pid);
const chrome = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--remote-debugging-port=" + PORT,
  "--user-data-dir=" + profile,
  "--no-first-run",
  url
], { stdio: "ignore" });

function getJson(pathname) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port: PORT, path: pathname }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on("error", reject);
  });
}

async function waitForChrome() {
  for (let i = 0; i < 80; i++) {
    try { await getJson("/json/version"); return; } catch (e) { await new Promise((r) => setTimeout(r, 200)); }
  }
  throw new Error("Chrome açılmadı");
}

async function openSocket(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  return ws;
}

async function main() {
  await waitForChrome();
  const targets = await getJson("/json/list");
  const page = targets.find((t) => t.type === "page");
  const ws = await openSocket(page.webSocketDebuggerUrl);
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

  await call("Page.enable");
  await call("Runtime.enable");
  await call("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 2, mobile: width < 700
  });
  await call("Emulation.setTouchEmulationEnabled", { enabled: width < 700 });
  await call("Page.reload", { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 2200));

  if (script) {
    const result = await call("Runtime.evaluate", {
      expression: script, awaitPromise: true, returnByValue: true
    });
    if (result.exceptionDetails) console.error("JS hata:", JSON.stringify(result.exceptionDetails));
    console.log(JSON.stringify(result.result && result.result.value, null, 2));
  }

  const metrics = await call("Runtime.evaluate", {
    expression: `JSON.stringify({
      vw: document.documentElement.clientWidth,
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
      wide: [...document.querySelectorAll('body *')]
        .filter(el => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && el.getBoundingClientRect().width > 0)
        .slice(0, 10)
        .map(el => el.tagName + '.' + (typeof el.className === 'string' ? el.className : '') + '#' + el.id + ' w=' + Math.round(el.getBoundingClientRect().width))
    })`,
    returnByValue: true
  });
  console.log(metrics.result.value);

  const shot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(outFile, Buffer.from(shot.data, "base64"));
  console.log("kaydedildi: " + outFile);
  ws.close();
}

main().then(() => {
  chrome.kill();
  process.exit(0);
}).catch((error) => {
  console.error(error);
  chrome.kill();
  process.exit(1);
});
