// Sürükleme etkileşimini sentetik pointer olaylarıyla dener.
document.querySelector('[data-local="coop"]').click();
new Promise(function (resolve) {
  setTimeout(function () {
    var piece = document.querySelector('.piece');
    var cell = piece.querySelector('.pcell.on');
    var pRect = cell.getBoundingClientRect();
    var board = document.querySelector('#board-shared');
    var bRect = board.getBoundingClientRect();
    var pitch = bRect.width / 8;

    function fire(target, type, x, y) {
      target.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, clientX: x, clientY: y,
        pointerId: 7, pointerType: 'touch', isPrimary: true
      }));
    }

    // bloğun sol-üst dolu hücresini (0,0) hedefleyerek tahtanın 4,4 karesine bırak
    var startX = pRect.left + pRect.width / 2;
    var startY = pRect.top + pRect.height / 2;
    fire(piece, 'pointerdown', startX, startY);

    var targetX = bRect.left + (4 + 0.5) * pitch;
    var targetY = bRect.top + (4 + 0.5) * pitch;
    fire(window, 'pointermove', (startX + targetX) / 2, (startY + targetY) / 2);
    fire(window, 'pointermove', targetX, targetY);
    var ghost = document.querySelector('.drag-ghost');
    var previewCells = document.querySelectorAll('#board-shared .cell.ghost').length;
    fire(window, 'pointerup', targetX, targetY);

    setTimeout(function () {
      resolve({
        ghostWhileDragging: !!ghost,
        previewCells: previewCells,
        filledAfterDrop: document.querySelectorAll('#board-shared .cell.on').length,
        score: document.querySelector('.score-value').textContent,
        hint: document.querySelector('#game-hint').textContent
      });
    }, 500);
  }, 700);
});
