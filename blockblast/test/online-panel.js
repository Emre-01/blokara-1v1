(function () {
  return (async function () {
    var card = document.getElementById("online-card");
    card.open = true;
    await new Promise(function (r) { setTimeout(r, 250); });
    card.scrollIntoView({ block: "center" });
    await new Promise(function (r) { setTimeout(r, 250); });
    return {
      open: card.open,
      hasJoin: !!document.getElementById("join-code"),
      hasHost: document.querySelectorAll("#online-card [data-host]").length,
      h: Math.round(card.getBoundingClientRect().height)
    };
  })();
})();
