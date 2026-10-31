/* Sunucu adresi boşken çevrimiçi denemenin nazik hata verdiğini doğrular. */
(async function () {
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var exitBtn = document.getElementById("exit-btn");
  if (!exitBtn.hidden) {
    exitBtn.click();
    await wait(300);
    var confirm = document.querySelector("[data-confirm]");
    if (confirm) confirm.click();
    await wait(700);
  }
  document.querySelector('[data-host="coop"]').click();
  await wait(1800);
  return {
    lobby: !document.getElementById("screen-lobby").hidden,
    toast: document.getElementById("toast").textContent,
    toastVisible: !document.getElementById("toast").hidden,
    serverOpen: document.getElementById("server-field").open
  };
})();
