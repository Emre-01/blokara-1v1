(function () {
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  return (async function () {
    var code = window.__JOIN_CODE;
    if (!code) return "kod yok";
    var card = document.getElementById("online-card");
    if (card) card.open = true;
    await wait(200);
    document.getElementById("player-name").value = "Ada";
    document.getElementById("join-code").value = code;
    document.getElementById("join-form").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    await wait(2500);
    var screen = document.querySelector(".screen:not([hidden])");
    return {
      screen: screen ? screen.id : null,
      lobbyTitle: (document.getElementById("lobby-title") || {}).textContent || null,
      toast: (document.querySelector(".toast") || {}).textContent || null,
      players: document.querySelectorAll(".lobby-player").length,
      startVisible: !!(document.getElementById("start-btn") && !document.getElementById("start-btn").hidden)
    };
  })();
})();
