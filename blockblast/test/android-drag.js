/* Gerçek dokunuş benzeri sürükleme ile bir blok yerleştirir; renk, puan kartı
   ölçüleri ve hayalet/önizleme davranışını döndürür. */
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
  function readBoard() {
    var board = document.querySelector(".board");
    if (!board) return { filled: [], count: 0 };
    var filled = [];
    Array.prototype.forEach.call(board.children, function (el, idx) {
      if (el.classList.contains("on")) {
        filled.push({ r: Math.floor(idx / 8), c: idx % 8,
          cls: el.className.replace("cell on ", "").replace(" pop", "").replace(" flash", ""),
          bg: getComputedStyle(el).backgroundColor });
      }
    });
    return { filled: filled, count: filled.length };
  }

  return (async function () {
    /* Önceki testten kalan kartı kapat ve temiz bir tur başlat. */
    var ov = document.getElementById("overlay");
    if (ov && !ov.hidden) {
      var closer = ov.querySelector("[data-close]");
      if (closer) closer.click(); else ov.hidden = true;
    }
    await wait(150);
    if (window.BlokDebug) {
      window.BlokDebug.start("coop", { timeMode: "none" });
    } else {
      var coopBtn = document.querySelector('[data-local="coop"]');
      if (coopBtn) coopBtn.click();
    }
    await wait(600);

    var tray = document.querySelectorAll(".piece[data-piece]");
    var board = document.querySelector(".board");
    if (!tray.length || !board) return { error: "oyun ekranı yok" };
    var out = { start: metrics() };

    var piece = tray[0];
    var pc = center(piece);
    fire(piece, "pointerdown", pc);
    await wait(60);

    var target = board.children[4 * 8 + 4];
    var tc = center(target);
    /* parmağı kademeli götür: her adımda bir kare çizilir */
    for (var i = 1; i <= 6; i++) {
      fire(document, "pointermove", {
        x: pc.x + (tc.x - pc.x) * (i / 6),
        y: pc.y + (tc.y - pc.y) * (i / 6)
      });
      await wait(70);
    }
    await wait(120);
    out.previewCells = document.querySelectorAll(".drop-preview .dp.on").length;
    out.previewBad = document.querySelector(".drop-preview")
      ? document.querySelector(".drop-preview").classList.contains("bad") : null;
    out.ghostOpacity = (function () {
      var g = document.querySelector(".drag-ghost");
      return g ? getComputedStyle(g).opacity : null;
    })();
    out.darkCells = document.querySelectorAll(".cell.ghost").length;

    fire(document, "pointerup", tc);
    await wait(700);

    var after = readBoard();
    out.filled = after.filled;
    out.fillCount = after.count;
    out.colorsKeep = after.filled.every(function (cell) { return !!cell.bg && cell.cls.indexOf("c-") === 0; });
    out.after = metrics();
    out.ghostGone = !document.querySelector(".drag-ghost");
    out.previewGone = !document.querySelector(".drop-preview");
    out.score = (document.querySelector(".score-value") || {}).textContent;
    return out;
  })();
})();
