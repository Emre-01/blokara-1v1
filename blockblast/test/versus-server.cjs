/* Sunucuda rakip modu açar; oyuncu 0 tahtasına hamle yapar, oyuncu 1
   tahtasının boş kaldığını ve tahtaların karışmadığını doğrular. */
"use strict";

const url = process.argv[2] || "ws://127.0.0.1:8080";
const a = new WebSocket(url);
let b = null;
let code = null;
let started = false;
let played = false;

function send(ws, message) {
  if (ws.readyState === 1) ws.send(JSON.stringify(message));
}

function findSpot(board, cells) {
  let maxR = 0;
  let maxC = 0;
  cells.forEach((cell) => {
    maxR = Math.max(maxR, cell[0]);
    maxC = Math.max(maxC, cell[1]);
  });
  for (let row = 0; row + maxR < 8; row++) {
    for (let col = 0; col + maxC < 8; col++) {
      let ok = true;
      for (const cell of cells) if (board[row + cell[0]][col + cell[1]]) ok = false;
      if (ok) return { row, col };
    }
  }
  return null;
}

a.addEventListener("open", () => send(a, { t: "create", mode: "versus", name: "Ev" }));
a.addEventListener("message", (event) => {
  const m = JSON.parse(event.data);
  if (m.t === "welcome") {
    code = m.code;
    b = new WebSocket(url);
    b.addEventListener("open", () => send(b, { t: "join", code, name: "Ada" }));
    b.addEventListener("message", (e) => {
      const mm = JSON.parse(e.data);
      if (mm.t === "state" && mm.state.phase === "lobby" && mm.state.players.length === 2 && !started) {
        started = true;
        send(a, { t: "start" });
      }
    });
    return;
  }
  if (m.t === "error") console.log("hata:", m.message);
  if (m.t !== "state") return;
  const s = m.state;
  if (s.phase !== "playing") return;
  if (!played) {
    played = true;
    const me = s.players[0];
    const index = me.tray.findIndex(Boolean);
    const where = findSpot(me.board, me.tray[index].cells);
    console.log("hamle", index, where);
    send(a, { t: "move", piece: index, row: where.row, col: where.col });
    return;
  }
  if (s.seq > 0) {
    console.log(JSON.stringify({
      mode: s.mode,
      turnBased: s.turnBased,
      board0Fill: s.players[0].board.flat().filter(Boolean).length,
      board1Fill: s.players[1].board.flat().filter(Boolean).length,
      board0Colors: [...new Set(s.players[0].board.flat().filter(Boolean))],
      board1Colors: [...new Set(s.players[1].board.flat().filter(Boolean))],
      traySame: JSON.stringify(s.players[0].tray.map((p) => (p ? p.name : null))) ===
        JSON.stringify(s.players[1].tray.map((p) => (p ? p.name : null)))
    }));
    process.exit(0);
  }
});
setTimeout(() => {
  console.log("zaman aşımı", { code, started, played });
  process.exit(1);
}, 15000);
