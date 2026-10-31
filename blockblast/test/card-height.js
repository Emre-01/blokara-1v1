(function () {
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function metric() {
    return Array.prototype.map.call(document.querySelectorAll(".score-card"), function (card) {
      var r = card.getBoundingClientRect();
      return Math.round(r.width * 10) / 10 + "x" + Math.round(r.height * 10) / 10;
    }).concat([Math.round(document.querySelector(".turn-pill").getBoundingClientRect().height * 10) / 10 + "h"]);
  }
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
  function occupied() {
    var board = document.querySelector(".board");
    var grid = [];
    Array.prototype.forEach.call(board.children, function (el, i) {
      grid.push(el.classList.contains("on"));
    });
    return grid;
  }
  function fits(grid, w, h, r, c) {
    if (r < 0 || c < 0 || r + h > 8 || c + w > 8) return false;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) if (grid[(r + y) * 8 + c + x]) return false;
    return true;
  }
  return (async function () {
    var out = { sizes: [metric()], plays: [] };
    var board = document.querySelector(".board");
    var a = board.children[0].getBoundingClientRect();
    var b = board.children[1].getBoundingClientRect();
    var c = board.children[8].getBoundingClientRect();
    var stepX = b.left - a.left;
    var stepY = c.top - a.top;

    for (var n = 0; n < 9; n++) {
      var piece = null, idx = -1;
      var pieces = document.querySelectorAll(".piece[data-piece]");
      for (var i = 0; i < pieces.length; i++) {
        if (!pieces[i].classList.contains("empty") && pieces[i].querySelector(".pcell.on")) {
          piece = pieces[i]; idx = Number(piece.dataset.piece); break;
        }
      }
      if (!piece) break;
      var meta = info(piece);
      var grid = occupied();
      var spot = null;
      for (var r = 7; r >= 0 && !spot; r--) {
        for (var cc = 0; cc < 8 && !spot; cc++) {
          if (fits(grid, meta.w, meta.h, r, cc)) spot = { row: r, col: cc };
        }
      }
      if (!spot) break;

      var pr = piece.getBoundingClientRect();
      var px = pr.left + pr.width / 2;
      var py = pr.top + pr.height / 2;
      var grabR = Math.floor(meta.h / 2), grabC = Math.floor(meta.w / 2);
      var fx = a.left + (spot.col + grabC + 0.5) * stepX;
      var fy = a.top + (spot.row + grabR + 0.5) * stepY + 44;

      ev("pointerdown", piece, px, py, 1);
      await wait(50);
      ev("pointermove", document, fx, fy, 1);
      await wait(90);
      ev("pointerup", document, fx, fy, 0);
      await wait(700);
      out.plays.push({ piece: idx, row: spot.row, col: spot.col,
        fill: document.querySelector(".board").querySelectorAll(".cell.on").length });
      out.sizes.push(metric());
      await wait(900);
      out.sizes.push(metric());
    }
    out.uniqueSizes = Array.from(new Set(out.sizes));
    return out;
  })();
})();
