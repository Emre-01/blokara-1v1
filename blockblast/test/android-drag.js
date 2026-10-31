/* Gerçek dokunuş benzeri sürükleme ile bir blok yerleştirir; renk ve puan
   kartı ölçülerini döndürür. */
(function () {
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function center(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  function fire(target, type, point) {
    var opts = {
      bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: "touch",
      isPrimary: true, clientX: point.x, clientY: point.y, buttons: type === "pointerup" ? 0 : 1
    };
    target.dispatchEvent(new PointerEvent(type, opts));
  }
  function metrics() {
    return Array.prototype.map.call(document.querySelectorAll(".score-card"), function (el) {
      var r = el.getBoundingClientRect();
      return Math.round(r.width) + "x" + Math.round(r.height);
    }).concat([Math.round(document.querySelector(".turn-pill").getBoundingClientRect().width) + "w"]);
  }
  function boardState() {
    var s = window.__blokState;
    return s ? {
      fill: s.players[0].board.flat().filter(Boolean).length,
      score: s.players[0].score
    } : null;
  }

  return (async function () {
    var out = { start: metrics() };
    var tray = document.querySelectorAll(".piece[data-piece]");
    var board = document.querySelector(".board");
    if (!tray.length || !board) return { error: "oyun ekranı yok" };

    var piece = tray[0];
    var pc = center(piece);
    fire(piece, "pointerdown", pc);
    await wait(60);

    /* sürükleme sırasında parmağı tahtaya götür */
    var path = [0.3, 0.6, 1];
    var cells = board.children;
    var target = cells[7 * 8 + 3];
    var tc = center(target);
    for (var i = 0; i < path.length; i++) {
      fire(document, "pointermove", {
        x: pc.x + (tc.x - pc.x) * path[i],
        y: pc.y + (tc.y - pc.y) * path[i]
      });
      await wait(40);
    }
    out.previewCells = document.querySelectorAll(".drop-preview .dp.on").length;
    out.ghostOpacity = (function () {
      var g = document.querySelector(".drag-ghost");
      return g ? getComputedStyle(g).opacity : null;
    })();
    out.darkCells = document.querySelectorAll(".cell.ghost").length;
    fire(document, "pointerup", tc);
    await wait(700);

    var filled = [];
    Array.prototype.forEach.call(board.children, function (el, idx) {
      if (el.classList.contains("on")) {
        filled.push({ r: Math.floor(idx / 8), c: idx % 8,
          cls: el.className.replace("cell on ", "").replace(" pop", "").replace(" flash", ""),
          bg: getComputedStyle(el).backgroundColor });
      }
    });
    out.filled = filled;
    out.after = metrics();
    out.ghostGone = !document.querySelector(".drag-ghost");
    out.previewGone = !document.querySelector(".drop-preview");
    return out;
  })();
})();
