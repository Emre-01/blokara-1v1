(function () {
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  return (async function () {
    var card = document.getElementById("online-card");
    if (!card) return "online kartı yok";
    card.open = true;
    await wait(300);
    var name = document.getElementById("player-name");
    name.value = "Emre";
    var host = document.querySelector('#online-card [data-host="coop"]');
    if (!host) return "oda kur düğmesi yok";
    host.click();
    await wait(2500);
    var code = document.getElementById("lobby-code");
    var screen = document.getElementById("screen-lobby");
    return {
      screen: document.querySelector(".screen:not([hidden])").id,
      hidden: screen ? screen.hidden : null,
      code: code ? code.textContent.trim() : null,
      toast: (document.querySelector(".toast") || {}).textContent || null,
      title: (document.getElementById("lobby-title") || {}).textContent || null
    };
  })();
})();
