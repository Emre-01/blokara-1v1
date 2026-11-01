/* Sürükleme geometrisini adım adım döker. */
(function () {
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function fire(target, type, x, y) {
    target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: "touch",
      isPrimary: true, clientX: x, clientY: y, buttons: type === "pointerup" ? 0 : 1
    }));
  }
  function center(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  function ghostBox() {
    var cells = document.querySelectorAll(".drag-ghost .pcell");
    if (!cells.length) return null;
    var top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity;
    Array.prototype.forEach.call(cells, function (el) {
      var r = el.getBoundingClientRect();
      top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom);
      left = Math.min(left, r.left); right = Math.max(right, r.right);
    });
    return { top: Math.round(top), bottom: Math.round(bottom), left: Math.round(left), right: Math.round(right) };
  }
  function ghostBad() {
    var g = document.querySelector(".drag-ghost");
    return g ? g.classList.contains("bad") : null;
  }
  function previewState() {
    var el = document.querySelector(".drop-preview");
    if (!el) return "yok";
    return { hidden: el.classList.contains("is-hidden"), cells: el.querySelectorAll(".dp.on").length };
  }

  return (async function () {
    var out = {};
    var ov = document.getElementById("overlay");
    if (ov && !ov.hidden) {
      var closer = ov.querySelector("[data-close]");
      if (closer) closer.click(); else ov.hidden = true;
    }
    await wait(150);
    window.BlokDebug.start("coop", { timeMode: "none" });
    await wait(500);

    var cells = document.querySelector(".board").children;
    var targets = [center(cells[3 * 8 + 2]), center(cells[4 * 8 + 5])];

    for (var round = 0; round < 2; round++) {
      var piece = document.querySelector('.piece[data-piece]:not(.empty):not(.dead)');
      if (!piece) { out["round" + round] = "parça yok"; break; }
      var pcell = piece.querySelector(".pcell");
      var start = pcell ? center(pcell) : center(piece);
      fire(piece, "pointerdown", start.x, start.y);
      await wait(60);

      var t = targets[round];
      for (var i = 1; i <= 6; i++) {
        fire(document, "pointermove", start.x + (t.x - start.x) * (i / 6), start.y + (t.y - start.y) * (i / 6));
        await wait(50);
      }
      await wait(120);
      var g = ghostBox();
      out["round" + round] = {
        drag: window.BlokDebug.drag(),
        finger: { x: Math.round(t.x), y: Math.round(t.y) },
        ghost: g,
        clearance: g ? Math.round(t.y - g.bottom) : null,
        preview: previewState(),
        ghostBad: ghostBad()
      };
      fire(document, "pointerup", t.x, t.y);
      await wait(700);
      out["round" + round + "filled"] = Array.prototype.filter.call(
        document.querySelector(".board").children, function (el) { return el.classList.contains("on"); }
      ).length;
    }
    return out;
  })();
})();
