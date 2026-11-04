/* Blokara 1v1 — 7/24 bekçi (guard) süreci.
   Sunucuyu ayrı bir çocuk süreçte çalıştırır; çökerse, takılırsa ya da
   yanıt vermeyi bırakırsa kendiliğinden yeniden başlatır.

   Kullanım:
     node server-guard.cjs            # PORT=8080
     PORT=8123 node server-guard.cjs

   Tek örnek: aynı anda iki bekçi çalışmaz (logs/guard.pid kilidi).
   Günlük: logs/server.log (2 MB'ı geçince döndürülür). */
"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || "0.0.0.0";
const HEALTH_URL = "http://127.0.0.1:" + PORT + "/healthz";

const LOG_DIR = path.join(ROOT, "logs");
const LOG_FILE = path.join(LOG_DIR, "server.log");
const LOCK_FILE = path.join(LOG_DIR, "guard.pid");
const MAX_LOG_BYTES = 2 * 1024 * 1024;

/* Sağlık kontrolü: 15 sn'de bir, 4 sn zaman aşımı, üst üste 3 hatada yeniden başlat. */
const CHECK_INTERVAL = 15000;
const CHECK_TIMEOUT = 4000;
const CHECK_FAILS_BEFORE_RESTART = 3;
/* Çökme döngüsünde makineyi yormamak için artan bekleme (en fazla 30 sn). */
const MIN_BACKOFF = 1000;
const MAX_BACKOFF = 30000;

fs.mkdirSync(LOG_DIR, { recursive: true });

function rotateLog() {
  try {
    const stat = fs.statSync(LOG_FILE);
    if (stat.size > MAX_LOG_BYTES) fs.renameSync(LOG_FILE, LOG_FILE + ".1");
  } catch (ignored) {
    /* dosya henüz yok */
  }
}

function log(message) {
  const line = "[" + new Date().toISOString() + "] " + message;
  console.log(line);
  try {
    rotateLog();
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch (ignored) {
    /* günlük yazılamazsa konsol yeterli */
  }
}

/* --- Tek örnek kilidi ---------------------------------------------- */
function processAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

/* Linux'ta pid yeniden kullanılmış olabilir; komut satırına bakıp doğrularız. */
function isOurGuard(pid) {
  if (!processAlive(pid)) return false;
  if (process.platform !== "linux") return true;
  try {
    const cmdline = fs.readFileSync("/proc/" + pid + "/cmdline", "utf8");
    return cmdline.indexOf("server-guard") >= 0;
  } catch (ignored) {
    return false;
  }
}

function claimLock() {
  try {
    const previous = Number(fs.readFileSync(LOCK_FILE, "utf8").trim());
    if (previous && previous !== process.pid && isOurGuard(previous)) {
      log("Başka bir bekçi zaten çalışıyor (pid " + previous + "). Bu örnek kapanıyor.");
      return false;
    }
  } catch (ignored) {
    /* kilit yok */
  }
  fs.writeFileSync(LOCK_FILE, String(process.pid));
  return true;
}

function releaseLock() {
  try {
    const owner = Number(fs.readFileSync(LOCK_FILE, "utf8").trim());
    if (owner === process.pid) fs.unlinkSync(LOCK_FILE);
  } catch (ignored) {
    /* zaten silinmiş */
  }
}

if (!claimLock()) process.exit(1);

/* --- Sunucu süreci -------------------------------------------------- */
let child = null;
let stopping = false;
let backoff = MIN_BACKOFF;
let restarts = 0;
let healthFails = 0;
let childStartedAt = 0;

function startServer() {
  if (stopping) return;
  childStartedAt = Date.now();
  healthFails = 0;

  child = spawn(process.execPath, [path.join(ROOT, "server.cjs")], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { PORT: String(PORT), HOST: HOST }),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  log("Sunucu başlatıldı (pid " + child.pid + ", port " + PORT + ").");

  const relay = (stream, label) => {
    let buffer = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      buffer += chunk;
      let cut;
      while ((cut = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, cut).trimEnd();
        buffer = buffer.slice(cut + 1);
        if (line) log(label + line);
      }
    });
  };
  relay(child.stdout, "");
  relay(child.stderr, "[hata] ");

  child.on("error", (error) => {
    log("Sunucu süreci başlatılamadı: " + error.message);
  });

  child.on("exit", (code, signal) => {
    const lived = Date.now() - childStartedAt;
    child = null;
    if (stopping) return;

    /* Uzun süre ayakta kalan sunucu "sağlıklı" sayılır; beklemeyi sıfırla. */
    if (lived > 60000) backoff = MIN_BACKOFF;
    restarts += 1;

    log(
      "Sunucu durdu (kod=" + code + ", sinyal=" + (signal || "-") + ", " +
      Math.round(lived / 1000) + " sn ayakta). " +
      Math.round(backoff / 1000) + " sn sonra yeniden başlatılacak. Toplam yeniden başlatma: " + restarts
    );

    const wait = backoff;
    backoff = Math.min(backoff * 2, MAX_BACKOFF);
    setTimeout(startServer, wait);
  });
}

/* --- Sağlık bekçisi ------------------------------------------------- */
function checkHealth() {
  return new Promise((resolve) => {
    const request = http.get(HEALTH_URL, { timeout: CHECK_TIMEOUT }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

let checkRunning = false;
setInterval(async () => {
  if (stopping || !child || checkRunning) return;
  /* Yeni başlayan sunucuya nefes payı. */
  if (Date.now() - childStartedAt < 10000) return;

  checkRunning = true;
  let healthy = false;
  try {
    healthy = await checkHealth();
  } finally {
    checkRunning = false;
  }

  if (healthy) {
    if (healthFails > 0) log("Sunucu yeniden sağlıklı yanıt veriyor.");
    healthFails = 0;
    return;
  }

  healthFails += 1;
  log("Sağlık kontrolü başarısız (" + healthFails + "/" + CHECK_FAILS_BEFORE_RESTART + ").");

  if (healthFails >= CHECK_FAILS_BEFORE_RESTART && child) {
    log("Sunucu yanıt vermiyor; süreç zorla yeniden başlatılıyor.");
    healthFails = 0;
    try {
      child.kill("SIGKILL");
    } catch (ignored) {
      /* zaten kapanmış olabilir */
    }
  }
}, CHECK_INTERVAL).unref();

/* --- Kapanış -------------------------------------------------------- */
function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log("Kapanış sinyali (" + signal + "); sunucu durduruluyor.");
  if (child) {
    try {
      child.kill("SIGTERM");
    } catch (ignored) {
      /* zaten kapandı */
    }
    /* Nazik kapanışa 5 sn tanı, sonra zorla. */
    const hardStop = setTimeout(() => {
      if (child) {
        try {
          child.kill("SIGKILL");
        } catch (ignored) {
          /* yoksay */
        }
      }
      releaseLock();
      process.exit(0);
    }, 5000);
    hardStop.unref();
  } else {
    releaseLock();
    process.exit(0);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("exit", releaseLock);
process.on("uncaughtException", (error) => {
  log("Bekçide beklenmeyen hata: " + (error && error.stack ? error.stack : String(error)));
});

log("Blokara 1v1 bekçisi açıldı (pid " + process.pid + ", port " + PORT + ").");
startServer();
