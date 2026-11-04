/* Oda kodu sahnesi: gerçek sunucudan oda kurulur, kod görünür. */
(async function () {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const lang = new URLSearchParams(location.search).get("lang") || "tr";
  try { localStorage.clear(); } catch (e) { }
  BlokI18n.setLang(lang);
  await wait(700);

  const input = document.querySelector("#player-name");
  if (input) {
    input.value = "Ada";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const host = document.querySelector('[data-host="coop"]');
  if (host) host.click();
  await wait(1500);

  const dbg = window.BlokDebug;
  document.querySelectorAll(".toast").forEach((el) => el.remove());
  return {
    screen: dbg.status().screen,
    room: dbg.status().room,
    phase: dbg.snapshot() ? dbg.snapshot().phase : null
  };
})()
