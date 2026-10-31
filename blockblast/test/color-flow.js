/* Gerçek dokunuşlarla oyna, tahtadaki renkleri oku. */
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

  function boardColors() {
    var boardEl = document.getElementById("board-0");
    var out = [];
    Array.prototype.forEach.call(boardEl.children, function (el) {
      if (el.classList.contains("on")) {
        out.push(el.className.replace("cell on ", "").replace(" pop", "") + "=" +
          getComputedStyle(el).backgroundColor);
      }
    });
    return out;
  }

  function stateFill() {
    var s = window.BlokDebug.snapshot();
    return { turn: s.turn, seq: s.seq,
      fill0: s.players[0].board.flat().filter(Boolean).length,
      fill1: s.players[1].board.flat().filter(Boolean).length };
  }

  return (async function () {
    var dbg = window.BlokDebug;
    if (!dbg) return "BlokDebug yok";
    dbg.start("versus", { bot: "easy", timeMode: "none" });
    await wait(500);

    var log = [];
    for (var turn = 0; turn < 4; turn++) {
      var s = dbg.snapshot();
      if (s.turn !== 0) { await wait(1600); s = dbg.snapshot(); }
      if (s.turn !== 0) { log.push({ stuck: stateFill() }); break; }
      var mv = null;
      for (var i = 0; i < s.players[0].tray.length && !mv; i++) {
        var piece = s.players[0].tray[i];
        if (!piece) continue;
        mv = { piece: i, row: null, col: null, color: piece.color };
        outer:
        for (var r = 7; r >= 0; r--) {
          for (var c = 0; c < 8; c++) {
            if (window.BlokIki.canPlace(s.players[0].board, piece, r, c)) {
              mv.row = r; mv.col = c; break outer;
            }
          }
        }
        if (mv.row == null) mv = null;
      }
      if (!mv) break;
      var tapped = tapPiece(mv.piece);
      await wait(120);
      var selected = document.querySelector(".piece.selected");
      var cell = document.querySelector('.cell[data-r="' + mv.row + '"][data-c="' + mv.col + '"]');
      cell.click();
      await wait(700);

      log.push({ move: mv, tapped: tapped, selected: !!selected,
        state: stateFill(), dom: boardColors().slice(0, 6),
        domCount: boardColors().length,
        scoreCard: document.querySelector(".score-value").textContent });
    }
    return log;
  })();
})();
