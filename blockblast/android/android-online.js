/* APK içinden uzak oda kurmayı dener: node android/drive.cjs @android/android-online.js */
(async function () {
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var exitBtn = document.getElementById("exit-btn");
  if (!exitBtn.hidden) {
    exitBtn.click();
    await wait(300);
    var confirm = document.querySelector("[data-confirm]");
    if (confirm) confirm.click();
    await wait(600);
  }
  document.getElementById("player-name").value = "Emre";
  document.querySelector('[data-host="coop"]').click();
  await wait(2500);
  return {
    lobby: !document.getElementById("screen-lobby").hidden,
    code: document.getElementById("lobby-code").textContent,
    slots: document.querySelectorAll("#lobby-slots .slot").length,
    toast: (document.getElementById("toast") || {}).textContent
  };
})();
