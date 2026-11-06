/* Blokara 1v1 sunucusu — bağımlılık yok.
   Statik dosyaları servis eder ve oda tabanlı WebSocket multiplayer sağlar.
   Çalıştırma: node server.cjs   (PORT=8080) */
"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const GameCore = require("./public/game-core.js");

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_MESSAGE = 64 * 1024;
const ROOM_TTL = 20 * 60 * 1000;
const DISCONNECT_FORFEIT = 90 * 1000;

/* --- Kötüye kullanım sınırları -------------------------------------
   Herkese açık bir sunucuda sınırsız bağlantı/oda bellek tüketimiyle
   hizmeti düşürebilir. Bu değerler tek bir makinenin rahatça taşıdığı
   yükün üstünde; gerekirse ortam değişkeniyle büyütülür. */
const MAX_ROOMS = Number(process.env.MAX_ROOMS) || 400;
const MAX_CONNECTIONS = Number(process.env.MAX_CONNECTIONS) || 600;
const MAX_CONNECTIONS_PER_IP = Number(process.env.MAX_CONNECTIONS_PER_IP) || 6;
const JOIN_FAIL_WINDOW = 60 * 1000;
const JOIN_FAIL_LIMIT = Number(process.env.JOIN_FAIL_LIMIT) || 12;

/* Oyuncuların birbirine gönderebildiği dört emote (istemcideki listeyle
   aynı). Sıra: gülme, alkış, ağlama, kızma. */
const EMOTES = ["laugh", "clap", "cry", "angry", "love", "cool"];
const EMOTE_MIN_MS = 700;

/* WebSocket kaynağı: tarayıcılar Origin gönderir, Android WebView
   file:// için "null" gönderir. Listeye ek adresler ORIGINS ile verilir. */
const EXTRA_ORIGINS = String(process.env.ORIGINS || "")
  .split(",").map((value) => value.trim().replace(/\/+$/, "")).filter(Boolean);

/* Google istemci kimlikleri virgülle çoklu verilebilir (web + Android).
   Panelde tek bir web kimliği yeterliyse GOOGLE_CLIENT_ID kullanılır. */
const GOOGLE_CLIENT_IDS = String(
  process.env.GOOGLE_CLIENT_IDS || process.env.GOOGLE_CLIENT_ID || ""
).split(",").map((value) => value.trim()).filter(Boolean);
const GOOGLE_CLIENT_ID = GOOGLE_CLIENT_IDS[0] || "";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json"
};

/* Beklenmeyen hata süreci yarı ölü bırakmasın: günlüğe yaz ve çık.
   server-guard.cjs (ya da Render/Docker) temiz bir süreç başlatır. */
process.on("uncaughtException", (error) => {
  console.error("[kritik] yakalanmayan hata:", error && error.stack ? error.stack : error);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("[kritik] işlenmeyen söz reddi:", reason);
  process.exit(1);
});

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "X-Permitted-Cross-Domain-Policies": "none",
  "X-DNS-Prefetch-Control": "off",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), fullscreen=(self)",
  /* Uygulama satır içi stil özniteliği kullanıyor; betikler ayrı dosyada. */
  "Content-Security-Policy": [
    "default-src 'self'",
    /* Google Identity Services betiği ve çerçevesi ayrı kökenden gelir. */
    "script-src 'self' https://accounts.google.com",
    "style-src 'self' 'unsafe-inline' https://accounts.google.com",
    "img-src 'self' data: https:",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' ws: wss: https:",
    "frame-src https://accounts.google.com",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join("; ")
};

function securityHeaders(secure) {
  const headers = Object.assign({}, SECURITY_HEADERS);
  if (secure) headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  return headers;
}

/* Yalnızca herkese açık API uçları için CORS. APK file:// kaynağından
   (Origin: null) yapılan istekler bu başlıklarla kabul edilir; çerez veya
   kimlik bilgisi paylaşılmaz. */
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600"
  };
}

function isApiPath(url) {
  return url === "/api/config" || url === "/api/auth/google";
}

/* Google oturum doğrulamasını kötüye kullanıma karşı sınırla.
   Proxy arkasında tüm istekler aynı adresten gelebileceği için sınır
   kullanıcı başına değil, sunucu genelinde yüksek tutulur. */
const AUTH_WINDOW = 60 * 1000;
const AUTH_LIMIT = 60;
const authHits = new Map();

function authRateLimited(key) {
  const now = Date.now();
  let entry = authHits.get(key);
  if (!entry || now - entry.start > AUTH_WINDOW) {
    entry = { start: now, count: 0 };
    authHits.set(key, entry);
  }
  entry.count += 1;
  if (authHits.size > 2000) {
    for (const [ip, hit] of authHits) {
      if (now - hit.start > AUTH_WINDOW) authHits.delete(ip);
    }
  }
  return entry.count > AUTH_LIMIT;
}

function sendText(res, status, contentType, body) {
  res.writeHead(status, Object.assign({ "Content-Type": contentType }, securityHeaders(false)));
  res.end(body);
}

function readJsonBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on("data", (chunk) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > limit) {
        tooLarge = true;
        chunks.length = 0;
        reject(new Error("too-large"));
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (error) {
        reject(new Error("bad-json"));
      }
    });
    req.on("error", reject);
  });
}

/* ------------------------------------------------------------------ */
/* Google kimlik doğrulama                                             */
/* ------------------------------------------------------------------ */

/* Google'ın imza anahtarları önbelleklenir (1 saat). */
let googleKeys = { fetchedAt: 0, keys: [] };

async function getGoogleKeys() {
  if (googleKeys.keys.length && Date.now() - googleKeys.fetchedAt < 60 * 60 * 1000) {
    return googleKeys.keys;
  }
  const response = await fetch("https://www.googleapis.com/oauth2/v3/certs", {
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error("jwks");
  const body = await response.json();
  googleKeys = { fetchedAt: Date.now(), keys: Array.isArray(body.keys) ? body.keys : [] };
  return googleKeys.keys;
}

function b64urlToBuffer(value) {
  return Buffer.from(String(value).replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/* id_token imzasını, verenini, kitlesini ve süresini doğrular. */
async function verifyGoogleIdToken(idToken) {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) throw new Error("malformed");
  let header, payload;
  try {
    header = JSON.parse(b64urlToBuffer(parts[0]).toString("utf8"));
    payload = JSON.parse(b64urlToBuffer(parts[1]).toString("utf8"));
  } catch (error) {
    throw new Error("malformed");
  }
  if (header.alg !== "RS256") throw new Error("alg");

  const keys = await getGoogleKeys();
  const jwk = keys.find((key) => key.kid === header.kid) || keys[0];
  if (!jwk) throw new Error("kid");

  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(parts[0] + "." + parts[1]);
  verifier.end();
  const key = crypto.createPublicKey({ key: jwk, format: "jwk" });
  if (!verifier.verify(key, b64urlToBuffer(parts[2]))) throw new Error("signature");

  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com") {
    throw new Error("issuer");
  }
  if (typeof payload.exp !== "number" || payload.exp < now - 60) throw new Error("expired");
  if (typeof payload.iat === "number" && payload.iat > now + 300) throw new Error("iat");
  if (!payload.sub) throw new Error("subject");
  if (GOOGLE_CLIENT_IDS.length && GOOGLE_CLIENT_IDS.indexOf(payload.aud) < 0) throw new Error("audience");
  return payload;
}

async function verifyGoogleToken(req, res) {
  const secure = !!(req.socket && req.socket.encrypted);
  const json = (status, body) => {
    res.writeHead(status, Object.assign({ "Content-Type": "application/json; charset=utf-8" }, corsHeaders(), securityHeaders(secure)));
    res.end(JSON.stringify(body));
  };
  if (!GOOGLE_CLIENT_ID) {
    return json(503, { error: "not_configured", message: "Sunucuda GOOGLE_CLIENT_ID tanımlı değil." });
  }
  const clientKey = (req.socket && req.socket.remoteAddress) || "unknown";
  if (authRateLimited(clientKey)) {
    return json(429, { error: "rate_limited", message: "Çok fazla giriş denemesi. Biraz sonra tekrar dene." });
  }
  let body;
  try {
    body = await readJsonBody(req, 16 * 1024);
  } catch (error) {
    if (error.message === "too-large") {
      return json(413, { error: "too_large", message: "İstek çok büyük." });
    }
    return json(400, { error: "body", message: "İstek okunamadı." });
  }
  try {
    const claims = await verifyGoogleIdToken(body.credential || body.id_token);
    return json(200, {
      sub: claims.sub,
      name: claims.name || claims.given_name || "",
      given_name: claims.given_name || "",
      picture: claims.picture || "",
      email_verified: !!claims.email_verified
    });
  } catch (error) {
    return json(401, { error: "invalid_token", message: "Google oturumu doğrulanamadı." });
  }
}

async function handleRequest(req, res) {
  const secure = !!(req.socket && req.socket.encrypted);
  const method = String(req.method || "GET").toUpperCase();

  /* Sorgu dizesi yolu etkilemez; API karşılaştırmaları için temizle. */
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  } catch (error) {
    return sendText(res, 400, "text/plain; charset=utf-8", "Bad request");
  }

  /* API ön kontrolü (CORS preflight). */
  if (method === "OPTIONS" && isApiPath(pathname)) {
    res.writeHead(204, Object.assign({}, corsHeaders(), securityHeaders(secure)));
    return res.end();
  }

  if (method !== "GET" && method !== "HEAD" && !(method === "POST" && pathname === "/api/auth/google")) {
    res.writeHead(405, Object.assign({ "Allow": "GET, HEAD, POST, OPTIONS", "Content-Type": "text/plain" }, securityHeaders(secure)));
    return res.end("Method not allowed");
  }

  if (pathname === "/healthz") {
    res.writeHead(200, Object.assign({ "Content-Type": "text/plain" }, securityHeaders(secure)));
    return res.end("ok");
  }

  /* İstemcinin Google düğmesini çizebilmesi için genel yapılandırma.
     Gizli bilgi yok: istemci kimliği zaten herkese açıktır. */
  if (method === "GET" && pathname === "/api/config") {
    res.writeHead(200, Object.assign({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }, corsHeaders(), securityHeaders(secure)));
    return res.end(JSON.stringify({
      googleClientId: GOOGLE_CLIENT_ID,
      googleEnabled: !!GOOGLE_CLIENT_ID
    }));
  }

  if (method === "POST" && pathname === "/api/auth/google") {
    return verifyGoogleToken(req, res);
  }

  if (pathname === "/") pathname = "/index.html";
  const file = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) {
    return sendText(res, 403, "text/plain; charset=utf-8", "Forbidden");
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      return sendText(res, 404, "text/html; charset=utf-8", "<h1>404</h1><p><a href=\"/\">Blokara 1v1</a></p>");
    }
    /* Sürüm çakışmasını önle: HTML/JS/CSS her açılışta doğrulanır.
       Yalnızca içeriği hiç değişmeyen yazı tipi ve simgeler uzun süre
       önbelleklenir. */
    const longLived = pathname.startsWith("/fonts/") || pathname.startsWith("/icons/");
    res.writeHead(200, Object.assign({
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": longLived ? "public, max-age=31536000, immutable" : "no-cache"
    }, securityHeaders(secure)));
    res.end(method === "HEAD" ? undefined : data);
  });
}


let server;
if (process.env.SSL_KEY && process.env.SSL_CERT) {
  server = https.createServer({
    key: fs.readFileSync(process.env.SSL_KEY),
    cert: fs.readFileSync(process.env.SSL_CERT)
  }, handleRequest);
} else {
  server = http.createServer(handleRequest);
}

/* ------------------------------------------------------------------ */
/* Minimal WebSocket (RFC 6455)                                        */
/* ------------------------------------------------------------------ */

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function Connection(socket, onMessage, onClose) {
  this.socket = socket;
  this.buffer = Buffer.alloc(0);
  this.fragments = [];
  this.fragmentOpcode = 0;
  this.closed = false;
  this.player = null;
  this.lastMessage = Date.now();
  this.rateCount = 0;
  this.rateWindow = Date.now();
  this.onMessage = onMessage;
  this.onClose = onClose;
}

Connection.prototype.receive = function (chunk) {
  this.buffer = Buffer.concat([this.buffer, chunk]);
  while (this.buffer.length >= 2) {
    const b0 = this.buffer[0];
    const b1 = this.buffer[1];
    const fin = (b0 & 0x80) !== 0;
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let length = b1 & 0x7f;
    let offset = 2;
    if (length === 126) {
      if (this.buffer.length < 4) return;
      length = this.buffer.readUInt16BE(2);
      offset = 4;
    } else if (length === 127) {
      if (this.buffer.length < 10) return;
      const big = this.buffer.readBigUInt64BE(2);
      if (big > BigInt(MAX_MESSAGE)) return this.close(1009, "Çok büyük mesaj");
      length = Number(big);
      offset = 10;
    }
    if (length > MAX_MESSAGE) return this.close(1009, "Çok büyük mesaj");
    if (!masked) return this.close(1002, "Maskelenmemiş çerçeve");
    if (this.buffer.length < offset + 4 + length) return;
    const mask = this.buffer.subarray(offset, offset + 4);
    const payload = Buffer.allocUnsafe(length);
    for (let i = 0; i < length; i++) {
      payload[i] = this.buffer[offset + 4 + i] ^ mask[i & 3];
    }
    this.buffer = this.buffer.subarray(offset + 4 + length);
    this.handleFrame(fin, opcode, payload);
  }
};

Connection.prototype.handleFrame = function (fin, opcode, payload) {
  if (opcode === 0x8) return this.close(1000, "Görüşürüz");
  if (opcode === 0x9) return this.sendRaw(0x0a, payload);
  if (opcode === 0x0a) return;

  if (opcode === 0x0) {
    if (!this.fragmentOpcode) return this.close(1002, "Geçersiz çerçeve");
    this.fragments.push(payload);
    if (!fin) return;
    payload = Buffer.concat(this.fragments);
    this.fragments = [];
    opcode = this.fragmentOpcode;
    this.fragmentOpcode = 0;
  } else if (!fin) {
    this.fragmentOpcode = opcode;
    this.fragments = [payload];
    return;
  }

  if (opcode !== 0x1) return;

  const now = Date.now();
  if (now - this.rateWindow > 1000) {
    this.rateWindow = now;
    this.rateCount = 0;
  }
  if (++this.rateCount > 80) return this.close(1008, "Çok hızlı");
  this.lastMessage = now;

  let message;
  try {
    message = JSON.parse(payload.toString("utf8"));
  } catch (error) {
    return this.send({ t: "error", message: "Mesaj okunamadı." });
  }
  if (!message || typeof message.t !== "string") return;
  this.onMessage(this, message);
};

Connection.prototype.sendRaw = function (opcode, payload) {
  if (this.closed || this.socket.destroyed) return;
  const length = payload.length;
  let header;
  if (length < 126) {
    header = Buffer.allocUnsafe(2);
    header[0] = 0x80 | opcode;
    header[1] = length;
  } else if (length < 65536) {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  try {
    this.socket.write(Buffer.concat([header, payload]));
  } catch (error) {
    this.close(1011, "Yazma hatası");
  }
};

Connection.prototype.send = function (object) {
  this.sendRaw(0x01, Buffer.from(JSON.stringify(object), "utf8"));
};

Connection.prototype.close = function (code, reason) {
  if (this.closed) return;
  const payload = Buffer.allocUnsafe(2 + Buffer.byteLength(reason || ""));
  payload.writeUInt16BE(code || 1000, 0);
  payload.write(reason || "", 2);
  this.sendRaw(0x08, payload);
  this.closed = true;
  try { this.socket.end(); } catch (error) { /* yoksay */ }
  if (this.onClose) this.onClose(this);
};

const ipConnections = new Map();
const joinFailures = new Map();
let activeConnections = 0;

function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || (req.socket && req.socket.remoteAddress) || "?";
}

/* Tarayıcı kaynağı: aynı köken, file:// (Android WebView) ve ORIGINS listesi. */
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true; /* tarayıcı dışı istemciler (test/bot) */
  if (origin === "null" || origin === "file://") return true; /* APK WebView */
  let parsed;
  try { parsed = new URL(origin); } catch (error) { return false; }
  const host = String(req.headers.host || "").toLowerCase();
  if (parsed.host.toLowerCase() === host) return true;
  return EXTRA_ORIGINS.some((allowed) => {
    try { return new URL(allowed).origin === parsed.origin; } catch (error) { return allowed === origin; }
  });
}

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key || String(req.headers.upgrade || "").toLowerCase() !== "websocket") {
    socket.destroy();
    return;
  }
  if (!originAllowed(req)) {
    socket.end("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n");
    return;
  }
  if (activeConnections >= MAX_CONNECTIONS) {
    socket.end("HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\n\r\n");
    return;
  }
  const ip = clientIp(req);
  const count = ipConnections.get(ip) || 0;
  if (count >= MAX_CONNECTIONS_PER_IP) {
    socket.end("HTTP/1.1 429 Too Many Requests\r\nContent-Length: 0\r\n\r\n");
    return;
  }
  activeConnections++;
  ipConnections.set(ip, count + 1);
  socket.once("close", () => {
    activeConnections = Math.max(0, activeConnections - 1);
    const left = (ipConnections.get(ip) || 1) - 1;
    if (left <= 0) ipConnections.delete(ip);
    else ipConnections.set(ip, left);
  });

  const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    "Sec-WebSocket-Accept: " + accept + "\r\n\r\n"
  );
  socket.setNoDelay(true);
  socket.setKeepAlive(true, 30000);
  const conn = new Connection(socket, handleMessage, handleClose);
  conn.ip = ip;
  socket.on("data", (chunk) => conn.receive(chunk));
  socket.on("close", () => conn.close(1001, "Bağlantı kapandı"));
  socket.on("error", () => conn.close(1011, "Bağlantı hatası"));
  socket.setTimeout(0);
});

/* ------------------------------------------------------------------ */
/* Odalar                                                              */
/* ------------------------------------------------------------------ */

const rooms = new Map();
/* Rastgele eşleşme kuyruğu: bağlantı + ad + mod. Eşleşince oda kurulur. */
const matchQueue = [];
const MATCH_TTL = 2 * 60 * 1000;
/* Arkadaş kodu → açık bağlantı. Yalnızca eşleşme/davet için tutulur,
   diskte saklanmaz. */
const presence = new Map();
/* Arkadaş kodu → son bilinen ad. Çevrimdışı arkadaşın da son adı görünsün
   diye saklanır; yalnızca bellekte tutulur, LRU sınırını aşınca ve sunucu
   yeniden başlayınca temizlenir. */
const friendNames = new Map();
const FRIEND_NAMES_LIMIT = 5000;
const FRIEND_CODE_RE = /^[A-Z0-9]{4,10}$/;
/* Davet spam koruması: aynı bağlantıda iki davet arası en az süre ve
   aynı hedefe tekrar davet için beklenmesi gereken süre. */
const INVITE_MIN_MS = 2000;
const INVITE_REPEAT_MS = 30 * 1000;

function rememberFriendName(code, name) {
  const key = normalizeFriendCode(code);
  if (!key) return;
  const clean = String(name || "").trim().slice(0, 16);
  if (!clean) return;
  friendNames.delete(key);
  friendNames.set(key, clean);
  while (friendNames.size > FRIEND_NAMES_LIMIT) {
    const oldest = friendNames.keys().next().value;
    if (!oldest) break;
    friendNames.delete(oldest);
  }
}

function normalizeFriendCode(value) {
  const code = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  return FRIEND_CODE_RE.test(code) ? code : "";
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode() {
  let code;
  do {
    code = "";
    const bytes = crypto.randomBytes(5);
    for (let i = 0; i < 5; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  } while (rooms.has(code));
  return code;
}

/* Süre ince ayarı sınırları; istemcideki LIMITS ile aynı. */
function clampTimeLimit(value) {
  const n = Math.round((Number(value) || GameCore.DEFAULT_TIME) / 15) * 15;
  return Math.max(30, Math.min(300, n));
}
function clampTurnLimit(value) {
  const n = Math.round((Number(value) || GameCore.DEFAULT_TURN) / 5) * 5;
  return Math.max(10, Math.min(120, n));
}

function makeRoom(mode) {
  const code = makeCode();
  const room = {
    code,
    mode: mode === "coop" ? "coop" : "versus",
    timeMode: "shared",
    /* İki tahtalı odalarda varsayılan "sırayla" kapışma; oda sahibi
       "aynı anda"ya çevirebilir. Ortak tahtada sıra her zaman zorunlu. */
    turnBased: true,
    timeLimit: GameCore.DEFAULT_TIME,
    turnLimit: GameCore.DEFAULT_TURN,
    phase: "lobby",
    host: 0,
    players: [],
    game: null,
    lastTick: Date.now(),
    lastSentSecond: -1,
    createdAt: Date.now(),
    lastActive: Date.now()
  };
  rooms.set(code, room);
  return room;
}

function addPlayer(room, name, conn) {
  if (room.players.length >= 2) return null;
  const index = room.players.length;
  const slot = {
    token: crypto.randomBytes(16).toString("hex"),
    name: GameCore.cleanName(name, "Oyuncu " + (index + 1)),
    connected: true,
    conn,
    disconnectedAt: 0
  };
  room.players.push(slot);
  conn.player = { code: room.code, index, token: slot.token };
  /* Davetlerde oda adı görünsün; arkadaş kodu bildirilmemişse de kullanılır. */
  if (!conn.friendName) conn.friendName = slot.name;
  if (conn.friendCode) rememberFriendName(conn.friendCode, conn.friendName);
  room.lastActive = Date.now();
  return slot;
}

function attach(room, index, conn) {
  const slot = room.players[index];
  if (!slot) return false;
  const previous = slot.conn;
  slot.conn = conn;
  slot.connected = true;
  slot.disconnectedAt = 0;
  conn.player = { code: room.code, index, token: slot.token };
  room.lastActive = Date.now();
  if (previous && previous !== conn && !previous.closed) {
    previous.send({ t: "error", message: "Bu oyuncu başka bir cihazdan bağlandı." });
    previous.close(4001, "Yeni bağlantı");
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Rastgele eşleşme                                                    */
/* ------------------------------------------------------------------ */

function removeFromQueue(conn) {
  const index = matchQueue.findIndex((entry) => entry.conn === conn);
  if (index >= 0) matchQueue.splice(index, 1);
  return index >= 0;
}

function startRoom(room) {
  room.game = new GameCore.Game({
    mode: room.mode,
    names: room.players.map((player) => player.name),
    seed: crypto.randomBytes(4).readUInt32BE(0),
    turnBased: room.mode === "coop" ? true : room.turnBased !== false,
    timeMode: room.timeMode,
    timeLimit: room.timeLimit,
    turnLimit: room.turnLimit
  });
  room.phase = "playing";
  room.lastTick = Date.now();
  room.lastSentSecond = -1;
}

/* Kuyruğa girer; aynı modda bekleyen varsa ikisini aynı odaya koyup başlatır. */
function quickMatch(conn, message) {
  removeFromQueue(conn);
  if (conn.player) {
    leaveRoom(conn, false);
    if (conn.player) return conn.send({ t: "error", message: "Odadan ayrılamadın, tekrar dene." });
  }
  if (rooms.size >= MAX_ROOMS) {
    return conn.send({ t: "error", message: "Sunucu şu anda dolu. Biraz sonra tekrar dene." });
  }

  const mode = message.mode === "coop" ? "coop" : "versus";
  const waiterIndex = matchQueue.findIndex((entry) =>
    entry.mode === mode &&
    entry.conn &&
    !entry.conn.closed &&
    entry.conn !== conn
  );

  if (waiterIndex < 0) {
    matchQueue.push({
      conn,
      name: GameCore.cleanName(message.name, "Oyuncu"),
      mode,
      at: Date.now()
    });
    return conn.send({ t: "queued", waiting: matchQueue.length });
  }

  const waiter = matchQueue.splice(waiterIndex, 1)[0];
  const room = makeRoom(mode);
  /* Rastgele eşleşmede iki taraf da beklemeden oynasın: aynı anda doldurma. */
  room.turnBased = mode === "coop";
  const first = addPlayer(room, waiter.name, waiter.conn);
  const second = addPlayer(room, message.name, conn);
  if (!first || !second) {
    /* Bekleyen oyuncuyu kuyruğa geri koy, yeni geleni bilgilendir. */
    if (first) leaveRoom(waiter.conn, false);
    else matchQueue.unshift(waiter);
    return conn.send({ t: "error", message: "Eşleşme kurulamadı, tekrar dene." });
  }

  startRoom(room);
  sendWelcome(waiter.conn, room, 0);
  sendWelcome(conn, room, 1);
  broadcast(room);
}

function lobbyState(room) {
  return {
    mode: room.mode,
    phase: room.phase,
    code: room.code,
    host: room.host,
    online: true,
    turn: 0,
    turnBased: room.mode === "coop" ? true : room.turnBased,
    seq: 0,
    winner: null,
    reason: "",
    lastMove: null,
    timeMode: room.timeMode,
    timeLimit: room.timeLimit,
    timeLeft: room.timeMode === "shared" ? room.timeLimit : null,
    turnLimit: room.turnLimit,
    turnLeft: null,
    players: room.players.map((slot) => ({
      name: slot.name,
      score: 0,
      blocks: 0,
      lines: 0,
      combo: 0,
      alive: true,
      connected: slot.connected,
      board: null,
      tray: null,
      host: room.host === room.players.indexOf(slot)
    })),
    shared: null
  };
}

function publicState(room) {
  room.lastActive = Date.now();
  if (!room.game) return lobbyState(room);
  const state = room.game.snapshot();
  state.code = room.code;
  state.host = room.host;
  state.online = true;
  state.mode = room.mode;
  state.players.forEach((player, index) => {
    const slot = room.players[index];
    player.connected = !!(slot && slot.connected);
    player.host = room.host === index;
  });
  return state;
}

function broadcast(room) {
  const state = publicState(room);
  room.players.forEach((slot) => {
    if (slot.connected && slot.conn && !slot.conn.closed) slot.conn.send({ t: "state", state });
  });
  room.lastActive = Date.now();
}

function sendWelcome(conn, room, index) {
  const slot = room.players[index];
  if (!slot) return;
  conn.send({
    t: "welcome",
    code: room.code,
    token: slot.token,
    you: index,
    state: publicState(room)
  });
}

function leaveRoom(conn, explicit) {
  removeFromQueue(conn);
  const info = conn.player;
  if (!info) return;
  const room = rooms.get(info.code);
  conn.player = null;
  if (!room) return;
  const slot = room.players[info.index];
  if (!slot || slot.token !== info.token) return;
  if (slot.conn && slot.conn !== conn) return;

  if (explicit && room.game && room.game.phase === "playing") {
    slot.connected = false;
    slot.disconnectedAt = Date.now();
    if (room.host === info.index) {
      const other = room.players[1 - info.index];
      if (other && other.connected) room.host = 1 - info.index;
    }
    if (room.mode === "versus") {
      const rival = 1 - info.index;
      const rivalName = room.players[rival] ? room.players[rival].name : "Rakip";
      room.game.finish(rival, slot.name + " oyundan ayrıldı. " + rivalName + " kazandı.");
    } else {
      room.game.finish(null, slot.name + " oyundan ayrıldı. Tur sona erdi.");
    }
    broadcast(room);
    return;
  }

  slot.connected = false;
  slot.disconnectedAt = Date.now();
  slot.conn = null;

  if (room.phase === "lobby") {
    room.players.splice(info.index, 1);
    room.players.forEach((player, index) => {
      if (player.conn) player.conn.player.index = index;
    });
    if (room.players.length === 0) {
      rooms.delete(room.code);
      return;
    }
    if (room.host >= room.players.length) room.host = 0;
    room.players.forEach((player) => {
      if (player.connected && player.conn) {
        player.conn.send({ t: "welcome", code: room.code, token: player.token, you: player.conn.player.index, state: publicState(room) });
      }
    });
    broadcast(room);
    return;
  }

  // Oyun sırasında sekme kapandı: kısa süre yeniden bağlanma hakkı.
  if (room.host === info.index) {
    const other = room.players[1 - info.index];
    if (other && other.connected) {
      room.host = 1 - info.index;
      room.players.forEach((p, i) => { if (p.conn) p.conn.player.index = i; });
    }
  }
  broadcast(room);
}

function noteJoinFailure(ip) {
  if (!ip) return;
  const now = Date.now();
  const entry = joinFailures.get(ip);
  if (!entry || now - entry.at > JOIN_FAIL_WINDOW) {
    joinFailures.set(ip, { at: now, count: 1 });
    return;
  }
  entry.count++;
  entry.at = now;
}

function joinBlocked(ip) {
  if (!ip) return false;
  const entry = joinFailures.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.at > JOIN_FAIL_WINDOW) {
    joinFailures.delete(ip);
    return false;
  }
  return entry.count >= JOIN_FAIL_LIMIT;
}

function handleMessage(conn, message) {
  const t = message.t;

  if (t === "create") {
    removeFromQueue(conn);
    leaveRoom(conn, false);
    if (conn.player) return;
    if (rooms.size >= MAX_ROOMS) {
      return conn.send({ t: "error", message: "Sunucu şu anda dolu. Biraz sonra tekrar dene." });
    }
    const room = makeRoom(message.mode);
    const slot = addPlayer(room, message.name, conn);
    if (!slot) return conn.send({ t: "error", message: "Oda kurulamadı." });
    sendWelcome(conn, room, 0);
    return;
  }

  if (t === "join") {
    removeFromQueue(conn);
    if (joinBlocked(conn.ip)) {
      return conn.send({ t: "error", message: "Çok fazla hatalı deneme. Bir dakika sonra tekrar dene." });
    }
    const code = String(message.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
    const target = rooms.get(code);
    if (!target) {
      noteJoinFailure(conn.ip);
      return conn.send({ t: "error", message: "Böyle bir oda yok. Kodu kontrol et." });
    }
    if (target.players.length >= 2) {
      noteJoinFailure(conn.ip);
      return conn.send({ t: "error", message: "Oda dolu." });
    }
    if (target.phase !== "lobby") {
      noteJoinFailure(conn.ip);
      return conn.send({ t: "error", message: "Bu odada oyun başlamış." });
    }
    if (conn.player && conn.player.code === code) return conn.send({ t: "error", message: "Zaten bu odadasın." });
    leaveRoom(conn, false);
    if (conn.player) return;
    const slot = addPlayer(target, message.name, conn);
    if (!slot) return conn.send({ t: "error", message: "Oda dolu." });
    sendWelcome(conn, target, target.players.length - 1);
    broadcast(target);
    return;
  }

  if (t === "rejoin") {
    const code = String(message.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
    const room = rooms.get(code);
    if (!room) return conn.send({ t: "error", message: "Oda kapandı." });
    const index = room.players.findIndex((slot) => slot.token === message.token);
    if (index < 0) return conn.send({ t: "error", message: "Oturum bulunamadı." });
    conn.player = null;
    if (!attach(room, index, conn)) return conn.send({ t: "error", message: "Oturum bulunamadı." });
    sendWelcome(conn, room, index);
    broadcast(room);
    return;
  }

  /* Kuyruktayken de kalp atışı yanıtlanmalı; oda şartı aranmaz. */
  if (t === "ping") return conn.send({ t: "pong" });

  if (t === "quickmatch") {
    return quickMatch(conn, message);
  }

  if (t === "cancelmatch") {
    removeFromQueue(conn);
    return conn.send({ t: "matchcancel" });
  }

  /* Arkadaşlar oda şartı olmadan çalışır: ana menüde de durum bildirilir. */
  if (t === "presence") {
    const code = normalizeFriendCode(message.code);
    if (!code) return conn.send({ t: "presence", ok: false });
    if (conn.friendCode && presence.get(conn.friendCode) === conn) {
      presence.delete(conn.friendCode);
    }
    conn.friendCode = code;
    conn.friendName = String(message.name || "Oyuncu").slice(0, 16);
    presence.set(code, conn);
    rememberFriendName(code, conn.friendName);
    return conn.send({ t: "presence", ok: true, code });
  }

  if (t === "lookup") {
    const code = normalizeFriendCode(message.code);
    if (!code) return conn.send({ t: "lookup", ok: false, message: "Kod 4-10 karakter olmalı." });
    const target = presence.get(code);
    const online = !!(target && !target.closed);
    const name = online ? target.friendName : (friendNames.get(code) || "");
    if (online) rememberFriendName(code, name);
    return conn.send({
      t: "lookup",
      ok: true,
      code,
      name,
      online
    });
  }

  if (t === "invite") {
    const code = normalizeFriendCode(message.to);
    if (!code) return conn.send({ t: "invited", ok: false, message: "Arkadaş kodu geçersiz." });
    const target = presence.get(code);
    if (!target || target.closed) {
      return conn.send({ t: "invited", ok: false, message: "Arkadaşın şu an çevrimiçi değil." });
    }
    const roomCode = String(message.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
    const room = rooms.get(roomCode);
    if (!room) {
      return conn.send({ t: "invited", ok: false, message: "Oda bulunamadı." });
    }
    /* Daveti yalnızca odanın gerçek oyuncusu gönderebilir: başka birinin
       odası için ya da hiç girilmeyen bir oda adına davet gidemez. */
    const info = conn.player;
    const slot = info && info.code === roomCode ? room.players[info.index] : null;
    if (!info || !slot || slot.token !== info.token || slot.conn !== conn) {
      return conn.send({ t: "invited", ok: false, message: "Davet göndermek için bu odada olmalısın." });
    }
    /* Spam koruması: üst üste davet ve aynı hedefe kısa arayla tekrar engellenir. */
    const now = Date.now();
    if (!conn.inviteTargets) conn.inviteTargets = new Map();
    if (conn.inviteTargets.size > 200) conn.inviteTargets.clear();
    const lastTo = conn.inviteTargets.get(code);
    if (lastTo && now - lastTo < INVITE_REPEAT_MS) {
      return conn.send({ t: "invited", ok: false, message: "Bu arkadaşa az önce davet gönderdin." });
    }
    if (conn.lastInviteAt && now - conn.lastInviteAt < INVITE_MIN_MS) {
      return conn.send({ t: "invited", ok: false, message: "Çok hızlı davet gönderiyorsun, biraz bekle." });
    }
    conn.lastInviteAt = now;
    conn.inviteTargets.set(code, now);
    target.send({
      t: "invite",
      from: conn.friendName || "Arkadaşın",
      fromCode: conn.friendCode || "",
      code: roomCode,
      mode: room.mode
    });
    return conn.send({ t: "invited", ok: true, name: target.friendName || "" });
  }

  const info = conn.player;
  if (!info) return conn.send({ t: "error", message: "Önce bir odaya gir." });
  const room = rooms.get(info.code);
  if (!room) return conn.send({ t: "error", message: "Oda kapandı." });
  const slot = room.players[info.index];
  if (!slot || slot.token !== info.token) return conn.send({ t: "error", message: "Oturum geçersiz." });

  /* Canlı sürükleme: yalnızca diğer oyuncuya iletilir, sunucuda saklanmaz.
     Böylece arkadaşın bloğu tutup gezdirdiği anlık görünür. */
  if (t === "drag") {
    if (room.phase !== "playing" || !room.game || room.game.phase !== "playing") return;
    /* Saniyede en fazla ~25 mesaj: taşınma akıcı kalır, sunucu yorulmaz.
       "Bıraktı" bildirimi hiç geciktirilmez; hayalet anında kaybolsun. */
    const dragNow = Date.now();
    if (message.on !== false) {
      if (conn.dragAt && dragNow - conn.dragAt < 40) return;
      conn.dragAt = dragNow;
    }
    const relay = {
      t: "drag",
      by: info.index,
      on: message.on !== false,
      piece: Math.max(0, Math.min(2, Number(message.piece) || 0)),
      grabR: Number(message.grabR) || 0,
      grabC: Number(message.grabC) || 0,
      px: Number(message.px),
      py: Number(message.py),
      lift: Number(message.lift) || 0,
      row: Number(message.row),
      col: Number(message.col),
      valid: !!message.valid
    };
    /* "Bıraktı" bildiriminde konum yok; yalnızca taşınma mesajında gerekir. */
    if (relay.on && (!Number.isFinite(relay.px) || !Number.isFinite(relay.py))) return;
    room.players.forEach((other, otherIndex) => {
      if (otherIndex === info.index) return;
      if (other.connected && other.conn && !other.conn.closed) other.conn.send(relay);
    });
    return;
  }

  /* Emote: oyun sırasında ve tur bittikten sonra rakibe iletilir.
     Yalnızca bilinen dört ifade geçer; hız sınırı spam'i engeller. */
  if (t === "emote") {
    if (room.phase !== "playing" && room.phase !== "over") return;
    if (EMOTES.indexOf(message.emote) < 0) return;
    const emoteNow = Date.now();
    if (conn.lastEmoteAt && emoteNow - conn.lastEmoteAt < EMOTE_MIN_MS) return;
    conn.lastEmoteAt = emoteNow;
    room.players.forEach((other, otherIndex) => {
      if (otherIndex === info.index) return;
      if (other.connected && other.conn && !other.conn.closed) {
        other.conn.send({ t: "emote", by: info.index, emote: message.emote });
      }
    });
    return;
  }

  if (t === "mode") {
    if (room.phase !== "lobby") return;
    if (room.host !== info.index) return conn.send({ t: "error", message: "Modu sadece oda sahibi değiştirir." });
    room.mode = message.mode === "coop" ? "coop" : "versus";
    broadcast(room);
    return;
  }

  if (t === "timer") {
    if (room.phase !== "lobby") return;
    if (room.host !== info.index) return conn.send({ t: "error", message: "Süre modunu oda sahibi seçer." });
    if (message.mode != null) {
      room.timeMode = GameCore.TIME_MODES.indexOf(message.mode) >= 0 ? message.mode : "shared";
    }
    if (message.timeLimit != null) room.timeLimit = clampTimeLimit(message.timeLimit);
    if (message.turnLimit != null) room.turnLimit = clampTurnLimit(message.turnLimit);
    broadcast(room);
    return;
  }

  if (t === "pace") {
    if (room.phase !== "lobby") return;
    if (room.host !== info.index) return conn.send({ t: "error", message: "Doldurma düzenini oda sahibi seçer." });
    room.turnBased = message.pace !== "live";
    broadcast(room);
    return;
  }

  if (t === "start") {
    if (room.phase !== "lobby") return;
    if (room.host !== info.index) return conn.send({ t: "error", message: "Oyunu oda sahibi başlatır." });
    if (room.players.length < 2) return conn.send({ t: "error", message: "İkinci oyuncu bekleniyor." });
    if (!room.players.every((player) => player.connected)) return conn.send({ t: "error", message: "İki oyuncu da bağlı olmalı." });
    startRoom(room);
    broadcast(room);
    return;
  }

  if (t === "move") {
    if (!room.game || room.game.phase !== "playing") return;
    const result = room.game.move(
      info.index,
      Number(message.piece),
      Number(message.row),
      Number(message.col)
    );
    if (!result.ok) return conn.send({ t: "error", message: result.reason });
    if (room.game.phase === "over") room.phase = "over";
    broadcast(room);
    return;
  }

  if (t === "rematch") {
    if (room.host !== info.index) return conn.send({ t: "error", message: "Yeniden başlatmayı oda sahibi yapar." });
    if (room.players.length < 2 || !room.players.every((player) => player.connected)) {
      return conn.send({ t: "error", message: "İki oyuncu da bağlı olmalı." });
    }
    if (room.game && room.game.phase === "playing") return;
    startRoom(room);
    room.phase = "playing";
    room.lastTick = Date.now();
    room.lastSentSecond = -1;
    broadcast(room);
    return;
  }

  if (t === "leave") {
    leaveRoom(conn, true);
    conn.send({ t: "left" });
    return;
  }

  conn.send({ t: "error", message: "Bilinmeyen istek." });
}

function handleClose(conn) {
  removeFromQueue(conn);
  if (conn.friendCode && presence.get(conn.friendCode) === conn) presence.delete(conn.friendCode);
  if (conn.player) leaveRoom(conn, false);
}

/* ------------------------------------------------------------------ */
/* Bakım                                                               */
/* ------------------------------------------------------------------ */

setInterval(() => {
  const now = Date.now();
  joinFailures.forEach((entry, ip) => {
    if (now - entry.at > JOIN_FAIL_WINDOW) joinFailures.delete(ip);
  });
  for (let i = matchQueue.length - 1; i >= 0; i--) {
    const entry = matchQueue[i];
    if (!entry.conn || entry.conn.closed) {
      matchQueue.splice(i, 1);
      continue;
    }
    if (now - entry.at > MATCH_TTL) {
      matchQueue.splice(i, 1);
      entry.conn.send({ t: "error", message: "Rakip bulunamadı. Tekrar dene." });
    }
  }
  rooms.forEach((room, code) => {
    const anyConnected = room.players.some((player) => player.connected);
    if (!anyConnected && now - room.lastActive > ROOM_TTL) {
      rooms.delete(code);
      return;
    }
    if (room.phase === "playing" && room.game && room.game.phase === "playing") {
      const connectedCount = room.players.filter((player) => player.connected).length;
      if (connectedCount === 1) {
        const goneIndex = room.players.findIndex((player) => !player.connected);
        const gone = room.players[goneIndex];
        if (gone && gone.disconnectedAt && now - gone.disconnectedAt > DISCONNECT_FORFEIT) {
          if (room.mode === "versus") {
            const rival = 1 - goneIndex;
            room.game.finish(rival, gone.name + " bağlantısı koptu. " + room.players[rival].name + " kazandı.");
          } else {
            room.game.finish(null, gone.name + " bağlantısı koptu. Tur sona erdi.");
          }
          room.phase = "over";
          broadcast(room);
        }
      }
    }
    room.players.forEach((player) => {
      if (player.conn && !player.conn.closed && now - player.conn.lastMessage > 70000) {
        player.conn.close(1001, "Zaman aşımı");
      }
    });
  });
}, 15000).unref();

/* Oyun saatleri sunucuda ilerler (otoriter). İstemci yumuşak sayım için
   saniyede bir yayın alır; tahta sadece gerçek değişimde yeniden çizilir. */
setInterval(() => {
  const now = Date.now();
  rooms.forEach((room) => {
    if (room.phase !== "playing" || !room.game || room.game.phase !== "playing") return;
    const dt = Math.min(2, (now - (room.lastTick || now)) / 1000);
    room.lastTick = now;
    const result = room.game.tick(dt);
    const over = room.game.phase === "over";
    if (over) room.phase = "over";

    let second = null;
    if (room.game.timeMode === "shared") second = Math.ceil(room.game.timeLeft || 0);
    else if (room.game.timeMode === "turn" && room.game.turnBased) second = Math.ceil(room.game.turnLeft || 0);
    const changedSecond = second !== null && second !== room.lastSentSecond;

    if (over || changedSecond || result.penalty != null) {
      if (second !== null) room.lastSentSecond = second;
      broadcast(room);
    }
  });
}, 1000).unref();

server.listen(PORT, HOST, () => {
  console.log("Blokara 1v1 hazır: http://localhost:" + PORT);
  if (HOST === "0.0.0.0") console.log("Telefondan aynı Wi-Fi üzerinden: http://<bilgisayar-ip>:" + PORT);
});

function gracefulShutdown() {
  rooms.forEach((room) => {
    room.players.forEach((slot) => {
      if (slot.conn) slot.conn.close(1001, "Sunucu kapanıyor");
    });
  });
  server.close(() => process.exit(0));
  /* Açık soketler kapanmayı geciktirirse 5 sn sonra çık. */
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
