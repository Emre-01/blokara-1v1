// Yerel rakip modunda sürükleme aktif tahtaya bırakır.
document.querySelector('[data-local="versus"]').click();
new Promise(function (resolve) {
  setTimeout(function () {
    var piece = document.querySelector('.piece');
    var cell = piece.querySelector('.pcell.on');
    var pRect = cell.getBoundingClientRect();
    var board = document.querySelector('.board');
    var bRect = board.getBoundingClientRect();
    var pitch = bRect.width / 8;

    function fire(target, type, x, y) {
      target.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, clientX: x, clientY: y,
        pointerId: 9, pointerType: 'touch', isPrimary: true
      }));
    }

    var startX = pRect.left + pRect.width / 2;
    var startY = pRect.top + pRect.height / 2;
    fire(piece, 'pointerdown', startX, startY);
    var targetX = bRect.left + (5 + 0.5) * pitch;
    var targetY = bRect.top + (5 + 0.5) * pitch;
    fire(window, 'pointermove', (startX + targetX) / 2, (startY + targetY) / 2);
    fire(window, 'pointermove', targetX, targetY);
    var preview = document.querySelectorAll('.board .cell.ghost').length;
    fire(window, 'pointerup', targetX, targetY);

    setTimeout(function () {
      resolve({
        previewCells: preview,
        boardId: document.querySelector('.board').id,
        filled: document.querySelectorAll('.board .cell.on').length,
        miniFilled: document.querySelectorAll('.score-card .score-mini i.on').length,
        scores: [].map.call(document.querySelectorAll('.score-value'), function (el) { return el.textContent; }),
        activeCard: [].indexOf.call(document.querySelectorAll('.score-card'), document.querySelector('.score-card.active'))
      });
    }, 400);
  }, 700);
});
