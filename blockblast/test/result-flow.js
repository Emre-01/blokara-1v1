/* Sonuç ekranını ve ödül akışını sürer. */
(function () {
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  return (async function () {
    var dbg = window.BlokDebug;
    if (!dbg) return "BlokDebug yok";
    localStorage.clear();
    dbg.start("versus", { timeMode: "shared" });
    await wait(300);
    var game = dbg.game();
    game.players[0].score = 420;
    game.players[1].score = 90;
    dbg.tick(30);
    dbg.tick(30);
    dbg.tick(30);
    dbg.tick(30);
    dbg.tick(30);
    await wait(500);
    var after = dbg.snapshot();
    var overlay = document.getElementById("overlay");
    var profile = JSON.parse(localStorage.getItem("blokiki.profile.v1") || "{}");
    return {
      phase: after.phase,
      winner: after.winner,
      overlayOpen: !overlay.hidden,
      overlayText: document.querySelector(".sheet").innerText.replace(/\n+/g, " | ").slice(0, 700),
      profile: {
        xp: profile.xp, coins: profile.coins, games: profile.games,
        wins: profile.wins, best: profile.best, bestAny: profile.bestAny
      },
      levelGone: !document.getElementById("level-num") && !document.getElementById("level-badge"),
      homeCoins: document.getElementById("stat-coins").textContent
    };
  })();
})();
