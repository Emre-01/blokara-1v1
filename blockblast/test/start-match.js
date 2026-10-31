(function () {
  var b = document.getElementById("start-btn");
  if (!b) return "start yok";
  b.click();
  return new Promise(function (resolve) {
    setTimeout(function () {
      var screen = document.querySelector(".screen:not([hidden])");
      var board = document.querySelector(".board");
      resolve({
        screen: screen ? screen.id : null,
        boardId: board ? board.id : null,
        boardCount: document.querySelectorAll(".board").length,
        pill: (document.querySelector(".turn-pill .tp-main") || {}).textContent || null,
        time: (document.getElementById("time-left") || {}).textContent || null,
        toast: (document.querySelector(".toast") || {}).textContent || null
      });
    }, 1600);
  });
})();
