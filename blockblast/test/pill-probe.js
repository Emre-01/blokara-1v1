(function () {
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function dump(tag) {
    var pill = document.querySelector(".turn-pill");
    var card = document.querySelector(".score-card");
    var r = pill.getBoundingClientRect();
    return {
      tag: tag,
      pillH: Math.round(r.height * 10) / 10,
      pillW: Math.round(r.width * 10) / 10,
      pillClass: pill.className,
      pillHTML: pill.innerHTML.replace(/\s+/g, " ").slice(0, 260),
      cardH: Math.round(card.getBoundingClientRect().height * 10) / 10,
      cardHTML: card.innerHTML.replace(/\s+/g, " ").slice(0, 240)
    };
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
    var out = [dump("before")];
    var board = document.querySelector(".board");
    var a = board.children[0].getBoundingClientRect();
    var b = board.children[1].getBoundingClientRect();
    var c = board.children[8].getBoundingClientRect();

    var piece = null;
    var pieces = document.querySelectorAll(".piece[data-piece]");
    for (var i = 0; i < pieces.length; i++) {
      if (pieces[i].querySelector(".pcell.on")) { piece = pieces[i]; break; }
    }
    var meta = info(piece);
    var g = grid();
    var spot = null;
    for (var r = 7; r >= 0 && !spot; r--) {
      for (var cc = 0; cc < 8 && !spot; cc++) if (fits(g, meta.w, meta.h, r, cc)) spot = { row: r, col: cc };
    }
    var pr = piece.getBoundingClientRect();
    var px = pr.left + pr.width / 2, py = pr.top + pr.height / 2;
    var fx = a.left + (spot.col + Math.floor(meta.w / 2) + 0.5) * (b.left - a.left);
    var fy = a.top + (spot.row + Math.floor(meta.h / 2) + 0.5) * (c.top - a.top) + 44;
    ev("pointerdown", piece, px, py, 1);
    await wait(50);
    ev("pointermove", document, fx, fy, 1);
    await wait(60);
    ev("pointerup", document, fx, fy, 0);
    await wait(120); out.push(dump("t+120"));
    await wait(400); out.push(dump("t+520"));
    await wait(600); out.push(dump("t+1120"));
    await wait(800); out.push(dump("t+1920"));
    return out;
  })();
})();
