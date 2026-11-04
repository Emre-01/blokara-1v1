/* Headless Chrome probe: emulate a device viewport, evaluate JS, screenshot.
   node test/probe.cjs <width> <height> <url> [--shot out.png] */
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const width = Number(process.argv[2] || 412);
const height = Number(process.argv[3] || 915);
const url = process.argv[4] || "http://127.0.0.1:8080/";
const shotIndex = process.argv.indexOf("--shot");
const shotPath = shotIndex > 0 ? process.argv[shotIndex + 1] : null;
const evalIndex = process.argv.indexOf("--eval");
const evalFile = evalIndex > 0 ? process.argv[evalIndex + 1] : null;
const outIndex = process.argv.indexOf("--out");
const outPath = outIndex > 0 ? process.argv[outIndex + 1] : null;
const scaleIndex = process.argv.indexOf("--scale");
const scale = scaleIndex > 0 ? Number(process.argv[scaleIndex + 1]) || 2 : 2;
const fullIndex = process.argv.indexOf("--full");
const fullPage = fullIndex > 0;
const transparent = process.argv.indexOf("--transparent") > 0;
const port = 9500 + Math.floor(Math.random() * 300);

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = path.join(os.tmpdir(), "blok-probe-" + Date.now());
const logFile = path.join(os.tmpdir(), "blok-probe.log");
const log = fs.openSync(logFile, "w");

const chrome = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--remote-debugging-port=" + port,
  "--user-data-dir=" + profile,
  "--no-first-run",
  "--no-default-browser-check",
  "about:blank"
], { stdio: ["ignore", log, log] });

function getJson(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: p }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(JSON.parse(body)));
    }).on("error", reject);
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitForTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await getJson("/json/list");
      const page = list.find((t) => t.type === "page");
      if (page) return page;
    } catch (error) { /* not up yet */ }
    await sleep(250);
  }
  throw new Error("CDP not ready");
}

(async () => {
  try {
    const page = await waitForTarget();
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();
    const send = (method, params) => new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
    });
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const entry = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) entry.reject(new Error(msg.error.message));
        else entry.resolve(msg.result);
      }
    });
    await new Promise((resolve) => ws.addEventListener("open", resolve));

    await send("Page.enable");
    await send("Runtime.enable");
    if (transparent) {
      await send("Emulation.setDefaultBackgroundColorOverride", {
        color: { r: 0, g: 0, b: 0, a: 0 }
      });
    }
    await send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: scale, mobile: true
    });
    await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

    await send("Page.navigate", { url });
    await sleep(2600);

    let expression = "1";
    if (evalFile) expression = fs.readFileSync(evalFile, "utf8");
    const res = await send("Runtime.evaluate", {
      expression, returnByValue: true, awaitPromise: true
    });
    if (res.exceptionDetails) {
      console.error("EVAL ERROR", JSON.stringify(res.exceptionDetails.exception));
    } else {
      const text = JSON.stringify(res.result.value, null, 2);
      if (outPath) {
        fs.writeFileSync(outPath, text, "utf8");
        console.log("out:", outPath);
      } else {
        console.log(text);
      }
    }

    if (shotPath) {
      const shot = await send("Page.captureScreenshot", fullPage
        ? { format: "png", captureBeyondViewport: true }
        : { format: "png" });
      fs.writeFileSync(shotPath, Buffer.from(shot.data, "base64"));
      console.log("shot:", shotPath);
    }
    ws.close();
    chrome.kill();
    process.exit(0);
  } catch (error) {
    console.error("probe failed:", error.message);
    chrome.kill();
    process.exit(1);
  }
})();
