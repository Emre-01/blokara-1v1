/* Profil menüsü testi: tema / emote / mağaza sekmeleri (Chrome CDP).
   node --experimental-websocket test/profile-menu.cjs */
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

if (typeof WebSocket === "undefined") {
  const child = spawn(process.execPath, ["--experimental-websocket", __filename].concat(process.argv.slice(2)), { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code || 0));
  return;
}

const SERVER_PORT = 8099;
const CDP_PORT = 9468;
const ROOT = path.join(__dirname, "..");
const BASE = "http://127.0.0.1:" + SERVER_PORT + "/";

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].find((p) => fs.existsSync(p));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, [path.join(ROOT, "server.cjs")], {
  env: Object.assign({}, process.env, { PORT: String(SERVER_PORT), HOST: "127.0.0.1" }),
  stdio: ["ignore", "pipe", "pipe"]
});

let chrome = null;
const profile = path.join(os.tmpdir(), "blok-profile-" + process.pid);

function getJson(pathname, method) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: CDP_PORT, path: pathname, method: method || "GET" }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.on("error", reject);
    req.end();
  });
}

async function waitForChrome() {
  for (let i = 0; i < 80; i++) {
    try { await getJson("/json/version"); return; } catch (e) { await wait(200); }
  }
  throw new Error("Chrome açılmadı");
}

async function openPage(url) {
  const target = await getJson("/json/new?" + encodeURIComponent(url), "PUT");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const entry = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)));
      else entry.resolve(msg.result);
    }
  });
  const call = (method, params) => new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params: params || {} }));
  });
  await call("Runtime.enable");
  await call("Page.enable");
  const evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error("JS: " + JSON.stringify(result.exceptionDetails.exception || result.exceptionDetails));
    return result.result && result.result.value;
  };
  const viewport = (width, height) => call("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile: true
  });
  await viewport(412, 915);
  const reload = async () => {
    await call("Page.reload", { ignoreCache: true });
    await wait(1200);
  };
  return { ws, evaluate, viewport, reload, close: () => ws.close() };
}

async function boot(page) {
  for (let i = 0; i < 40; i++) {
    const ready = await page.evaluate("!!(window.BlokDebug && document.getElementById('account-avatar'))").catch(() => false);
    if (ready) return;
    await wait(200);
  }
  throw new Error("Sayfa hazır olmadı");
}

let step = 0;
function ok(name, condition, detail) {
  step++;
  if (!condition) {
    console.error("✗ " + name + (detail === undefined ? "" : " → " + JSON.stringify(detail)));
    throw new Error(name);
  }
  console.log("✓ " + name);
}

/* Açık pencerenin her sekmesinde kaydırma taşması olmamalı. */
const PANE_OVERFLOW = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const sheet = document.querySelector('.sheet');
  const out = {};
  for (const name of ['theme', 'emote', 'fx', 'avatar']) {
    document.querySelector('[data-profile-tab="' + name + '"]').click();
    await sleep(140);
    out[name] = Math.max(0, sheet.scrollHeight - sheet.clientHeight);
  }
  out.page = Math.max(0, document.documentElement.scrollHeight - innerHeight);
  return out;
})()`;

async function main() {
  await wait(700);

  chrome = spawn(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-proxy-server",
    "--remote-debugging-port=" + CDP_PORT,
    "--user-data-dir=" + profile,
    "--no-first-run",
    "about:blank"
  ], { stdio: "ignore" });
  await waitForChrome();

  const page = await openPage(BASE + "?test=1");
  await boot(page);

  /* ---- avatar bir düğme olmalı ve menüyü açmalı ---- */
  const avatar = await page.evaluate(`(() => {
    const el = document.getElementById('account-avatar');
    return {
      tag: el.tagName,
      label: el.getAttribute('aria-label'),
      popup: el.getAttribute('aria-haspopup'),
      hidden: el.getAttribute('aria-hidden')
    };
  })()`);
  ok("avatar bir düğme", avatar.tag === "BUTTON", avatar);
  ok("avatar erişilebilir adı var", !!avatar.label, avatar);
  ok("avatar menü açacağını bildiriyor", avatar.popup === "dialog", avatar);
  ok("avatar ekran okuyucudan gizli değil", avatar.hidden === null, avatar);

  /* ---- profil tek satır üst barda, çevrimiçi oyun en üstte ---- */
  const topBar = await page.evaluate(`(() => {
    const bar = document.querySelector('.topbar');
    const profile = document.getElementById('top-profile');
    const account = document.getElementById('account-strip');
    const stats = document.getElementById('profile-strip');
    const row = document.querySelector('.topbar-row');
    const online = document.getElementById('online-card');
    const modes = document.querySelector('#screen-home .mode-grid');
    return {
      profileInBar: bar.contains(profile),
      accountInProfile: profile.contains(account),
      statsInProfile: profile.contains(stats),
      inTopRow: row.contains(profile),
      removedFromHome: !document.getElementById('screen-home').contains(stats),
      nameInBar: bar.contains(document.getElementById('player-name')),
      levelGone: !document.getElementById('level-num') && !document.getElementById('level-badge'),
      modeCards: [...document.querySelectorAll('#screen-home .mode-card')].length,
      versusGone: !document.querySelector('#screen-home .mode-card.versus'),
      onlineOnTop: online.getBoundingClientRect().top < modes.getBoundingClientRect().top,
      onlineOrder: getComputedStyle(online).order
    };
  })()`);
  ok("profil üst barda, ikonların yanında tek satır",
    topBar.profileInBar && topBar.accountInProfile && topBar.statsInProfile && topBar.inTopRow, topBar);
  ok("profil şeridi eski yerinden (ana ekran gövdesi) kaldırıldı", topBar.removedFromHome === true, topBar);
  ok("seviye ve XP alanları ana ekrandan tamamen kaldırıldı", topBar.levelGone === true, topBar);
  ok("aynı cihazda iki tahtalı rakip kartı kaldırıldı",
    topBar.modeCards === 2 && topBar.versusGone, topBar);
  ok("çevrimiçi oyun ana ekranda en üstte",
    topBar.onlineOnTop && topBar.onlineOrder === "1", topBar);

  const screenSwitch = await page.evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    window.BlokDebug.start('solo', { timeMode: 'none' });
    await sleep(300);
    const inGame = getComputedStyle(document.getElementById('top-profile')).display;
    const attr = document.body.dataset.screen;
    window.BlokDebug.finish(0, 'test');
    await sleep(300);
    const homeBtn = document.querySelector('#overlay [data-home]');
    if (homeBtn) homeBtn.click();
    await sleep(400);
    const inHome = getComputedStyle(document.getElementById('top-profile')).display;
    return { inGame, inHome, attr, backHome: document.body.dataset.screen };
  })()`);
  ok("oyuna girince üst profil gizleniyor", screenSwitch.inGame === "none" && screenSwitch.attr === "game", screenSwitch);
  ok("ana menüye dönünce üst profil geri geliyor",
    screenSwitch.inHome !== "none" && screenSwitch.backHome === "home", screenSwitch);

  await page.evaluate(`document.getElementById('account-avatar').click(); new Promise(r => setTimeout(r, 300))`);
  const opened = await page.evaluate(`({
    open: !document.getElementById('overlay').hidden,
    heading: document.querySelector('.sheet h2') ? document.querySelector('.sheet h2').textContent : '',
    tabs: [...document.querySelectorAll('[data-profile-tab]')].map((t) => t.dataset.profileTab),
    selected: [...document.querySelectorAll('[data-profile-tab]')].filter((t) => t.getAttribute('aria-selected') === 'true').map((t) => t.dataset.profileTab),
    panes: [...document.querySelectorAll('[data-profile-pane]')].map((p) => p.dataset.profilePane),
    bodyOverflow: document.body.style.overflow
  })`);
  ok("avatar menüyü açıyor", opened.open === true, opened);
  ok("menüde dört sekme var", opened.tabs.join(",") === "theme,emote,fx,avatar", opened.tabs);
  ok("tek sekme seçili", opened.selected.length === 1 && opened.selected[0] === "theme", opened.selected);
  ok("dört bölüm var", opened.panes.join(",") === "theme,emote,fx,avatar", opened.panes);
  ok("menü açıkken sayfa kilitli", opened.bodyOverflow === "hidden", opened.bodyOverflow);

  /* ---- sekmeler ---- */
  const switched = await page.evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    document.querySelector('[data-profile-tab="fx"]').click();
    await sleep(150);
    const tab = document.querySelector('[data-profile-tab="fx"]');
    return {
      selected: tab.getAttribute('aria-selected'),
      active: tab.classList.contains('is-active'),
      visible: [...document.querySelectorAll('[data-profile-pane]')]
        .filter((p) => !p.hidden).map((p) => p.dataset.profilePane)
    };
  })()`);
  ok("sekmeye basınca seçim değişiyor", switched.selected === "true" && switched.active, switched);
  ok("yalnızca seçili bölüm görünüyor", switched.visible.join(",") === "fx", switched.visible);

  const keys = await page.evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const first = document.querySelector('[data-profile-tab="theme"]');
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await sleep(120);
    const afterRight = document.activeElement.dataset.profileTab;
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await sleep(120);
    return { afterRight, afterLeft: document.activeElement.dataset.profileTab };
  })()`);
  ok("ok tuşu sağa sekme geçiyor", keys.afterRight === "emote", keys);
  ok("ok tuşu sola sekme geçiyor", keys.afterLeft === "theme", keys);

  /* ---- temalar ---- */
  const themes = await page.evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const picks = [...document.querySelectorAll('[data-theme-pick]')];
    const out = {
      count: picks.length,
      locked: picks.filter((p) => p.classList.contains('is-locked')).map((p) => p.dataset.themePick),
      applied: {}, saved: null, meta: null, attr: null
    };
    for (const pick of picks) {
      if (pick.classList.contains('is-locked')) continue;
      pick.click();
      await sleep(400);
      out.applied[pick.dataset.themePick] = getComputedStyle(document.body).backgroundColor;
    }
    out.attr = document.documentElement.getAttribute('data-theme');
    out.saved = localStorage.getItem('blokara.theme');
    out.meta = document.querySelector('meta[name="theme-color"]').content;
    return out;
  })()`);
  ok("altı tema var", themes.count === 6, themes.count);
  ok("reklamla açılan iki tema kilitli", themes.locked.join(",") === "autumn,cotton", themes.locked);
  const colors = Object.keys(themes.applied).map((k) => themes.applied[k]);
  ok("açık temaların her biri farklı zemin rengi veriyor", new Set(colors).size === 4, themes.applied);
  ok("seçim html üzerine yazılıyor", themes.attr === "sunset", themes.attr);
  ok("seçim kalıcı kaydediliyor", themes.saved === "sunset", themes.saved);
  ok("tarayıcı çubuğu rengi güncelleniyor", /^#[0-9A-F]{6}$/i.test(themes.meta), themes.meta);

  /* ---- emote önizlemesi ---- */
  const emotes = await page.evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    document.querySelector('[data-profile-tab="emote"]').click();
    await sleep(150);
    const chips = [...document.querySelectorAll('[data-profile-emote]')];
    const locked = [...document.querySelectorAll('[data-emote-unlock]')];
    chips[0].click();
    await sleep(180);
    return {
      count: chips.length,
      locked: locked.length,
      names: chips.map((c) => c.querySelector('.profile-emote-name').textContent),
      bubble: document.querySelectorAll('#emote-layer .emote-bubble').length,
      status: document.getElementById('emote-status').textContent
    };
  })()`);
  ok("dört açık emote önizlemesi var", emotes.count === 4, emotes.count);
  ok("iki emote reklamla açılıyor", emotes.locked === 2, emotes.locked);
  ok("emote adları dolu", emotes.names.every((n) => !!n.trim()), emotes.names);
  ok("emote seçince balon canlanıyor", emotes.bubble === 1, emotes.bubble);
  ok("emote ekran okuyucuya duyuruluyor", !!emotes.status, emotes.status);

  /* ---- efekt seçimi ---- */
  const fx = await page.evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    document.querySelector('[data-profile-tab="fx"]').click();
    await sleep(150);
    const burst = [...document.querySelectorAll('[data-fx-kind="burst"]')];
    const win = [...document.querySelectorAll('[data-fx-kind="win"]')];
    const burstIds = burst.map((b) => b.dataset.fxPick);
    const winIds = win.map((b) => b.dataset.fxPick);
    /* Seçim bölümü yerinde tazelediği için her tıklamadan sonra yeniden sorgula. */
    burst[2].click();
    await sleep(200);
    document.querySelector('[data-fx-kind="win"][data-fx-pick="fireworks"]').click();
    await sleep(250);
    return {
      burstIds,
      winIds,
      activeBurst: [...document.querySelectorAll('[data-fx-kind="burst"][aria-pressed="true"]')]
        .map((b) => b.dataset.fxPick),
      activeWin: [...document.querySelectorAll('[data-fx-kind="win"][aria-pressed="true"]')]
        .map((b) => b.dataset.fxPick),
      groups: [...document.querySelectorAll('[data-profile-pane="fx"] .fx-group-title')]
        .map((t) => t.textContent),
      saved: JSON.parse(localStorage.getItem('blokara.fx') || 'null')
    };
  })()`);
  ok("dört patlama efekti var", fx.burstIds.join(",") === "classic,pixel,bubble,spark", fx.burstIds);
  ok("dört kazanma efekti var", fx.winIds.join(",") === "confetti,fireworks,stars,bubbles", fx.winIds);
  ok("seçilen efekt işaretleniyor",
    fx.activeBurst.join(",") === "bubble" && fx.activeWin.join(",") === "fireworks", fx);
  ok("efekt seçimi kalıcı kaydediliyor",
    !!fx.saved && fx.saved.burst === "bubble" && fx.saved.win === "fireworks", fx.saved);
  ok("efektler iki gruba ayrılmış", fx.groups.length === 2, fx.groups);

  /* ---- hazır avatar galerisi ---- */
  const gallery = await page.evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    document.querySelector('[data-profile-tab="avatar"]').click();
    await sleep(150);
    const picks = [...document.querySelectorAll('[data-avatar-pick]')];
    const arts = picks.map((p) => p.querySelector('.avatar-pick-art').style.backgroundImage);
    const count = picks.length;
    picks[3].click();
    await sleep(250);
    const avatarEl = document.getElementById('account-avatar');
    return {
      count,
      allArt: arts.every((a) => /^url\\("data:image\\/svg\\+xml/.test(a)),
      active: [...document.querySelectorAll('[data-avatar-pick][aria-pressed="true"]')]
        .map((p) => p.dataset.avatarPick),
      saved: localStorage.getItem('blokara.avatar'),
      topbarPhoto: avatarEl.classList.contains('has-photo'),
      topbarImage: avatarEl.style.backgroundImage,
      hasReset: !!document.querySelector('[data-avatar-reset]'),
      photoInput: !!document.getElementById('photo-input'),
      fileInputs: document.querySelectorAll('input[type="file"]').length
    };
  })()`);
  ok("galeride on iki hazır avatar var", gallery.count === 12, gallery.count);
  ok("her avatar yerleşik SVG olarak üretiliyor", gallery.allArt === true, gallery.allArt);
  ok("avatar seçimi işaretleniyor", gallery.active.join(",") === "cat", gallery.active);
  ok("avatar seçimi kalıcı kaydediliyor", gallery.saved === "cat", gallery.saved);
  ok("seçilen avatar üst barda görünüyor",
    gallery.topbarPhoto === true && /data:image/.test(gallery.topbarImage), gallery);
  ok("fotoğraf dosyası seçimi kaldırıldı",
    gallery.photoInput === false && gallery.fileInputs === 0, gallery);

  const avatarReset = await page.evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    document.querySelector('[data-avatar-reset]').click();
    await sleep(250);
    return {
      saved: localStorage.getItem('blokara.avatar'),
      active: [...document.querySelectorAll('[data-avatar-pick][aria-pressed="true"]')].length,
      resetGone: !document.querySelector('[data-avatar-reset]'),
      topbarPhoto: document.getElementById('account-avatar').classList.contains('has-photo')
    };
  })()`);
  ok("avatar kaldırılabiliyor",
    avatarReset.saved === null && avatarReset.active === 0 && avatarReset.resetGone === true, avatarReset);
  ok("avatar kaldırılınca üst bar baş harfe dönüyor", avatarReset.topbarPhoto === false, avatarReset);

  const removedUi = await page.evaluate(`({
    storePane: !!document.querySelector('[data-profile-pane="store"]'),
    storeTab: !!document.querySelector('[data-profile-tab="store"]'),
    coin: !!document.getElementById('stat-coins'),
    coinText: /\\bcoin\\b/i.test(document.querySelector('.sheet').innerText)
  })`);
  ok("mağaza sekmesi ve bölümü kaldırıldı",
    removedUi.storePane === false && removedUi.storeTab === false, removedUi);
  ok("menüde coin ifadesi kalmadı", removedUi.coin === false && removedUi.coinText === false, removedUi);

  /* ---- reklamları kaldır: üst barda, ikonların yanında ---- */
  const adFreePlacement = await page.evaluate(`(() => {
    const button = document.getElementById('buy-remove-ads');
    const actions = document.querySelector('.top-actions');
    const icons = [...actions.querySelectorAll('.icon-btn')];
    return {
      inTopActions: actions.contains(button),
      afterBrand: button.getBoundingClientRect().top < 120,
      hiddenWithoutBilling: button.hidden,
      label: button.getAttribute('aria-label'),
      index: icons.indexOf(button)
    };
  })()`);
  ok("reklam kaldırma düğmesi üst çubukta, ikonların arasında",
    adFreePlacement.inTopActions && adFreePlacement.afterBrand && adFreePlacement.index >= 0, adFreePlacement);
  ok("satın alma yolu yokken düğme gizli", adFreePlacement.hiddenWithoutBilling === true, adFreePlacement);

  const purchaseFlow = await page.evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const calls = [];
    /* Reklam köprüsü olmadan düğme görünmez (reklamsız test sürümü);
       satın alma akışını sınamak için iki köprü de tanımlanır. */
    window.__banner = [];
    window.BlokAds = {
      available: () => true,
      hasRewarded: () => true,
      hasBanner: () => true,
      showBanner: () => window.__banner.push('show'),
      hideBanner: () => window.__banner.push('hide')
    };
    window.BlokBilling = {
      available: () => true,
      owned: () => false,
      purchase: () => { calls.push('purchase'); }
    };
    window.BlokBillingEvent('refresh-ui');
    await sleep(150);
    const button = document.getElementById('buy-remove-ads');
    const shown = !button.hidden;
    button.click();
    await sleep(220);
    const sheet = document.querySelector('#overlay .sheet');
    const opened = !!sheet && !document.getElementById('overlay').hidden;
    const heading = sheet ? sheet.querySelector('h2').textContent : '';
    const confirm = sheet ? sheet.querySelector('[data-buy-ads-confirm]') : null;
    const closeBtn = sheet ? sheet.querySelector('[data-close]') : null;
    if (confirm) confirm.click();
    await sleep(200);
    return { shown, opened, heading, hasConfirm: !!confirm, hasClose: !!closeBtn, calls, closedAfterBuy: document.getElementById('overlay').hidden };
  })()`);
  ok("satın alma varsa düğme görünür", purchaseFlow.shown === true, purchaseFlow);
  ok("düğme onay penceresini açıyor", purchaseFlow.opened === true, purchaseFlow);
  ok("pencerede satın alma ve kapat düğmeleri var",
    purchaseFlow.hasConfirm === true && purchaseFlow.hasClose === true, purchaseFlow);
  ok("onay gerçek satın almayı başlatıyor", purchaseFlow.calls.length === 1, purchaseFlow.calls);
  ok("satın alma başlayınca pencere kapanıyor", purchaseFlow.closedAfterBuy === true, purchaseFlow);

  const owned = await page.evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const banner = window.__banner || (window.__banner = []);
    banner.length = 0;
    /* Yeni köprü nesnesi: uygulama banner durumunu yeniden uygular. */
    window.BlokAds = {
      available: () => true,
      hasRewarded: () => true,
      hasBanner: () => true,
      showBanner: () => banner.push('show'),
      hideBanner: () => banner.push('hide')
    };
    window.BlokBillingEvent('owned');
    await sleep(200);
    const button = document.getElementById('buy-remove-ads');
    const state = window.BlokDebug.adsState();
    return {
      hidden: button.hidden,
      ownedClass: button.classList.contains('is-owned'),
      pressed: button.getAttribute('aria-pressed'),
      state,
      saved: localStorage.getItem('blokara.adsFree'),
      banner
    };
  })()`);
  ok("satın alınınca üst bardaki düğme kayboluyor", owned.hidden === true, owned);
  ok("reklamsız durum kaydediliyor", owned.state.free === true && owned.saved === "1", owned);
  ok("satın alınınca banner kapatılıyor", owned.banner.indexOf("hide") >= 0, owned.banner);

  const ownedState = await page.evaluate(`window.BlokDebug.adsState()`);
  ok("reklamsız durum bellekte", ownedState.free === true, ownedState);

  /* Yeniden yükleme: satın alma yerelde hatırlanmalı. */
  await page.reload();
  await boot(page);
  const persistsFree = await page.evaluate(`({
    hidden: document.getElementById('buy-remove-ads').hidden,
    free: window.BlokDebug.adsState().free,
    pressed: document.getElementById('buy-remove-ads').getAttribute('aria-pressed')
  })`);
  ok("reklamsız durum yeniden açılışta da geçerli",
    persistsFree.hidden === true && persistsFree.free === true, persistsFree);

  /* ---- taşma yok ---- */
  await page.evaluate(`document.getElementById('account-avatar').click(); new Promise(r => setTimeout(r, 250))`);
  const big = await page.evaluate(PANE_OVERFLOW);
  ok("412×915 hiçbir sekmede taşma yok", Object.keys(big).every((k) => big[k] === 0), big);

  await page.viewport(568, 320);
  await wait(250);
  const landscape = await page.evaluate(PANE_OVERFLOW);
  ok("568×320 hiçbir sekmede taşma yok", Object.keys(landscape).every((k) => landscape[k] === 0), landscape);

  await page.viewport(344, 640);
  await wait(250);
  const narrow = await page.evaluate(PANE_OVERFLOW);
  ok("344×640 hiçbir sekmede taşma yok", Object.keys(narrow).every((k) => narrow[k] === 0), narrow);

  /* ---- kapatma: Esc ve odak dönüşü ---- */
  await page.viewport(412, 915);
  await wait(200);
  const closed = await page.evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    document.querySelector('[data-profile-tab="theme"]').click();
    await sleep(120);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(180);
    return {
      hidden: document.getElementById('overlay').hidden,
      focus: document.activeElement ? document.activeElement.id : '',
      bodyOverflow: document.body.style.overflow
    };
  })()`);
  ok("Esc menüyü kapatıyor", closed.hidden === true, closed);
  ok("odak avatar düğmesine dönüyor", closed.focus === "account-avatar", closed.focus);
  ok("sayfa kaydırması serbest kalıyor", closed.bodyOverflow === "", closed.bodyOverflow);

  /* ---- tema yeniden yüklemede korunuyor ---- */
  await page.reload();
  await boot(page);
  const persisted = await page.evaluate(`({
    attr: document.documentElement.getAttribute('data-theme'),
    saved: localStorage.getItem('blokara.theme'),
    meta: document.querySelector('meta[name="theme-color"]').content
  })`);
  ok("tema yeniden açılışta korunuyor", persisted.attr === "sunset" && persisted.saved === "sunset", persisted);

  /* ---- çeviri ---- */
  const german = await page.evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    window.BlokI18n.setLang('de');
    await sleep(250);
    document.getElementById('account-avatar').click();
    await sleep(300);
    return {
      tabs: [...document.querySelectorAll('[data-profile-tab]')].map((t) => t.textContent),
      themes: [...document.querySelectorAll('.theme-name')].map((t) => t.textContent),
      close: document.querySelector('.sheet-actions [data-close]').textContent
    };
  })()`);
  ok("sekmeler Almancaya çevriliyor", german.tabs.join(",") === "Design,Ausdruck,Effekte,Avatar", german.tabs);
  ok("tema adları Almancaya çevriliyor", german.themes.indexOf("Werkstatt") === 0, german.themes);
  ok("kapat düğmesi Almancaya çevriliyor", german.close === "Schließen", german.close);

  page.close();
  chrome.kill();
  server.kill();
  console.log("\nProfil menüsü testi geçti (" + step + " kontrol).");
  process.exit(0);
}

main().catch((error) => {
  console.error("Test başarısız:", error.message);
  if (chrome) chrome.kill();
  server.kill();
  process.exit(1);
});
