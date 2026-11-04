(function () {
  return (async function () {
    document.querySelector('[data-local="solo"]').click();
    await new Promise(function (r) { setTimeout(r, 1400); });
    return {
      cards: Array.prototype.map.call(document.querySelectorAll(".score-card"), function (el) {
        var r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      }),
      pill: Math.round(document.querySelector(".turn-pill").getBoundingClientRect().width)
    };
  })();
})();
