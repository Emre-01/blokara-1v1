/* Parmakla sürükleme: blok parmağın üstünde durmalı ve geçerli yere
   bırakınca renkleriyle yerleşmeli. */
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
  function board() { return document.querySelector(".board"); }
  function filled() {
    return Array.prototype.filter.call(board().children, function (el) {
      return el.classList.contains("on");
    });
  }
  function ghostBox() {
    var cells = document.querySelectorAll(".drag-ghost .pcell");
    if (!cells.length) return null;
    var top = Infinity, bottom = -Infinity;
    Array.prototype.forEach.call(cells, function (el) {
      var r = el.getBoundingClientRect();
      top = Math.min(top, r.top);
      bottom = Math.max(bottom, r.bottom);
    });
    return { top: Math.round(top), bottom: Math.round(bottom) };
  }

  return (async function () {
    var out = {};
    var ov = document.getElementById("overlay");
    if (ov && !ov.hidden) {
      var closer = ov.querySelector("[data-close]");
      if (closer) closer.click(); else ov.hidden = true;
    }
    await wait(150);
    if (!window.BlokDebug) return { error: "BlokDebug yok (test=1 gerekli)" };
    window.BlokDebug.start("coop", { timeMode: "none" });
    await wait(500);

    var piece = document.querySelector('.piece[data-piece]:not(.empty):not(.dead)');
    if (!piece) return { error: "parça yok" };
    var start = center(piece.querySelector(".pcell") || piece);

    fire(piece, "pointerdown", start.x, start.y);
    await wait(80);
    var d = window.BlokDebug.drag();
    if (!d) return { error: "sürükleme başlamadı" };

    /* Bloğun sol üstü satır 3, sütun 2'ye gelsin. */
    var row = 3, col = 2;
    var fingerX = d.geoX + (col + d.grabC + 0.5) * d.stepX;
    var fingerY = d.geoY + (row + d.grabR + 0.5) * d.stepY + d.lift;

    var steps = [];
    for (var i = 1; i <= 8; i++) {
      var x = start.x + (fingerX - start.x) * (i / 8);
      var y = start.y + (fingerY - start.y) * (i / 8);
      fire(document, "pointermove", x, y);
      await wait(35);
      var g = ghostBox();
      steps.push({
        i: i,
        ghostBottom: g ? g.bottom : null,
        clearance: g ? Math.round(y - g.bottom) : null,
        preview: document.querySelector(".drop-preview")
          ? !document.querySelector(".drop-preview").classList.contains("is-hidden") : false
      });
    }
    await wait(150);
    var last = steps[steps.length - 1];
    out.steps = steps.length;
    out.minClearance = Math.min.apply(null, steps.map(function (s) {
      return s.clearance == null ? 9999 : s.clearance;
    }));
    out.finalClearance = last.clearance;
    /* Her adımda blok parmağı takip etmeli: gecikme yok. */
    out.tracksFinger = last.ghostBottom != null && last.clearance >= 20 &&
      last.clearance <= Math.round(d.stepY * 1.6);
    out.previewShown = last.preview;
    if (window.BlokDebug.drag()) out.target = window.BlokDebug.drag().target;

    fire(document, "pointerup", fingerX, fingerY);
    await wait(800);
    var cells = filled();
    out.placed = cells.length;
    out.colors = cells.map(function (el) {
      var cls = el.className.split(" ").filter(function (c) { return c.indexOf("c-") === 0; })[0];
      return cls + "=" + getComputedStyle(el).backgroundColor;
    });
    out.colorsKeep = out.placed > 0 && out.colors.every(function (c) { return c.indexOf("c-") === 0; });
    out.ghostGone = !document.querySelector(".drag-ghost");
    out.previewGone = !document.querySelector(".drop-preview");

    out.ok = out.tracksFinger && out.previewShown && out.placed > 0 &&
      out.colorsKeep && out.ghostGone && out.previewGone;
    return out;
  })();
})();
