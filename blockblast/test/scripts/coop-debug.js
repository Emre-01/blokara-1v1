document.querySelector('[data-local="coop"]').click();
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function run() {
  await sleep(700);
  var log = [];
  for (var turn = 0; turn < 60; turn++) {
    var overlay = document.querySelector('#overlay');
    if (overlay && !overlay.hidden) { log.push('overlay'); break; }
    var scoreBefore = document.querySelectorAll('.score-value')[0].textContent + '/' +
      document.querySelectorAll('.score-value')[1].textContent;
    var scoreShared = document.querySelector('.turn-pill .tp-main').textContent;
    var pieces = document.querySelectorAll('.piece');
    var moved = false;
    for (var p = 0; p < pieces.length && !moved; p++) {
      if (pieces[p].classList.contains('empty') || pieces[p].classList.contains('dead')) continue;
      pieces[p].dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, clientX: 0, clientY: 0, pointerId: 14, pointerType: 'mouse'
      }));
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 14 }));
      await sleep(8);
      var cells = document.querySelectorAll('#board-shared .cell');
      for (var c = 0; c < cells.length && !moved; c++) {
        cells[c].click();
        await sleep(6);
        var now = document.querySelector('.turn-pill .tp-main').textContent;
        if (now !== scoreShared) moved = true;
      }
    }
    log.push('tur ' + turn + ' shared=' + scoreShared + ' -> ' + document.querySelector('.turn-pill .tp-main').textContent +
      ' doluluk=' + document.querySelectorAll('#board-shared .cell.on').length + ' moved=' + moved);
    if (!moved) break;
    await sleep(15);
  }
  return log;
}
run();
