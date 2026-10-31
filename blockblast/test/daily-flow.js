/* Günün tahtası ve seri akışını sürer (tek sayfa yüklemesi). */
(function () {
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  return (async function () {
    var dbg = window.BlokDebug;
    if (!dbg) return "BlokDebug yok";
    localStorage.removeItem("blokiki.profile.v1");

    var before = {
      state: document.getElementById("daily-state").textContent,
      button: document.getElementById("play-daily").textContent
    };

    document.getElementById("play-daily").click();
    await wait(400);
    var game = dbg.game();
    var firstTray = game.players[0].tray.map(function (p) { return p && p.name; }).join(",");

    game.players[0].score = 640;
    game.players[1].score = 100;
    for (var i = 0; i < 5; i++) dbg.tick(30);
    await wait(500);

    var overlay = document.getElementById("overlay");
    var overlayOpen = !overlay.hidden;
    var overlayText = overlay.hidden ? "" : document.querySelector(".sheet").innerText.replace(/\n+/g, " | ").slice(0, 400);
    var profile = JSON.parse(localStorage.getItem("blokiki.profile.v1") || "{}");

    // ana menüye dön ve kartın güncellendiğini gör
    document.querySelector("[data-home]").click();
    await wait(500);

    return {
      before: before,
      dailyMode: game ? "ok" : "yok",
      firstTray: firstTray,
      overlayOpen: overlayOpen,
      overlayText: overlayText,
      dailyStreak: profile.dailyStreak,
      dailyLast: profile.dailyLast,
      dailyBest: profile.dailyBest,
      bestDaily: profile.best && profile.best.daily,
      afterState: document.getElementById("daily-state").textContent,
      afterButton: document.getElementById("play-daily").textContent,
      streakChip: document.getElementById("daily-streak").textContent
    };
  })();
})();
