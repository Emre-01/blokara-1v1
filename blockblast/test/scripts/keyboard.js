// Klavye ile blok seçme, gezinme ve bırakma senaryosu.
document.querySelector('[data-local="coop"]').click();
new Promise(function (resolve) {
  setTimeout(function () {
    var piece = document.querySelector('.piece');
    var board = document.querySelector('#board-shared');

    function key(target, name) {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
    }

    key(piece, 'Enter');
    var afterSelect = {
      selected: piece.classList.contains('selected'),
      cursorCells: document.querySelectorAll('#board-shared .cell.cursor').length,
      ghostCells: document.querySelectorAll('#board-shared .cell.ghost').length,
      filledBefore: document.querySelectorAll('#board-shared .cell.on').length
    };

    key(document.body, 'ArrowRight');
    key(document.body, 'ArrowDown');
    var afterMove = {
      cursorCells: document.querySelectorAll('#board-shared .cell.cursor').length,
      cursorIndex: Array.prototype.indexOf.call(board.children, document.querySelector('#board-shared .cell.cursor'))
    };

    key(document.body, 'Enter');
    setTimeout(function () {
      resolve({
        afterSelect: afterSelect,
        afterMove: afterMove,
        filledAfter: document.querySelectorAll('#board-shared .cell.on').length,
        cursorAfter: document.querySelectorAll('#board-shared .cell.cursor').length,
        selectedAfter: document.querySelectorAll('.piece.selected').length,
        score: document.querySelector('.score-value').textContent,
        hint: document.querySelector('#game-hint').textContent
      });
    }, 500);
  }, 700);
});
