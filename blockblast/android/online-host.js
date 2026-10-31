(function () {
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  return (async function () {
    var name = document.getElementById("player-name");
    name.value = "Telefon";
    name.dispatchEvent(new Event("input", { bubbles: true }));

    var card = document.getElementById("online-card");
    if (card) card.open = true;

    var host = document.querySelector('[data-host="versus"]');
    if (!host) return "oda kur butonu yok";
    host.click();
    await wait(1600);

    var code = (document.getElementById("lobby-code") || {}).textContent;
    var slotCount = document.querySelectorAll("#lobby-slots li").length;
    return {
      screen: !document.getElementById("screen-lobby").hidden,
      code: code,
      players: slotCount,
      server: window.BlokIkiServer ? window.BlokIkiServer.serverUrl() : null
    };
  })();
})();
