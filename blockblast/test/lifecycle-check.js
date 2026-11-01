/* Android WebView'da sayaç duraklatma + geri tuşu davranışını dener. */
(async () => {
  const q = (s) => document.querySelector(s);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const secs = (text) => {
    const m = /^(\d+):(\d+)$/.exec((text || "").trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const out = {};

  /* temiz başlangıç */
  q("#screen-home").hidden = false;
  q("#screen-game").hidden = true;
  q("#screen-lobby").hidden = true;

  /* ortak süre seç ki sayaç görünsün */
  var sharedBtn = q('#time-mode button[data-time="shared"]');
  if (sharedBtn) sharedBtn.click();
  await wait(120);

  q("[data-local=\"coop\"]").click();
  await wait(700);
  out.started = !q("#screen-game").hidden;
  out.timerStart = q("#time-left").textContent;

  /* menü açıkken sayaç durmalı */
  q("#game-menu").click();
  await wait(300);
  out.menuOpen = !q("#overlay").hidden;
  await wait(3500);
  out.timerAfterMenu = q("#time-left").textContent;
  out.pausedSeconds = secs(out.timerStart) - secs(out.timerAfterMenu);

  /* geri tuşu menüyü kapatmalı */
  out.backClosedMenu = window.BlokBack() === true;
  await wait(400);
  out.menuClosed = q("#overlay").hidden;
  const t1 = q("#time-left").textContent;
  await wait(2600);
  out.timerAfterResume = q("#time-left").textContent;
  out.resumedSeconds = secs(t1) - secs(out.timerAfterResume);

  /* oyun ekranında geri tuşu duraklatma menüsü açmalı */
  out.backOpenedMenu = window.BlokBack() === true;
  await wait(350);
  out.pauseMenuShown = !q("#overlay").hidden;
  out.pauseTitle = (q(".sheet h2") || {}).textContent || "";

  /* "Oyundan çık" onay ister; onayla ve eve dön */
  const exitBtn = q(".sheet [data-exit]");
  if (exitBtn) exitBtn.click();
  await wait(400);
  out.confirmShown = !q("#overlay").hidden;
  const confirmBtn = q(".sheet [data-confirm]");
  if (confirmBtn) confirmBtn.click();
  await wait(600);
  out.homeVisible = !q("#screen-home").hidden;
  out.gameHidden = q("#screen-game").hidden;

  /* ana ekranda geri tuşu uygulamayı kapatmalı (false) */
  out.backOnHome = window.BlokBack();

  out.ok =
    out.started === true &&
    out.pausedSeconds === 0 &&
    out.menuClosed === true &&
    out.resumedSeconds >= 2 &&
    out.pauseMenuShown === true &&
    out.confirmShown === true &&
    out.homeVisible === true &&
    out.backOnHome === false;
  return out;
})()
