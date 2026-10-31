(function () {
  return (async function () {
    document.getElementById("play-bot").click();
    await new Promise(function (r) { setTimeout(r, 800); });
    var board = document.querySelector(".board");
    var br = board.getBoundingClientRect();
    function box(sel) {
      var el = document.querySelector(sel);
      if (!el) return null;
      var r = el.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), w: Math.round(r.width) };
    }
    return {
      vh: innerHeight,
      scrollH: document.documentElement.scrollHeight,
      scoreboard: box("#scoreboard"),
      table: box("#table-area"),
      board: box(".board"),
      tray: box("#tray"),
      foot: box(".game-foot"),
      game: box("#screen-game"),
      topbar: box(".topbar")
    };
  })();
})();
