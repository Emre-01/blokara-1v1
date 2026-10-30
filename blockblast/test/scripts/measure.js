document.querySelector('[data-local="versus"]').click();
new Promise(function (resolve) {
  setTimeout(function () {
    var pill = document.querySelector('.turn-pill');
    var main = document.querySelector('.turn-pill .tp-main');
    var board = document.querySelector('#board-0');
    var area = document.querySelector('#table-area');
    var r = function (el) { var b = el.getBoundingClientRect(); return { x: Math.round(b.x), w: Math.round(b.width), y: Math.round(b.y), h: Math.round(b.height) }; };
    resolve({
      pill: r(pill),
      pillStyle: {
        minWidth: getComputedStyle(pill).minWidth,
        maxWidth: getComputedStyle(pill).maxWidth,
        overflow: getComputedStyle(pill).overflow
      },
      main: r(main),
      mainScroll: { sw: main.scrollWidth, cw: main.clientWidth },
      board: r(document.querySelector('#board-0')),
      area: r(area),
      areaStyle: { justify: getComputedStyle(area).justifyContent, dir: getComputedStyle(area).flexDirection }
    });
  }, 700);
});
