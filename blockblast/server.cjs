/* Blok İki sunucusu — bağımlılık yok.
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

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

function serveStatic(req, res) {
  if (req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("ok");
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  } catch (error) {
    res.writeHead(400);
    return res.end("Bad request");
  }
  if (pathname === "/") pathname = "/index.html";
  const file = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      return res.end("<h1>404</h1><p><a href=\"/\">Blok İki</a></p>");
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": pathname === "/index.html" || pathname === "/sw.js" ? "no-cache" : "public, max-age=3600"
    });
    res.end(data);
  });
}

let server;
if (process.env.SSL_KEY && process.env.SSL_CERT) {
  server = https.createServer({
    key: fs.readFileSync(process.env.SSL_KEY),
    cert: fs.readFileSync(process.env.SSL_CERT)
  }, serveStatic);
} else {
  server = http.createServer(serveStatic);
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

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key || String(req.headers.upgrade || "").toLowerCase() !== "websocket") {
    socket.destroy();
    return;
  }
  const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    "Sec-WebSocket-Accept: " + accept + "\r\n\r\n"
  );
  socket.setNoDelay(true);
  const conn = new Connection(socket, handleMessage, handleClose);
  socket.on("data", (chunk) => conn.receive(chunk));
  socket.on("close", () => conn.close(1001, "Bağlantı kapandı"));
  socket.on("error", () => conn.close(1011, "Bağlantı hatası"));
  socket.setTimeout(0);
});

/* ------------------------------------------------------------------ */
/* Odalar                                                              */
/* ------------------------------------------------------------------ */

const rooms = new Map();
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

function makeRoom(mode) {
  const code = makeCode();
  const room = {
    code,
    mode: mode === "coop" ? "coop" : "versus",
    timeMode: "shared",
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

function lobbyState(room) {
  return {
    mode: room.mode,
    phase: room.phase,
    code: room.code,
    host: room.host,
    online: true,
    turn: 0,
    turnBased: true,
    seq: 0,
    winner: null,
    reason: "",
    lastMove: null,
    timeMode: room.timeMode,
    timeLimit: GameCore.DEFAULT_TIME,
    timeLeft: room.timeMode === "shared" ? GameCore.DEFAULT_TIME : null,
    turnLimit: GameCore.DEFAULT_TURN,
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

function handleMessage(conn, message) {
  const t = message.t;

  if (t === "create") {
    leaveRoom(conn, false);
    if (conn.player) return;
    const room = makeRoom(message.mode);
    const slot = addPlayer(room, message.name, conn);
    if (!slot) return conn.send({ t: "error", message: "Oda kurulamadı." });
    sendWelcome(conn, room, 0);
    return;
  }

  if (t === "join") {
    const code = String(message.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
    const target = rooms.get(code);
    if (!target) return conn.send({ t: "error", message: "Böyle bir oda yok. Kodu kontrol et." });
    if (target.players.length >= 2) return conn.send({ t: "error", message: "Oda dolu." });
    if (target.phase !== "lobby") return conn.send({ t: "error", message: "Bu odada oyun başlamış." });
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

  const info = conn.player;
  if (!info) return conn.send({ t: "error", message: "Önce bir odaya gir." });
  const room = rooms.get(info.code);
  if (!room) return conn.send({ t: "error", message: "Oda kapandı." });
  const slot = room.players[info.index];
  if (!slot || slot.token !== info.token) return conn.send({ t: "error", message: "Oturum geçersiz." });

  if (t === "ping") return conn.send({ t: "pong" });

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
    room.timeMode = GameCore.TIME_MODES.indexOf(message.mode) >= 0 ? message.mode : "shared";
    broadcast(room);
    return;
  }

  if (t === "start") {
    if (room.phase !== "lobby") return;
    if (room.host !== info.index) return conn.send({ t: "error", message: "Oyunu oda sahibi başlatır." });
    if (room.players.length < 2) return conn.send({ t: "error", message: "İkinci oyuncu bekleniyor." });
    if (!room.players.every((player) => player.connected)) return conn.send({ t: "error", message: "İki oyuncu da bağlı olmalı." });
    room.game = new GameCore.Game({
      mode: room.mode,
      names: room.players.map((player) => player.name),
      seed: crypto.randomBytes(4).readUInt32BE(0),
      turnBased: room.mode === "coop",
      timeMode: room.timeMode
    });
    room.phase = "playing";
    room.lastTick = Date.now();
    room.lastSentSecond = -1;
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
    room.game = new GameCore.Game({
      mode: room.mode,
      names: room.players.map((player) => player.name),
      seed: crypto.randomBytes(4).readUInt32BE(0),
      turnBased: room.mode === "coop",
      timeMode: room.timeMode
    });
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
  if (conn.player) leaveRoom(conn, false);
}

/* ------------------------------------------------------------------ */
/* Bakım                                                               */
/* ------------------------------------------------------------------ */

setInterval(() => {
  const now = Date.now();
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
  console.log("Blok İki hazır: http://localhost:" + PORT);
  if (HOST === "0.0.0.0") console.log("Telefondan aynı Wi-Fi üzerinden: http://<bilgisayar-ip>:" + PORT);
});

process.on("SIGTERM", () => {
  rooms.forEach((room) => {
    room.players.forEach((slot) => {
      if (slot.conn) slot.conn.close(1001, "Sunucu kapanıyor");
    });
  });
  server.close(() => process.exit(0));
});
