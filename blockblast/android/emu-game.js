(function () {
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  return (async function () {
    var btn = document.getElementById("play-bot");
    if (!btn) return "buton yok";
    btn.click();
    await wait(1200);
    var board = document.querySelector(".board");
    return {
      game: !document.getElementById("screen-game").hidden,
      cells: board ? board.children.length : 0,
      hint: (document.getElementById("game-hint") || {}).textContent
    };
  })();
})();
