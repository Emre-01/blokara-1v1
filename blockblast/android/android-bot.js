/* Emülatörde bot turunu sürer: node android/drive.cjs @android/android-bot.js */
(async function () {
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  document.getElementById("play-bot").click();
  await wait(800);

  var piece = document.querySelector('.piece[data-piece="0"]');
  var rect = piece.getBoundingClientRect();
  var opts = {
    bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch", isPrimary: true,
    clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2
  };
  piece.dispatchEvent(new PointerEvent("pointerdown", opts));
  await wait(80);
  document.dispatchEvent(new PointerEvent("pointerup", opts));
  await wait(350);
  document.querySelector('.cell[data-r="0"][data-c="0"]').click();
  await wait(2500);

  var overlay = document.getElementById("overlay");
  return {
    scores: Array.prototype.map.call(document.querySelectorAll(".score-value"), function (el) { return el.textContent; }),
    clock: (document.getElementById("time-left") || {}).textContent,
    hint: (document.getElementById("game-hint") || {}).textContent,
    overlay: !overlay.hidden,
    overlayText: overlay.hidden ? "" : document.querySelector(".sheet").innerText.replace(/\n+/g, " | ").slice(0, 220)
  };
})();
