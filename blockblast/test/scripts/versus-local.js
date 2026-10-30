// Yerel rakip modu: tek büyük aktif tahta + rakip mini tahtası, sıra geçişi.
document.querySelector('[data-local="versus"]').click();
new Promise(function (resolve) {
  setTimeout(function () {
    function key(el, name) {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
    }
    var boards = document.querySelectorAll('.board').length;
    var before = {
      boards: boards,
      activeBoardId: document.querySelector('.board').id,
      miniCards: document.querySelectorAll('.score-card .score-mini').length,
      label: document.querySelector('.board-label').textContent
    };
    var piece = document.querySelectorAll('.piece')[0];
    key(piece, 'Enter');
    document.querySelectorAll('.board .cell')[27].click();
    setTimeout(function () {
      resolve({
        before: before,
        filled: document.querySelectorAll('.board .cell.on').length,
        boardId: document.querySelector('.board').id,
        activeCard: [].indexOf.call(document.querySelectorAll('.score-card'), document.querySelector('.score-card.active')),
        miniCards: document.querySelectorAll('.score-card .score-mini').length,
        miniFilled: document.querySelectorAll('.score-card .score-mini i.on').length,
        pill: document.querySelector('.turn-pill .tp-main').textContent,
        label: document.querySelector('.board-label').textContent,
        score: [].map.call(document.querySelectorAll('.score-value'), function (el) { return el.textContent; })
      });
    }, 400);
  }, 700);
});
