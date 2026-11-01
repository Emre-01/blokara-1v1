/* Dolu hücrelerin üzerine sürükle: önizleme binmemeli, blok kırmızı çerçeveyle
   uyarmalı ve bırakınca yerleşmemeli. */
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
  function filledCount() {
    return Array.prototype.filter.call(board().children, function (el) {
      return el.classList.contains("on");
    }).length;
  }

  return (async function () {
    var out = {};
    var ov = document.getElementById("overlay");
    if (ov && !ov.hidden) {
      var closer = ov.querySelector("[data-close]");
      if (closer) closer.click(); else ov.hidden = true;
    }
    await wait(150);
    if (!window.BlokDebug || !window.BlokDebug.fillRow) return { error: "BlokDebug.fillRow yok" };
    window.BlokDebug.start("coop", { timeMode: "none" });
    await wait(500);

    /* Satır 4-5, sütun 0-3 dolu; tam satır yok ki oyun patlatmasın. */
    window.BlokDebug.fillRegion(4, 0, 2, 4, "mint");
    await wait(250);
    out.filledBefore = filledCount();
    out.hint = "dolu bölge: satır 4-5, sütun 0-3 (tam satır yok)";

    var piece = document.querySelector('.piece[data-piece]:not(.empty):not(.dead)');
    if (!piece) return { error: "parça yok", filledBefore: out.filledBefore };
    var start = center(piece.querySelector(".pcell") || piece);

    fire(piece, "pointerdown", start.x, start.y);
    await wait(80);
    var d = window.BlokDebug.drag();
    if (!d) return { error: "sürükleme başlamadı" };
    out.geometry = { lift: d.lift, grabR: d.grabR, grabC: d.grabC, h: d.h, w: d.w,
      stepX: d.stepX, stepY: d.stepY, geoX: d.geoX, geoY: d.geoY };

    /* Bloğun sol üstü satır 4, sütun 1'e gelsin: parmağın olması gereken yer. */
    var row = 4, col = 1;
    var fingerX = d.geoX + (col + d.grabC + 0.5) * d.stepX;
    var fingerY = d.geoY + (row + d.grabR + 0.5) * d.stepY + d.lift;

    for (var i = 1; i <= 10; i++) {
      fire(document, "pointermove", start.x + (fingerX - start.x) * (i / 10),
        start.y + (fingerY - start.y) * (i / 10));
      await wait(30);
    }
    await wait(180);

    var d2 = window.BlokDebug.drag();
    var preview = document.querySelector(".drop-preview");
    var ghostEl = document.querySelector(".drag-ghost");
    out.overFilled = {
      target: d2 ? d2.target : null,
      previewFound: !!preview,
      previewVisibleCells: preview && !preview.classList.contains("is-hidden")
        ? preview.querySelectorAll(".dp.on").length : 0,
      ghostBad: ghostEl ? ghostEl.classList.contains("bad") : null,
      ghostOpacity: ghostEl ? getComputedStyle(ghostEl).opacity : null
    };

    fire(document, "pointerup", fingerX, fingerY);
    await wait(700);
    out.filledAfter = filledCount();
    out.rejected = out.filledAfter === out.filledBefore;

    out.ok = out.overFilled.ghostBad === true &&
      out.overFilled.previewVisibleCells === 0 &&
      out.rejected === true;
    return out;
  })();
})();
