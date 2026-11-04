/* Tek kişilik oyun sahnesi: yarı dolu tahta, üç taş, temiz üst bar. */
(async function () {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const lang = new URLSearchParams(location.search).get("lang") || "tr";
  try { localStorage.clear(); } catch (e) { }
  BlokI18n.setLang(lang);
  await wait(700);
  const dbg = window.BlokDebug;
  dbg.start("solo");
  await wait(600);

  const colors = ["coral", "mustard", "cobalt", "mint", "violet"];
  const board = [
    [5, 0, 1, 3, 0], [5, 3, 1, 2, 1], [6, 0, 1, 5, 2],
    [6, 5, 1, 3, 3], [7, 0, 1, 2, 4], [7, 2, 1, 6, 0]
  ];
  board.forEach((row) => dbg.fillRegion(row[0], row[1], row[2], row[3], colors[row[4]]));
  await wait(400);
  document.querySelectorAll(".toast, .fx, .confetti").forEach((el) => el.remove());
  await wait(200);
  return { screen: dbg.status().screen, phase: dbg.snapshot().phase };
})()
