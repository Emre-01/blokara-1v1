/* İkinci oyuncuyu masaüstünden canlı tutar; oda koduyla katılır,
   oyun başlayınca sırayla basit hamleler yapar. Uçtan uca eşleşmeyi
   kontrol etmek için kullanılır.
   Kullanım: node --experimental-websocket test/peer.cjs <URL> <KOD> [isim] [saniye] */
"use strict";

const url = process.argv[2] || "ws://127.0.0.1:8080";
const code = (process.argv[3] || "").toUpperCase();
const name = process.argv[4] || "Ada";
const lifetime = Number(process.argv[5] || 60) * 1000;

const ws = new WebSocket(url);
let me = -1;
let lastSeq = -1;
let moves = 0;
let timer = null;

function send(message) {
  if (ws.readyState === 1) ws.send(JSON.stringify(message));
}

function log(tag, extra) {
  console.log(JSON.stringify(Object.assign({ tag, at: Date.now() }, extra || {})));
}

/* Sunucu durumu: bizim tahtamıza sığan ilk yeri bulur. */
function findSpot(board, shape) {
  let maxR = 0;
  let maxC = 0;
  shape.forEach((cell) => {
    maxR = Math.max(maxR, cell.r);
    maxC = Math.max(maxC, cell.c);
  });
  for (let row = 0; row + maxR < 8; row++) {
    for (let col = 0; col + maxC < 8; col++) {
      const ok = shape.every((cell) => !board[row + cell.r][col + cell.c]);
      if (ok) return { row, col };
    }
  }
  return null;
}

function shapesOf(piece) {
  /* Sunucu hücreleri [satır, sütun] dizisi olarak gönderir. */
  if (!piece || !piece.cells) return null;
  return piece.cells.map((cell) => (Array.isArray(cell) ? { r: cell[0], c: cell[1] } : cell));
}

function maybeMove(state) {
  if (state.phase !== "playing" || state.seq === lastSeq) return;
  /* Ortak modda sıra kimdeyse yalnız o oynar; rakip modunda herkes kendi tahtasında. */
  if (state.turnBased && state.turn !== me) return;
  const coop = state.mode === "coop";
  const holder = coop ? state.shared : state.players[me];
  if (!holder || !holder.board || !holder.tray) return;
  const index = holder.tray.findIndex(Boolean);
  if (index < 0) return;
  const shape = shapesOf(holder.tray[index]);
  if (!shape) return;
  const spot = findSpot(holder.board, shape);
  if (!spot) return;
  lastSeq = state.seq;
  moves++;
  log("move", { piece: index, row: spot.row, col: spot.col, seq: state.seq, score: holder.score });
  send({ t: "move", piece: index, row: spot.row, col: spot.col });
}

ws.addEventListener("open", () => {
  log("connected");
  send({ t: "join", code, name });
});

ws.addEventListener("message", (event) => {
  let message;
  try {
    message = JSON.parse(event.data);
  } catch (error) {
    return;
  }
  if (message.t === "welcome") {
    me = message.you;
    log("welcome", { you: me, code: message.code, players: message.state.players.length });
    return;
  }
  if (message.t === "error") {
    log("error", { message: message.message });
    return;
  }
  if (message.t !== "state") return;
  const state = message.state;
  log("state", {
    phase: state.phase,
    seq: state.seq,
    turn: state.turn,
    players: state.players.map((p) => ({
      name: p.name,
      score: p.score,
      lines: p.lines,
      fill: p.board ? p.board.flat().filter(Boolean).length : 0,
      connected: p.connected
    }))
  });
  maybeMove(state);
});

ws.addEventListener("close", () => log("closed"));
ws.addEventListener("error", () => log("ws-error"));

timer = setTimeout(() => {
  log("done", { moves });
  try {
    ws.close();
  } catch (error) {
    /* yoksay */
  }
  process.exit(0);
}, lifetime);
timer.unref && timer.unref();
