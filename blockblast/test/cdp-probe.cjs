"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = path.join(os.tmpdir(), "blok-cdp2-" + Date.now());
const log = fs.openSync(path.join(os.tmpdir(), "blok-cdp2.log"), "w");

const chrome = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--remote-debugging-port=9444",
  "--user-data-dir=" + profile,
  "--no-first-run",
  "http://127.0.0.1:8080/"
], { stdio: ["ignore", log, log] });

setTimeout(() => {
  httpsGet().then((data) => {
    const page = data.find((t) => t.type === "page");
    console.log("target:", page && page.url);
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: "document.title + ' | ' + location.href", returnByValue: true } }));
    });
    ws.addEventListener("message", (event) => {
      console.log(event.data);
      ws.close();
      chrome.kill();
      process.exit(0);
    });
  }).catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
}, 4000);

function httpsGet() {
  const http = require("http");
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port: 9444, path: "/json/list" }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(JSON.parse(body)));
    }).on("error", reject);
  });
}
