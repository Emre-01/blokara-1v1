/* Ana ekran sahnesi: temiz profil, tek ekran, kaydırma yok. */
(async function () {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const lang = new URLSearchParams(location.search).get("lang") || "tr";
  try { localStorage.clear(); } catch (e) { }
  BlokI18n.setLang(lang);
  await wait(800);
  document.querySelectorAll(".sheet").forEach((el) => { el.hidden = true; });
  const overlay = document.getElementById("overlay");
  if (overlay) overlay.hidden = true;
  await wait(250);
  return { screen: window.BlokDebug.status().screen, lang };
})()
