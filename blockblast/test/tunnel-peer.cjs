/* Tünel üzerinden uçtan uca: uygulama oda kurar, dışarıdan katılır,
   oyun başlar, uygulama bir hamle yapar. Test betikleri bunu sırayla çağırır. */
"use strict";

const url = process.argv[2];
const code = String(process.argv[3] || "").toUpperCase();
const seconds = Number(process.argv[4] || 120);

const ws = new WebSocket(url);
let me = -1;
let lastSeq = -1;
let moves = 0;

function send(message) {
  if (ws.readyState === 1) ws.send(JSON.stringify(message));
}

function log(tag, extra) {
  console.log(JSON.stringify(Object.assign({ tag }, extra || {})));
}

function shapes(piece) {
  return piece.cells.map((cell) => ({ r: cell[0], c: cell[1] }));
}

function findSpot(board, shape) {
  let maxR = 0;
  let maxC = 0;
  shape.forEach((c) => {
    maxR = Math.max(maxR, c.r);
    maxC = Math.max(maxC, c.c);
  });
  for (let row = 7; row >= 0; row--) {
    for (let col = 0; col < 8; col++) {
      if (row + maxR > 7 || col + maxC > 7) continue;
      let ok = true;
      for (const c of shape) if (board[row + c.r][col + c.c]) ok = false;
      if (ok) return { row, col };
    }
  }
  return null;
}

ws.addEventListener("open", () => send({ t: "join", code, name: "Ada" }));
ws.addEventListener("message", (event) => {
  const m = JSON.parse(event.data);
  if (m.t === "welcome") {
    me = m.you;
    log("welcome", { you: me, players: m.state.players.length });
    return;
  }
  if (m.t === "error") {
    log("error", { message: m.message });
    return;
  }
  if (m.t !== "state") return;
  const s = m.state;
  log("state", { phase: s.phase, seq: s.seq, turn: s.turn });
  if (s.phase !== "playing" || s.seq === lastSeq) return;
  if (s.turnBased && s.turn !== me) return;
  const holder = s.mode === "coop" ? s.shared : s.players[me];
  if (!holder || !holder.tray) return;
  const index = holder.tray.findIndex(Boolean);
  if (index < 0) return;
  const spot = findSpot(holder.board, shapes(holder.tray[index]));
  if (!spot) return;
  lastSeq = s.seq;
  moves++;
  log("move", { piece: index, row: spot.row, col: spot.col, score: holder.score });
  send({ t: "move", piece: index, row: spot.row, col: spot.col });
});
ws.addEventListener("close", () => log("closed"));

setTimeout(() => {
  log("done", { moves });
  process.exit(0);
}, seconds * 1000);
