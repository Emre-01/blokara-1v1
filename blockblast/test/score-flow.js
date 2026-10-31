/* Puanlama akışı: kutu koymak puan vermez, satır/sütun patlaması verir. */
(function () {
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  return (async function () {
    var dbg = window.BlokDebug;
    if (!dbg) return "BlokDebug yok";
    dbg.start("versus", { bot: "normal", timeMode: "none" });
    await wait(400);
    var game = dbg.game();
    var dot = { shape: 0, name: "nokta", cells: [[0, 0]], w: 1, h: 1, color: "coral" };
    var out = {};

    /* Bot araya girmesin diye üç hamle de senkron yapılır. */
    function play(row, col) {
      var player = game.turn;
      var board = game.players[player].board;
      game.players[player].tray[0] = dot;
      var res = game.move(player, 0, row, col);
      return { player: player, ok: res.ok, reason: res.reason,
        points: res.lastMove && res.lastMove.points,
        lines: res.lastMove && res.lastMove.lines,
        combo: res.lastMove && res.lastMove.combo,
        score: game.players[player].score,
        board: board };
    }

    // 1) patlamayan hamle
    out.plainMove = play(3, 3);

    // 2) satır tamamla
    var rowBoard = game.players[game.turn].board;
    for (var c = 0; c < 8; c++) if (c !== 5) rowBoard[7][c] = "mint";
    out.rowClear = play(7, 5);

    // 3) satır + sütun birlikte (haç)
    var crossBoard = game.players[game.turn].board;
    for (var cc = 0; cc < 8; cc++) if (cc !== 4) crossBoard[6][cc] = "sky";
    for (var rr = 0; rr < 8; rr++) if (rr !== 6) crossBoard[rr][4] = "grape";
    out.crossClear = play(6, 4);

    delete out.plainMove.board;
    delete out.rowClear.board;
    delete out.crossClear.board;

    out.linePoints = window.BlokIki.linePoints({ rows: [7], cols: [] }, 1);
    out.crossPoints = window.BlokIki.linePoints({ rows: [7], cols: [7] }, 1);
    out.twoRows = window.BlokIki.linePoints({ rows: [6, 7], cols: [] }, 1);

    await wait(300);
    out.domScores = Array.prototype.map.call(document.querySelectorAll(".score-value"), function (el) { return el.textContent; });
    return out;
  })();
})();
