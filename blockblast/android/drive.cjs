/* Cihazdaki WebView'ı CDP ile sürer: online oyun akışını uçtan uca test eder.
   node android/drive.cjs "ifade"      → ifadeyi çalıştırır, sonucu yazar
   node android/drive.cjs --shot out.png
   SERIAL=R5CY34M4SGE node android/drive.cjs "1+1"   → gerçek telefonda çalışır
   CDP_PORT=9444 ...                                 → port çakışmasını önler */
"use strict";
const { spawnSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

if (typeof WebSocket === "undefined") {
  const { spawn } = require("child_process");
  const child = spawn(process.execPath, ["--experimental-websocket", __filename].concat(process.argv.slice(2)), { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code || 0));
  return;
}

const SDK = process.env.ANDROID_HOME || path.join(process.env.LOCALAPPDATA, "Android", "Sdk");
const ADB = path.join(SDK, "platform-tools", "adb.exe");
/* Cihaz seçimi: SERIAL=emulator-5554 | R5CY34M4SGE ...  Port: CDP_PORT */
const SERIAL = process.env.SERIAL || "emulator-5554";
const PORT = Number(process.env.CDP_PORT || 9333);

function adb(args) {
  const r = spawnSync(ADB, ["-s", SERIAL].concat(args), { encoding: "utf8" });
  if (r.error) throw r.error;
  return (r.stdout || "") + (r.stderr || "");
}

function getJsonOn(port, pathname) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: pathname }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on("error", reject);
  });
}

function getJson(pathname) {
  return getJsonOn(PORT, pathname);
}

async function waitForDevtools(port) {
  for (let i = 0; i < 60; i++) {
    try { return await getJsonOn(port, "/json/list"); } catch (e) { await new Promise((r) => setTimeout(r, 300)); }
  }
  throw new Error("DevTools köprüsü açılmadı");
}

async function main() {
  /* Başka uygulamaların WebView'ları da soket açar; sayfamızı barındıranı seçeriz. */
  const pkg = process.env.PKG || "tr.blokiki.app";
  const all = adb(["shell", "cat /proc/net/unix"]).split("\n").filter((l) => l.includes("webview_devtools_remote_"));
  if (!all.length) throw new Error("WebView hata ayıklama soketi yok. Uygulama açık mı?");

  /* Birden çok WebView olabilir (emülatörde başka uygulamalar da soket açar).
     Her soketi ayrı porta yönlendirip bizim sayfamızı barındıranı seçeriz. */
  let chosen = null;
  for (let i = 0; i < all.length; i++) {
    const socketName = all[i].trim().split("@")[1];
    if (!socketName) continue;
    adb(["forward", "tcp:" + (PORT + i), "localabstract:" + socketName]);
    let list = [];
    try { list = await getJsonOn(PORT + i, "/json/list"); } catch (e) { continue; }
    const page = list.find((t) => t.type === "page" && /android_asset\/(www|index)/.test(t.url || ""))
      || (process.env.PKG ? list.find((t) => t.type === "page" && /blok/i.test(t.title || "")) : null);
    if (page) { chosen = { socketName, port: PORT + i, page }; break; }
  }
  if (!chosen) throw new Error(pkg + " WebView'ı bulunamadı. Uygulama açık mı?");
  adb(["forward", "tcp:" + PORT, "localabstract:" + chosen.socketName]);

  await waitForDevtools(PORT);
  const page = chosen.page;

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error("CDP bağlantısı kurulamadı")), { once: true });
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

  const scriptArg = process.argv[2] || "1+1";
  const script = scriptArg.startsWith("@") ? fs.readFileSync(scriptArg.slice(1), "utf8") : scriptArg;
  if (script === "--shot") {
    const out = process.argv[3] || path.join(os.tmpdir(), "android-webview.png");
    const shot = await call("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(out, Buffer.from(shot.data, "base64"));
    console.log("kaydedildi: " + out);
  } else {
    const result = await call("Runtime.evaluate", {
      expression: script, awaitPromise: true, returnByValue: true
    });
    if (result.exceptionDetails) {
      console.error("JS hata:", JSON.stringify(result.exceptionDetails.exception || result.exceptionDetails));
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify(result.result && result.result.value, null, 2));
    }
  }
  ws.close();
}

main().then(() => process.exit(process.exitCode || 0)).catch((error) => {
  console.error("HATA:", error.message);
  process.exit(1);
});
