/* Sunucuda ortak mod açar, iki oyuncu katılır, bir hamle yapar ve puanı yazar.
   Kullanım: node --experimental-websocket test/score-server.cjs [ws url] */
"use strict";

const url = process.argv[2] || "ws://127.0.0.1:8080";
const a = new WebSocket(url);
let b = null;
let code = null;
let started = false;
let played = false;
let done = false;

function send(ws, message) {
  if (ws.readyState === 1) ws.send(JSON.stringify(message));
}

function spot(board, shape) {
  let maxR = 0;
  let maxC = 0;
  shape.forEach((cell) => {
    maxR = Math.max(maxR, cell[0]);
    maxC = Math.max(maxC, cell[1]);
  });
  for (let row = 7; row >= 0; row--) {
    for (let col = 0; col < 8; col++) {
      if (row + maxR > 7 || col + maxC > 7) continue;
      let ok = true;
      for (const cell of shape) if (board[row + cell[0]][col + cell[1]]) ok = false;
      if (ok) return { row, col };
    }
  }
  return null;
}

function join() {
  b = new WebSocket(url);
  b.addEventListener("open", () => send(b, { t: "join", code, name: "Ada" }));
  b.addEventListener("message", (event) => {
    const m = JSON.parse(event.data);
    if (m.t === "error") console.log("B hata:", m.message);
    if (m.t === "state" && m.state.phase === "lobby" && m.state.players.length === 2 && !started) {
      started = true;
      send(a, { t: "start" });
    }
  });
}

a.addEventListener("open", () => send(a, { t: "create", mode: "coop", name: "Ev" }));
a.addEventListener("message", (event) => {
  const m = JSON.parse(event.data);
  if (m.t === "welcome") {
    code = m.code;
    join();
    return;
  }
  if (m.t === "error") console.log("A hata:", m.message);
  if (m.t !== "state") return;
  const s = m.state;
  if (s.phase !== "playing" || done) return;
  if (!played) {
    played = true;
    const index = s.shared.tray.findIndex(Boolean);
    const where = spot(s.shared.board, s.shared.tray[index].cells);
    console.log("hamle", index, where, "önce ortak puan", s.shared.score);
    send(a, { t: "move", piece: index, row: where.row, col: where.col });
    return;
  }
  if (s.seq > 0) {
    done = true;
    console.log(JSON.stringify({
      sharedScore: s.shared.score,
      p0: s.players[0].score,
      p0blocks: s.players[0].blocks,
      p0lines: s.players[0].lines,
      fill: s.shared.board.flat().filter(Boolean).length
    }));
    process.exit(0);
  }
});
setTimeout(() => {
  console.log("zaman aşımı", { code, started, played });
  process.exit(1);
}, 15000);
