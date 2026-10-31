/* Bot modunu uçtan uca sürer: taşa dokunur, tahtaya bırakır, sonucu döndürür. */
(function () {
  function tapPiece() {
    var piece = document.querySelector('.piece[data-piece="0"]');
    if (!piece) return false;
    var rect = piece.getBoundingClientRect();
    var opts = { bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch", isPrimary: true,
      clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
    piece.dispatchEvent(new PointerEvent("pointerdown", opts));
    setTimeout(function () {
      document.dispatchEvent(new PointerEvent("pointerup", opts));
    }, 60);
    return true;
  }
  function tapCell(r, c) {
    var cell = document.querySelector('.cell[data-r="' + r + '"][data-c="' + c + '"]');
    if (!cell) return false;
    cell.click();
    return true;
  }
  return new Promise(function (resolve) {
    document.getElementById("play-bot").click();
    setTimeout(function () {
      var ok = tapPiece();
      setTimeout(function () {
        tapCell(0, 0);
        setTimeout(function () {
          resolve({
            ok: ok,
            scores: Array.prototype.map.call(document.querySelectorAll(".score-value"), function (el) { return el.textContent; }),
            clock: (document.getElementById("time-left") || {}).textContent,
            hint: (document.getElementById("game-hint") || {}).textContent,
            selected: !!document.querySelector(".piece.selected"),
            drag: !!document.querySelector(".ghost"),
            text: document.body.innerText.slice(0, 260)
          });
        }, 1800);
      }, 300);
    }, 700);
  });
})();
