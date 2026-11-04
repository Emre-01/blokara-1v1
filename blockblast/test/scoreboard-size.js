/* Puan kartlarının boyutu oyun boyunca sabit kalıyor mu? */
(function () {
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function metrics() {
    return Array.prototype.map.call(document.querySelectorAll(".score-card"), function (el) {
      var r = el.getBoundingClientRect();
      return Math.round(r.width) + "x" + Math.round(r.height);
    }).concat([Math.round(document.querySelector(".turn-pill").getBoundingClientRect().width) + "w"]);
  }
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
    dbg.start("versus", { timeMode: "shared" });
    await wait(600);
    var out = { start: metrics() };

    for (var n = 0; n < 3; n++) {
      var s = dbg.snapshot();
      if (s.turn !== 0) { await wait(2000); s = dbg.snapshot(); }
      if (s.turn !== 0) break;
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
      if (!mv) break;
      tapPiece(mv.piece);
      await wait(80);
      var cell = document.querySelector('.cell[data-r="' + mv.row + '"][data-c="' + mv.col + '"]');
      if (cell) cell.click();
      await wait(2200);
      out["after" + (n + 1)] = metrics();
      out["score" + (n + 1)] = document.querySelectorAll(".score-value")[0].textContent;
    }
    return out;
  })();
})();
