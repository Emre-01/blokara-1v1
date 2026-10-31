/* Sürükleme önizlemesini yakalar: parça basılı tutulurken ekran görüntüsü alınır. */
(function () {
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  return (async function () {
    var dbg = window.BlokDebug;
    if (!dbg) return "BlokDebug yok";
    dbg.start("versus", { bot: "easy", timeMode: "none" });
    await wait(500);

    var boardEl = document.querySelector(".board");
    var cells = boardEl.children;
    var target = cells[27].getBoundingClientRect();
    var pieceEl = document.querySelector('.piece[data-piece="0"]');
    var src = pieceEl.getBoundingClientRect();

    function pointer(type, x, y) {
      var ev = new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch",
        isPrimary: true, clientX: x, clientY: y
      });
      (type === "pointerdown" ? pieceEl : window).dispatchEvent(ev);
    }

    pointer("pointerdown", src.left + src.width / 2, src.top + src.height / 2);
    await wait(60);
    for (var i = 1; i <= 6; i++) {
      pointer("pointermove", src.left + (target.left - src.left) * i / 6, src.top + (target.top - src.top) * i / 6);
      await wait(30);
    }
    await wait(160);

    var preview = document.querySelector(".drop-preview");
    var ghost = document.querySelector(".drag-ghost");
    return {
      dragging: !!window.BlokDebug.snapshot(),
      previewExists: !!preview,
      previewCells: preview ? preview.children.length : 0,
      previewPosition: preview ? getComputedStyle(preview).transform : null,
      ghostCells: ghost ? ghost.children.length : 0,
      hintCells: document.querySelectorAll(".cell.clear-hint").length,
      darkCells: document.querySelectorAll(".cell.bad").length,
      boardCells: boardEl.children.length
    };
  })();
})();
