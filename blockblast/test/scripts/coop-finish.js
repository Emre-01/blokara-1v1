// Ortak modu otomatik oynatıp bitiş ekranını test eder.
document.querySelector('[data-local="coop"]').click();

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function tryPiece(p) {
  var pieces = document.querySelectorAll('.piece');
  if (!pieces[p] || pieces[p].classList.contains('empty') || pieces[p].classList.contains('dead')) return false;
  var sharedBefore = document.querySelector('.turn-pill .tp-main').textContent;
  pieces[p].dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, clientX: 0, clientY: 0, pointerId: 21, pointerType: 'mouse'
  }));
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 21 }));
  await sleep(8);
  var cells = document.querySelectorAll('#board-shared .cell');
  for (var c = 0; c < cells.length; c++) {
    cells[c].click();
    await sleep(6);
    if (document.querySelector('.turn-pill .tp-main').textContent !== sharedBefore) return true;
    var overlay = document.querySelector('#overlay');
    if (overlay && !overlay.hidden) return true;
  }
  return false;
}

async function run() {
  await sleep(700);
  for (var turn = 0; turn < 500; turn++) {
    var overlay = document.querySelector('#overlay');
    if (overlay && !overlay.hidden) break;
    var moved = false;
    for (var p = 0; p < 3 && !moved; p++) moved = await tryPiece(p);
    if (!moved) break;
    await sleep(15);
  }
  await sleep(500);
  var overlay = document.querySelector('#overlay');
  var sheet = document.querySelector('.sheet');
  return {
    overlayVisible: !!overlay && !overlay.hidden,
    title: sheet.querySelector('h2') && sheet.querySelector('h2').textContent,
    badge: sheet.querySelector('.result-badge') && sheet.querySelector('.result-badge').textContent,
    meta: [].slice.call(sheet.querySelectorAll('.result-meta span')).map(function (s) { return s.textContent; }),
    note: sheet.querySelector('.result-note') && sheet.querySelector('.result-note').textContent,
    filled: document.querySelectorAll('#board-shared .cell.on').length
  };
}

run();
