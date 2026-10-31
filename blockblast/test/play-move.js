(function () {
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function ev(type, target, x, y, buttons) {
    target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: "touch",
      isPrimary: true, clientX: x, clientY: y, buttons: buttons
    }));
  }
  function info(el) {
    var cells = el.querySelectorAll(".pcell");
    var w = Number((el.style.gridTemplateColumns.match(/repeat\((\d+)/) || [0, 1])[1]);
    var maxR = 0, maxC = 0;
    Array.prototype.forEach.call(cells, function (c) {
      maxR = Math.max(maxR, Number(c.dataset.pr));
      maxC = Math.max(maxC, Number(c.dataset.pc));
    });
    return { w: Math.max(w, maxC + 1), h: maxR + 1 };
  }
  function grid() {
    var out = [];
    Array.prototype.forEach.call(document.querySelector(".board").children, function (el) {
      out.push(el.classList.contains("on"));
    });
    return out;
  }
  function fits(g, w, h, r, c) {
    if (r < 0 || c < 0 || r + h > 8 || c + w > 8) return false;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) if (g[(r + y) * 8 + c + x]) return false;
    return true;
  }
  return (async function () {
    var piece = null, pieces = document.querySelectorAll(".piece[data-piece]");
    for (var i = 0; i < pieces.length; i++) {
      if (!pieces[i].classList.contains("dead") && pieces[i].querySelector(".pcell.on")) { piece = pieces[i]; break; }
    }
    if (!piece) return { error: "oynanabilir taş yok", screen: document.querySelector(".screen:not([hidden])").id };
    var meta = info(piece);
    var g = grid();
    var spot = null;
    for (var r = 7; r >= 0 && !spot; r--) {
      for (var c = 0; c < 8 && !spot; c++) if (fits(g, meta.w, meta.h, r, c)) spot = { row: r, col: c };
    }
    if (!spot) return { error: "yer yok" };
    var board = document.querySelector(".board");
    var a = board.children[0].getBoundingClientRect();
    var b = board.children[1].getBoundingClientRect();
    var cc = board.children[8].getBoundingClientRect();
    var pr = piece.getBoundingClientRect();
    var px = pr.left + pr.width / 2, py = pr.top + pr.height / 2;
    var fx = a.left + (spot.col + Math.floor(meta.w / 2) + 0.5) * (b.left - a.left);
    var fy = a.top + (spot.row + Math.floor(meta.h / 2) + 0.5) * (cc.top - a.top) + 44;
    ev("pointerdown", piece, px, py, 1);
    await wait(60);
    ev("pointermove", document, fx, fy, 1);
    await wait(120);
    var preview = document.querySelectorAll(".drop-preview .dp.on").length;
    ev("pointerup", document, fx, fy, 0);
    await wait(1000);
    var cells = [];
    Array.prototype.forEach.call(document.querySelector(".board").children, function (el) {
      if (el.classList.contains("on")) {
        cells.push({ cls: el.className.replace(/cell on ?/, "").replace(/ (pop|flash|ghost)/g, ""), bg: getComputedStyle(el).backgroundColor });
      }
    });
    return {
      placed: spot,
      preview: preview,
      filled: cells.length,
      cells: cells,
      pill: (document.querySelector(".turn-pill .tp-main") || {}).textContent || null,
      score: Array.prototype.map.call(document.querySelectorAll(".score-value"), function (e) { return e.textContent; }),
      toast: (document.querySelector(".toast") || {}).textContent || null
    };
  })();
})();
