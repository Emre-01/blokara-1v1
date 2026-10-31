/* Bot oynarken tahta değişiyor mu? Ekranda hep oyuncunun tahtası kalmalı. */
(function () {
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function tapPiece(index) {
    var p = document.querySelector('.piece[data-piece="' + index + '"]');
    if (!p) return false;
    var r = p.getBoundingClientRect();
    var o = { bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch",
      isPrimary: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    p.dispatchEvent(new PointerEvent("pointerdown", o));
    document.dispatchEvent(new PointerEvent("pointerup", o));
    return true;
  }

  return (async function () {
    var dbg = window.BlokDebug;
    if (!dbg) return "BlokDebug yok";
    dbg.start("versus", { bot: "hard", timeMode: "none" });
    await wait(400);

    var log = [];
    function snap(tag) {
      var board = document.querySelector(".board");
      var s = dbg.snapshot();
      log.push({ tag: tag, board: board ? board.id : null, turn: s.turn, seq: s.seq,
        fill0: s.players[0].board.flat().filter(Boolean).length,
        fill1: s.players[1].board.flat().filter(Boolean).length,
        domFill: board ? board.querySelectorAll(".cell.on").length : -1,
        trayColored: document.querySelectorAll(".piece .pcell.on").length });
    }
    snap("start");

    var s = dbg.snapshot();
    var mv = null;
    for (var i = 0; i < s.players[0].tray.length && !mv; i++) {
      var p = s.players[0].tray[i];
      if (!p) continue;
      for (var r = 7; r >= 0 && !mv; r--) {
        for (var c = 0; c < 8 && !mv; c++) {
          if (window.BlokIki.canPlace(s.players[0].board, p, r, c)) mv = { piece: i, row: r, col: c };
        }
      }
    }
    tapPiece(mv.piece);
    await wait(120);
    var cell = document.querySelector('.cell[data-r="' + mv.row + '"][data-c="' + mv.col + '"]');
    if (cell) cell.click();
    await wait(150);
    snap("afterPlayerMove");
    await wait(900);
    snap("botThinking");
    await wait(3000);
    snap("afterBotMove");

    return { log: log, move: mv };
  })();
})();
