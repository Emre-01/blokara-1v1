// Rakip modunu otomatik oynatıp bitiş ekranını test eder.
document.querySelector('[data-local="versus"]').click();

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function bruteMove() {
  var boards = document.querySelectorAll('.board');
  var active = boards[0];
  var pieces = [].slice.call(document.querySelectorAll('.piece'));
  for (var p = 0; p < pieces.length; p++) {
    if (pieces[p].classList.contains('empty') || pieces[p].classList.contains('dead')) continue;
    pieces[p].dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, clientX: 0, clientY: 0, pointerId: 11, pointerType: 'mouse'
    }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 11 }));
    await sleep(20);
    var cells = active.querySelectorAll('.cell');
    for (var i = 0; i < cells.length; i++) {
      var el = cells[i];
      var before = document.querySelectorAll('.cell.on').length;
      el.click();
      await sleep(12);
      var overlay = document.querySelector('#overlay');
      if (overlay && !overlay.hidden) return true;
      pieces = [].slice.call(document.querySelectorAll('.piece'));
      if (!pieces[p] || pieces[p].classList.contains('empty') || pieces[p].classList.contains('dead')) return true;
    }
  }
  return false;
}

function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function run() {
  await delay(800);
  for (var turn = 0; turn < 220; turn++) {
    var overlay = document.querySelector('#overlay');
    if (overlay && !overlay.hidden) break;
    await bruteMove();
    await delay(30);
  }
  await delay(500);
  var overlay = document.querySelector('#overlay');
  var sheet = document.querySelector('.sheet');
  return {
    overlayVisible: overlay && !overlay.hidden,
    title: sheet.querySelector('h2') && sheet.querySelector('h2').textContent,
    badge: sheet.querySelector('.result-badge') && sheet.querySelector('.result-badge').textContent,
    rows: [].slice.call(sheet.querySelectorAll('.result-row')).map(function (r) { return r.textContent.trim(); })
  };
}

run();
