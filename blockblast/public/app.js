/* Blok İki — arayüz ve oturumlar */
(function () {
  "use strict";

  var CORE = window.BlokIki;
  if (!CORE) return;
  var PROGRESS = window.BlokProgress;
  var FX = window.BlokFx;

  var SIZE = CORE.SIZE;
  var LS_NAME = "blokiki.name";
  var LS_SOUND = "blokiki.sound";
  var LS_SERVER = "blokiki.server";
  var LS_SESSION_PREFIX = "blokiki.session.";
  var SS_ACTIVE = "blokiki.activeRoom";
  var MAX_RECONNECT = 6;

  var app = {
    screen: "home",
    online: false,
    state: null,
    game: null,
    me: 0,
    room: null,
    ws: null,
    pending: false,
    intentionalClose: false,
    reconnectAttempts: 0,
    reconnectTimer: null,
    heartbeat: null,
    shownResultKey: null,
    lastAnimated: -1,
    lastTurn: -1,
    selected: null,
    cursor: null,
    drag: null,
    sound: true,
    audio: null,
    toastTimer: null,
    overlayClosable: true,
    busy: false,
    profile: null,
    timeMode: "shared",
    botLevel: null,
    daily: false,
    botThinking: false,
    botTimer: null,
    clockTimer: null,
    lastClockAt: 0,
    onlineAt: 0,
    lastSignature: "",
    recordedKey: null,
    lastReward: null,
    lastClockWhole: -1,
    soundOn: true,
    vibrate: true
  };

  /* ------------------------------------------------------------------ */
  /* kısayollar                                                          */
  /* ------------------------------------------------------------------ */

  function $(selector, scope) { return (scope || document).querySelector(selector); }
  function $$(selector, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(selector)); }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function fmt(number) {
    return Number(number || 0).toLocaleString("tr-TR");
  }

  function colorClass(color) {
    return "c-" + (color || "blank");
  }

  function modeName(mode) {
    return mode === "coop" ? "Ortak tahta" : "Rakip";
  }

  function playerColor(index) {
    return index === 0 ? "coral" : "cobalt";
  }

  function save(key, value) {
    try { localStorage.setItem(key, value); } catch (error) { /* yoksay */ }
  }

  function read(key) {
    try { return localStorage.getItem(key); } catch (error) { return null; }
  }

  function remove(key) {
    try { localStorage.removeItem(key); } catch (error) { /* yoksay */ }
  }

  function sessionRead(key) {
    try { return sessionStorage.getItem(key); } catch (error) { return null; }
  }

  function sessionWrite(key, value) {
    try {
      if (value == null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, value);
    } catch (error) { /* yoksay */ }
  }

  /* ------------------------------------------------------------------ */
  /* ses                                                                 */
  /* ------------------------------------------------------------------ */

  function audio() {
    if (!app.audio) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      app.audio = new AC();
    }
    if (app.audio.state === "suspended") app.audio.resume();
    return app.audio;
  }

  function tone(freq, duration, options) {
    if (!app.sound) return;
    var ctx = audio();
    if (!ctx) return;
    options = options || {};
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    var now = ctx.currentTime;
    osc.type = options.type || "triangle";
    osc.frequency.setValueAtTime(freq, now);
    if (options.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + options.slide), now + duration);
    var volume = options.volume == null ? 0.06 : options.volume;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  function sfxPlace() { tone(240, 0.08, { type: "square", slide: -70, volume: 0.035 }); }
  function sfxClear(lines) {
    var notes = [523.25, 659.25, 783.99, 1046.5];
    var count = Math.min(4, 1 + lines);
    for (var i = 0; i < count; i++) {
      (function (index) {
        setTimeout(function () {
          tone(notes[index], 0.16, { type: "triangle", volume: 0.05 });
        }, index * 65);
      })(i);
    }
  }
  function sfxStart() {
    tone(392, 0.1, { volume: 0.05 });
    setTimeout(function () { tone(523.25, 0.14, { volume: 0.05 }); }, 100);
  }
  function sfxLose() {
    tone(330, 0.18, { slide: -120, volume: 0.05 });
    setTimeout(function () { tone(220, 0.28, { slide: -100, volume: 0.05 }); }, 150);
  }
  function sfxWin() {
    [523.25, 659.25, 783.99, 1046.5].forEach(function (freq, index) {
      setTimeout(function () { tone(freq, 0.18, { type: "triangle", volume: 0.055 }); }, index * 100);
    });
  }
  function sfxPenalty() {
    tone(180, 0.16, { type: "sawtooth", slide: -60, volume: 0.04 });
    setTimeout(function () { tone(140, 0.2, { type: "sawtooth", volume: 0.035 }); }, 110);
  }
  function sfxReward() {
    [783.99, 1046.5, 1318.5].forEach(function (freq, index) {
      setTimeout(function () { tone(freq, 0.12, { type: "triangle", volume: 0.05 }); }, index * 80);
    });
  }

  /* ------------------------------------------------------------------ */
  /* yükleme                                                             */
  /* ------------------------------------------------------------------ */

  /* Android 15+ uygulama kenardan kenara çizilir; sistem çubuğunun
     yüksekliğini CSS'e taşı ki alttaki düğmeler çubuğun altında kalmasın. */
  function applyNativeInsets() {
    var bridge = window.BlokIkiServer;
    if (!bridge) return;
    var bottom = 0;
    var top = 0;
    try {
      if (typeof bridge.bottomInset === "function") bottom = Number(bridge.bottomInset()) || 0;
      if (typeof bridge.topInset === "function") top = Number(bridge.topInset()) || 0;
    } catch (error) {
      bottom = 0;
      top = 0;
    }
    if (!bottom && !top) return;
    var root = document.documentElement;
    root.style.setProperty("--safe-b", bottom + "px");
    root.style.setProperty("--safe-t", top + "px");
    root.classList.add("native");
  }

  /* Pencereler yerleştikten sonra ölçüler değişebilir; birkaç kez tazele. */
  function applyNativeInsetsSoon() {
    applyNativeInsets();
    [150, 500, 1200].forEach(function (delay) {
      setTimeout(applyNativeInsets, delay);
    });
  }

  function init() {
    /* Telefonda uygulama yeniden açıldığında eski kaydırma konumuna dönmesin. */
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";

    applyNativeInsetsSoon();

    var savedName = read(LS_NAME);
    var nameInput = $("#player-name");
    if (savedName && nameInput) nameInput.value = savedName;

    var soundPref = read(LS_SOUND);
    app.sound = soundPref !== "0";
    updateSoundButton();

    if (PROGRESS) {
      app.profile = PROGRESS.load();
      PROGRESS.refreshDailyStreak(app.profile);
      PROGRESS.save(app.profile);
      app.timeMode = CORE.TIME_MODES.indexOf(app.profile.timeMode) >= 0 ? app.profile.timeMode : "shared";
      app.vibrate = app.profile.vibrate !== false;
    } else {
      app.profile = null;
    }
    if (FX) FX.init();

    initServerField();
    initHomeControls();
    buildHeroBoard();
    bindStaticEvents();
    renderHomeMeta();
    registerServiceWorker();
    prepareSharedLink();
    attemptSessionRejoin();
    exposeDebug();

    var onlineCard = $("#online-card");
    if (onlineCard && window.matchMedia("(min-width: 721px)").matches) onlineCard.open = true;
    window.scrollTo(0, 0);
  }

  /* Yalnızca ?test=1 ile açılır; otomatik testler durumu sürebilsin diye. */
  function exposeDebug() {
    if (!/[?&]test=1/.test(location.search)) return;
    window.BlokDebug = {
      start: startLocal,
      game: function () { return app.game; },
      send: function (message) {
        if (app.ws && app.ws.readyState === WebSocket.OPEN) app.ws.send(JSON.stringify(message));
        return !!app.ws;
      },
      snapshot: function () { return app.state; },
      finish: function (winner, reason) {
        if (!app.game) return null;
        app.game.finish(winner, reason || "Test bitişi.");
        app.state = app.game.snapshot();
        renderGame();
        checkResult();
        return app.state;
      },
      tick: function (seconds) {
        if (!app.game) return null;
        var result = app.game.tick(seconds);
        app.state = app.game.snapshot();
        renderGame();
        checkResult();
        return result;
      }
    };
  }

  /* ------------------------------------------------------------------ */
  /* profil / başarımlar / günlük                                        */
  /* ------------------------------------------------------------------ */

  function fmtTime(seconds) {
    var value = Math.max(0, Math.ceil(seconds || 0));
    var m = Math.floor(value / 60);
    var s = value % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function profileStats() {
    var p = app.profile;
    if (!p) return null;
    var level = PROGRESS.levelInfo(p.xp);
    var unlocked = Object.keys(p.unlocked || {}).length;
    return { level: level, unlocked: unlocked, total: PROGRESS.ACHIEVEMENTS.length };
  }

  function renderHomeMeta() {
    if (!PROGRESS || !app.profile) return;
    var p = app.profile;
    var info = PROGRESS.levelInfo(p.xp);
    var badge = $("#level-badge");
    if (badge) badge.textContent = info.level;
    var num = $("#level-num");
    if (num) num.textContent = info.level;
    var fill = $("#xp-fill");
    if (fill) fill.style.width = info.percent + "%";
    var label = $("#xp-label");
    if (label) label.textContent = info.into + " / " + info.need + " XP";
    var coins = $("#stat-coins");
    if (coins) coins.textContent = fmt(p.coins);
    var best = $("#stat-best");
    if (best) best.textContent = fmt(p.bestAny || 0);
    var streak = $("#stat-streak");
    if (streak) streak.textContent = p.dailyStreak || 0;

    renderDailyCard();
    renderAchievements();
    syncSetupButtons();
  }

  function renderDailyCard() {
    if (!PROGRESS || !app.profile) return;
    var p = app.profile;
    var ready = PROGRESS.dailyReady(p);
    var streak = $("#daily-streak");
    if (streak) streak.textContent = p.dailyStreak || 0;
    var state = $("#daily-state");
    if (state) {
      state.textContent = ready
        ? "Bugün henüz oynanmadı"
        : "Bugün oynandı · en iyi " + fmt(p.dailyBest || 0);
    }
    var button = $("#play-daily");
    if (button) {
      button.textContent = ready ? "Bugünü oyna" : "Tekrar oyna";
      button.classList.toggle("btn-coral", ready);
      button.classList.toggle("btn-outline", !ready);
    }
  }

  function renderAchievements() {
    if (!PROGRESS || !app.profile) return;
    var list = $("#ach-list");
    if (!list) return;
    var p = app.profile;
    var html = "";
    var unlockedCount = 0;
    PROGRESS.ACHIEVEMENTS.forEach(function (item) {
      var done = !!p.unlocked[item.id];
      if (done) unlockedCount++;
      var value = Math.min(item.goal, Math.max(0, item.metric(p)));
      var pct = Math.round((value / item.goal) * 100);
      html += '<div class="ach-item' + (done ? " done" : "") + '">' +
        '<div class="ach-head"><b>' + item.title + '</b>' +
        '<span>' + (done ? "alındı" : "+" + item.reward + " coin") + '</span></div>' +
        '<p>' + item.desc + '</p>' +
        '<div class="ach-progress"><i style="width:' + pct + '%"></i></div>' +
        '<span class="tiny">' + item.value(p) + ' / ' + item.goal + '</span>' +
        '</div>';
    });
    list.innerHTML = html;
    var count = $("#ach-count");
    if (count) count.textContent = unlockedCount + " / " + PROGRESS.ACHIEVEMENTS.length;
  }

  function syncSetupButtons() {
    $$("#time-mode button").forEach(function (button) {
      var on = button.dataset.time === app.timeMode;
      button.classList.toggle("on", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
    $$("#bot-level button").forEach(function (button) {
      var on = button.dataset.bot === (app.botLevel || "normal");
      button.classList.toggle("on", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function initHomeControls() {
    $$("#time-mode button").forEach(function (button) {
      button.addEventListener("click", function () {
        app.timeMode = CORE.TIME_MODES.indexOf(button.dataset.time) >= 0 ? button.dataset.time : "shared";
        if (app.profile) { app.profile.timeMode = app.timeMode; PROGRESS.save(app.profile); }
        syncSetupButtons();
        sfxPlace();
      });
    });
    $$("#bot-level button").forEach(function (button) {
      button.addEventListener("click", function () {
        app.botLevel = CORE.BOT_LEVELS.indexOf(button.dataset.bot) >= 0 ? button.dataset.bot : "normal";
        if (app.profile) { app.profile.botLevel = app.botLevel; PROGRESS.save(app.profile); }
        syncSetupButtons();
        sfxPlace();
      });
    });
    var playBot = $("#play-bot");
    if (playBot) {
      playBot.addEventListener("click", function () {
        audio();
        startLocal("versus", { bot: app.botLevel || "normal", timeMode: app.timeMode });
      });
    }
    var playDaily = $("#play-daily");
    if (playDaily) {
      playDaily.addEventListener("click", function () {
        audio();
        startLocal("versus", {
          bot: "normal",
          timeMode: "shared",
          daily: true,
          seed: PROGRESS.dailySeed()
        });
      });
    }
  }

  /* APK'da sayfa file:// üzerinden açılır; sunucu adresi derlemeye gömülür. */
  function initServerField() {
    /* Sunucu adresi artık arayüzde sorulmuyor; ayar dosyasından/derlemeden gelir. */
  }

  function buildHeroBoard() {
    var host = $("#hero-board");
    if (!host) return;
    var blocks = [
      [7, 0, "coral"], [7, 1, "coral"], [7, 2, "mustard"], [7, 3, "mustard"],
      [7, 4, "mint"], [7, 5, "mint"], [6, 5, "mint"],
      [5, 0, "grape"], [6, 0, "grape"], [5, 1, "grape"],
      [4, 3, "sky"], [5, 3, "sky"], [5, 4, "sky"],
      [3, 6, "coral"], [4, 6, "coral"], [4, 7, "coral"],
      [1, 2, "mustard"], [2, 2, "mustard"]
    ];
    var filled = {};
    blocks.forEach(function (block) { filled[block[0] + "-" + block[1]] = block[2]; });
    var html = "";
    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        var color = filled[r + "-" + c];
        html += '<span class="hc' + (color ? " on " + colorClass(color) : "") + '"></span>';
      }
    }
    host.innerHTML = html;
  }

  /* ------------------------------------------------------------------ */
  /* ekran yönetimi                                                      */
  /* ------------------------------------------------------------------ */

  function showScreen(name) {
    app.screen = name;
    ["home", "lobby", "game"].forEach(function (screen) {
      var el = $("#screen-" + screen);
      if (el) el.hidden = screen !== name;
    });
    var inRoom = (name === "lobby" || name === "game") && app.online;
    $("#exit-btn").hidden = name === "home";
    var badge = $("#room-badge");
    badge.hidden = !inRoom;
    if (inRoom && app.room) badge.textContent = "ODA " + app.room;
    if (name === "game") {
      app.lastAnimated = -1;
      startClock();
    } else {
      stopClock();
      stopBot();
      if (name === "home") renderHomeMeta();
    }
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  /* ------------------------------------------------------------------ */
  /* yerel oyun                                                          */
  /* ------------------------------------------------------------------ */

  function startLocal(mode, options) {
    options = options || {};
    app.online = false;
    app.me = 0;
    app.room = null;
    app.selected = null;
    app.pending = false;
    app.shownResultKey = null;
    app.lastAnimated = -1;
    app.lastReward = null;
    app.recordedKey = null;
    app.daily = !!options.daily;
    app.botLevel = options.bot ? (CORE.BOT_LEVELS.indexOf(options.bot) >= 0 ? options.bot : "normal") : null;
    app.timeMode = CORE.TIME_MODES.indexOf(options.timeMode) >= 0 ? options.timeMode : (app.timeMode || "shared");
    app.botThinking = false;
    stopBot();
    var names = app.daily
      ? ["Sen", "Günün Botu"]
      : (app.botLevel ? ["Sen", "Bot"] : ["Oyuncu 1", "Oyuncu 2"]);
    app.game = new CORE.Game({
      mode: mode,
      names: names,
      seed: options.seed,
      turnBased: true,
      timeMode: app.timeMode
    });
    app.state = app.game.snapshot();
    app.lastSignature = stateSignature(app.state);
    app.onlineAt = 0;
    showScreen("game");
    renderGame();
    startClock();
    sfxStart();
    checkResult();
    scheduleBot();
  }

  /* ------------------------------------------------------------------ */
  /* saat                                                               */
  /* ------------------------------------------------------------------ */

  function startClock() {
    stopClock();
    app.lastClockAt = performance.now();
    app.lastClockWhole = -1;
    app.clockTimer = setInterval(clockStep, 200);
    updateClock();
  }

  function stopClock() {
    if (app.clockTimer) {
      clearInterval(app.clockTimer);
      app.clockTimer = null;
    }
  }

  function clockStep() {
    var now = performance.now();
    var dt = (now - app.lastClockAt) / 1000;
    app.lastClockAt = now;
    if (!app.state || app.screen !== "game" || app.state.phase !== "playing") return;

    if (!app.online && app.game) {
      var result = app.game.tick(dt);
      if (result.penalty != null) {
        var p = app.state.players[result.penalty];
        toast("Süre doldu: " + (p ? p.name : "oyuncu") + " −" + CORE.TURN_PENALTY + " puan");
        sfxPenalty();
        if (app.vibrate && FX) FX.vibrate(40);
        var board = $(".board");
        if (FX) FX.shake(board);
      }
      app.state = app.game.snapshot();
      if (app.state.phase === "over") {
        renderGame();
        checkResult();
        return;
      }
      if (result.penalty != null) renderGame();
    }
    updateClock();
  }

  function clockValue(state, index) {
    if (!state) return null;
    var elapsed = app.online && app.onlineAt ? Math.max(0, (performance.now() - app.onlineAt) / 1000) : 0;
    if (state.timeMode === "shared") return Math.max(0, (state.timeLeft || 0) - elapsed);
    if (state.timeMode === "turn") {
      if (state.turnBased) return Math.max(0, (state.turnLeft || 0) - elapsed);
      var p = state.players[index == null ? 0 : index];
      return p ? Math.max(0, (p.timeLeft || 0) - elapsed) : null;
    }
    return null;
  }

  function updateClock() {
    var s = app.state;
    var track = $("#timer-track");
    var fill = $("#timer-fill");
    var pill = $("#time-left");
    if (!s) return;
    var active = s.timeMode && s.timeMode !== "none";
    if (track) track.hidden = !active;
    if (!active) {
      if (pill) pill.textContent = "∞";
      return;
    }
    if (s.timeMode === "shared") {
      var value = clockValue(s);
      if (pill) pill.textContent = fmtTime(value);
      var limit = Math.max(1, s.timeLimit || 120);
      var pct = Math.max(0, Math.min(100, (value / limit) * 100));
      if (fill) {
        fill.style.width = pct + "%";
        fill.classList.toggle("low", value <= 10);
        fill.classList.toggle("reward", value > limit);
      }
      markLow(value);
      playTick(value);
    } else if (s.timeMode === "turn") {
      if (s.turnBased) {
        var turnValue = clockValue(s);
        if (pill) pill.textContent = fmtTime(turnValue);
        var tlimit = Math.max(1, s.turnLimit || 30);
        if (fill) {
          fill.style.width = Math.max(0, Math.min(100, (turnValue / tlimit) * 100)) + "%";
          fill.classList.toggle("low", turnValue <= 8);
          fill.classList.remove("reward");
        }
        markLow(turnValue);
        playTick(turnValue);
      } else {
        if (pill) pill.textContent = "canlı";
        if (fill) { fill.style.width = "100%"; fill.classList.remove("low", "reward"); }
      }
      $$("[data-clock]").forEach(function (el) {
        var index = Number(el.dataset.clock);
        var v = clockValue(s, index);
        el.textContent = v == null ? "" : fmtTime(v);
        el.classList.toggle("low", v != null && v <= 8);
      });
    }
    updateClockClasses();
  }

  function updateClockClasses() {
    var value = clockValue(app.state);
    var low = app.state && app.state.timeMode !== "none" && value != null && value <= 10;
    var board = $("#table-area");
    if (board) board.classList.toggle("time-low", !!low);
  }

  function markLow(value) {
    var scoreboard = $("#scoreboard");
    if (!scoreboard) return;
    scoreboard.classList.toggle("time-low", value != null && value <= 10);
  }

  function playTick(value) {
    var whole = Math.ceil(value || 0);
    if (whole === app.lastClockWhole) return;
    app.lastClockWhole = whole;
    if (whole > 0 && whole <= 5) tone(620 + (5 - whole) * 60, 0.05, { type: "square", volume: 0.02 });
  }

  /* ------------------------------------------------------------------ */
  /* bot                                                                */
  /* ------------------------------------------------------------------ */

  function scheduleBot() {
    stopBot();
    var s = app.state;
    if (app.online || !s || !app.botLevel) return;
    if (s.phase !== "playing" || s.mode !== "versus" || !s.turnBased) return;
    if (s.turn !== 1) return;
    app.botThinking = true;
    updateHint();
    app.botTimer = setTimeout(botPlay, 650 + Math.random() * 550);
  }

  function stopBot() {
    if (app.botTimer) {
      clearTimeout(app.botTimer);
      app.botTimer = null;
    }
    app.botThinking = false;
  }

  function botPlay() {
    app.botTimer = null;
    var s = app.state;
    app.botThinking = false;
    if (!s || app.online || s.phase !== "playing" || !app.botLevel || s.turn !== 1) return;
    var player = s.players[1];
    if (!player) return;
    var move = CORE.botMove(player.board, player.tray, app.botLevel, Math.random);
    if (!move) {
      if (app.game) app.game.finish(0, "Bot sıkıştı. Kazandın!");
      app.state = app.game.snapshot();
      renderGame();
      checkResult();
      return;
    }
    performMove(move.piece, move.row, move.col);
  }

  function actorIndex() {
    var s = app.state;
    if (!s) return 0;
    if (!s.turnBased) return app.online ? app.me : 0;
    return s.turn;
  }

  /* Yerel bot oyununda ekran hep oyuncunun tahtasında kalır; bot kendi
     tahtasında oynar. İki insan aynı cihazda oynarken tahta sırayla döner. */
  function displayIndex() {
    var s = app.state;
    if (!s) return 0;
    if (app.online) return app.me;
    if (s.mode === "versus" && app.botLevel) return 0;
    return s.turn;
  }

  function activePlayerIndex() {
    var s = app.state;
    if (!s) return 0;
    if (s.mode === "coop") return s.turn;
    return s.turnBased ? s.turn : (app.online ? app.me : 0);
  }

  /* Hamle yapılabilir mi? (bot hamlesi de bu kapıdan geçer) */
  function canAct() {
    var s = app.state;
    if (!s || s.phase !== "playing" || app.pending) return false;
    if (!app.online) return true;
    if (s.mode === "coop") return s.turn === app.me;
    return !!s.players[app.me] && s.players[app.me].alive;
  }

  /* Kullanıcı ekrana dokunabilir mi? Bot düşünürken eli tahtadan çekeriz. */
  function canPlay() {
    if (!canAct()) return false;
    var s = app.state;
    if (!app.online && app.botLevel && s.mode === "versus" && s.turn !== 0) return false;
    return true;
  }

  function performMove(pieceIndex, row, col) {
    var s = app.state;
    if (!s || !canAct()) return;
    var playerIndex = actorIndex();
    hideToast();

    if (app.online) {
      var board = s.mode === "coop" ? s.shared.board : s.players[app.me].board;
      var tray = s.mode === "coop" ? s.shared.tray : s.players[app.me].tray;
      if (!CORE.canPlace(board, tray[pieceIndex], row, col)) {
        toast("Buraya sığmıyor.");
        return;
      }
      app.pending = true;
      app.selected = null;
      app.cursor = null;
      wsSend({ t: "move", piece: pieceIndex, row: row, col: col });
      setTimeout(function () {
        if (app.pending) {
          app.pending = false;
          renderGame();
        }
      }, 4000);
      return;
    }

    var result = app.game.move(playerIndex, pieceIndex, row, col);
    if (!result.ok) {
      toast(result.reason);
      return;
    }
    app.selected = null;
    app.cursor = null;
    app.pending = false;
    app.state = app.game.snapshot();
    app.lastSignature = stateSignature(app.state);
    renderGame();
    checkResult();
    scheduleBot();
  }

  /* ------------------------------------------------------------------ */
  /* sunucu / websocket                                                  */
  /* ------------------------------------------------------------------ */

  function wsUrl() {
    var base = serverBase();
    if (base) {
      var parsed = parseServer(base);
      if (parsed) return (parsed.secure ? "wss:" : "ws:") + "//" + parsed.host + "/ws";
    }
    var protocol = location.protocol === "https:" ? "wss:" : "ws:";
    return protocol + "//" + location.host + "/ws";
  }

  /* "10.0.2.2:8080", "http://x", "https://x/" gibi girdileri normalize eder. */
  function parseServer(value) {
    var text = String(value == null ? "" : value).trim();
    if (!text) return null;
    if (!/^[a-z]+:\/\//i.test(text)) text = "http://" + text;
    var url;
    try { url = new URL(text); } catch (error) { return null; }
    if (!url.host) return null;
    return { secure: url.protocol === "https:", host: url.host, base: url.protocol + "//" + url.host };
  }

  /* Öncelik: ?sunucu= parametresi > kayıtlı ayar > Android köprüsü > aynı köken. */
  function serverBase() {
    var params = new URLSearchParams(location.search);
    var fromQuery = parseServer(params.get("sunucu"));
    if (fromQuery) return fromQuery.base;
    var saved = parseServer(read(LS_SERVER));
    if (saved) return saved.base;
    if (window.BlokIkiServer) {
      var raw = null;
      try {
        raw = typeof window.BlokIkiServer.serverUrl === "function"
          ? window.BlokIkiServer.serverUrl()
          : window.BlokIkiServer.base;
      } catch (error) { raw = null; }
      var bridged = parseServer(raw);
      if (bridged) return bridged.base;
    }
    return "";
  }

  function ensureSocket() {
    return new Promise(function (resolve, reject) {
      if (app.ws && app.ws.readyState === WebSocket.OPEN) return resolve(app.ws);
      if (location.protocol === "file:" && !serverBase()) {
        return reject(new Error("Sunucu adresi gir: online oyun için bir sunucuya bağlanmalısın."));
      }
      var socket;
      try {
        socket = new WebSocket(wsUrl());
      } catch (error) {
        return reject(new Error("Sunucuya bağlanılamadı."));
      }
      app.ws = socket;
      var settled = false;
      var timer = setTimeout(function () {
        if (!settled) {
          settled = true;
          try { socket.close(); } catch (error) { /* yoksay */ }
          reject(new Error("Sunucu yanıt vermedi."));
        }
      }, 8000);

      socket.addEventListener("open", function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        app.reconnectAttempts = 0;
        resolve(socket);
      });

      socket.addEventListener("message", handleSocketMessage);

      socket.addEventListener("close", function () {
        clearTimeout(timer);
        if (app.ws !== socket) return;
        app.ws = null;
        if (!settled) {
          settled = true;
          reject(new Error("Sunucuya bağlanılamadı."));
          return;
        }
        handleSocketClose();
      });

      socket.addEventListener("error", function () {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error("Sunucuya bağlanılamadı."));
        }
      });
    });
  }

  function wsSend(message) {
    if (!app.ws || app.ws.readyState !== WebSocket.OPEN) {
      toast("Bağlantı yok.");
      return false;
    }
    app.ws.send(JSON.stringify(message));
    return true;
  }

  function handleSocketMessage(event) {
    var message;
    try { message = JSON.parse(event.data); } catch (error) { return; }
    if (!message || !message.t) return;

    if (message.t === "welcome") {
      app.online = true;
      app.me = message.you;
      app.room = message.code;
      app.intentionalClose = false;
      app.reconnectAttempts = 0;
      app.pending = false;
      saveSession(message.code, message.token);
      startHeartbeat();
      applyState(message.state);
      return;
    }

    if (message.t === "state") {
      app.pending = false;
      applyState(message.state);
      return;
    }

    if (message.t === "error") {
      app.pending = false;
      toast(message.message || "Bir şeyler ters gitti.");
      if (/Oda kapandı|Oturum bulunamadı|Oturum geçersiz/.test(message.message || "")) {
        leaveLocalRoomState();
        showScreen("home");
      }
      return;
    }

    if (message.t === "left") {
      cleanupOnline(false);
      showScreen("home");
    }
  }

  function startHeartbeat() {
    if (app.heartbeat) clearInterval(app.heartbeat);
    app.heartbeat = setInterval(function () {
      if (app.ws && app.ws.readyState === WebSocket.OPEN) wsSend({ t: "ping" });
    }, 25000);
  }

  function handleSocketClose() {
    if (app.heartbeat) {
      clearInterval(app.heartbeat);
      app.heartbeat = null;
    }
    app.pending = false;
    if (app.online && !app.intentionalClose) {
      if (app.screen === "lobby" || app.screen === "game") {
        toast("Bağlantı koptu. Yeniden bağlanılıyor…");
        scheduleReconnect();
      }
    }
  }

  function scheduleReconnect() {
    if (app.reconnectTimer) return;
    if (app.reconnectAttempts >= MAX_RECONNECT) {
      toast("Bağlantı kurulamadı. Ana menüye dönülüyor.");
      leaveLocalRoomState();
      showScreen("home");
      return;
    }
    var session = readSession();
    if (!session) {
      leaveLocalRoomState();
      showScreen("home");
      return;
    }
    var delay = Math.min(8000, 800 * Math.pow(1.7, app.reconnectAttempts));
    app.reconnectAttempts++;
    app.reconnectTimer = setTimeout(function () {
      app.reconnectTimer = null;
      ensureSocket().then(function () {
        wsSend({ t: "rejoin", code: session.code, token: session.token });
      }).catch(function () {
        scheduleReconnect();
      });
    }, delay);
  }

  function readSession() {
    var code = sessionRead(SS_ACTIVE);
    var candidates = [];
    if (code) candidates.push(code);
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.indexOf(LS_SESSION_PREFIX) === 0) {
          var known = key.slice(LS_SESSION_PREFIX.length);
          if (candidates.indexOf(known) < 0) candidates.push(known);
        }
      }
    } catch (error) { /* yoksay */ }

    var best = null;
    candidates.forEach(function (roomCode) {
      var raw = read(LS_SESSION_PREFIX + roomCode);
      if (!raw) return;
      var entry;
      try { entry = JSON.parse(raw); } catch (error) { return; }
      if (!entry || !entry.token) return;
      var at = entry.at || 0;
      if (Date.now() - at > 10 * 60 * 1000) {
        remove(LS_SESSION_PREFIX + roomCode);
        return;
      }
      if (!best || at > best.at) best = { code: roomCode, token: entry.token, at: at };
    });
    return best;
  }

  function saveSession(code, token) {
    save(LS_SESSION_PREFIX + code, JSON.stringify({ token: token, at: Date.now() }));
    sessionWrite(SS_ACTIVE, code);
  }

  function clearSession(code) {
    if (code) remove(LS_SESSION_PREFIX + code);
    if (sessionRead(SS_ACTIVE) === code) sessionWrite(SS_ACTIVE, null);
    else if (!code) sessionWrite(SS_ACTIVE, null);
  }

  function attemptSessionRejoin() {
    if (new URLSearchParams(location.search).get("oda")) return;
    var session = readSession();
    if (!session) return;
    ensureSocket().then(function () {
      wsSend({ t: "rejoin", code: session.code, token: session.token });
    }).catch(function () { clearSession(session.code); });
  }

  function cleanupOnline(keepSession) {
    var roomCode = app.room;
    app.intentionalClose = true;
    if (app.ws) {
      try { app.ws.close(); } catch (error) { /* yoksay */ }
    }
    app.ws = null;
    app.online = false;
    app.room = null;
    app.me = 0;
    app.pending = false;
    if (app.reconnectTimer) {
      clearTimeout(app.reconnectTimer);
      app.reconnectTimer = null;
    }
    if (app.heartbeat) {
      clearInterval(app.heartbeat);
      app.heartbeat = null;
    }
    app.reconnectAttempts = 0;
    if (!keepSession) clearSession(roomCode);
    updateRoomChrome();
    setTimeout(function () { app.intentionalClose = false; }, 100);
  }

  function leaveLocalRoomState() {
    cleanupOnline(false);
    app.state = null;
    app.game = null;
    app.lastAnimated = -1;
    app.shownResultKey = null;
    updateRoomChrome();
  }

  function updateRoomChrome() {
    var badge = $("#room-badge");
    var inRoom = app.online && app.room && (app.screen === "lobby" || app.screen === "game");
    badge.hidden = !inRoom;
    if (inRoom) badge.textContent = "ODA " + app.room;
  }

  function prepareSharedLink() {
    var params = new URLSearchParams(location.search);
    var code = (params.get("oda") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
    if (!code) return;
    var input = $("#join-code");
    if (input) input.value = code;
    var panel = $(".online-card");
    if (panel && panel.scrollIntoView) {
      setTimeout(function () { panel.scrollIntoView({ behavior: "smooth", block: "center" }); }, 500);
    }
  }

  /* ------------------------------------------------------------------ */
  /* durum uygulama                                                      */
  /* ------------------------------------------------------------------ */

  function stateSignature(state) {
    if (!state) return "";
    return [
      state.phase,
      state.seq,
      state.turn,
      state.mode,
      state.players.map(function (p) {
        return [p.score, p.alive ? 1 : 0, p.connected ? 1 : 0, p.penalties || 0].join(":");
      }).join("|"),
      state.shared ? state.shared.score + ":" + state.shared.combo : ""
    ].join("~");
  }

  function applyState(state) {
    if (!state) return;
    app.state = state;
    app.pending = false;
    if (app.online) app.onlineAt = performance.now();

    if (state.phase === "lobby") {
      if (app.screen !== "lobby") showScreen("lobby");
      renderLobby();
      return;
    }

    if (app.screen !== "game") {
      showScreen("game");
      app.lastAnimated = -1;
    }
    if (app.lastAnimated > state.seq) app.lastAnimated = -1;
    app.daily = false;

    var signature = stateSignature(state);
    if (signature === app.lastSignature && app.screen === "game") {
      updateClock();
      updateHint();
      return;
    }
    app.lastSignature = signature;
    app.recordedKey = null;
    renderGame();
    if (state.phase === "over") {
      checkResult();
    } else {
      app.shownResultKey = null;
    }
  }

  function checkResult() {
    var s = app.state;
    if (!s || s.phase !== "over") return;
    var key = s.seq + "|" + s.players.map(function (p) { return p.score; }).join(",") + "|" + s.winner;
    if (app.shownResultKey === key) return;
    app.shownResultKey = key;
    var reward = null;
    if (app.recordedKey !== key) {
      app.recordedKey = key;
      reward = awardResult(s);
    }
    app.lastReward = reward;
    showResult(reward);
  }

  function resultPayload(s) {
    if (s.mode === "coop") {
      return {
        mode: "coop",
        score: s.shared ? s.shared.score : 0,
        lines: s.shared ? s.shared.lines : 0,
        blocks: (s.players[0].blocks || 0) + (s.players[1].blocks || 0),
        combo: s.shared ? s.shared.combo : 0,
        win: false, bot: false
      };
    }
    var human = app.online ? app.me : 0;
    var player = s.players[human] || s.players[0];
    return {
      mode: app.daily ? "daily" : (app.botLevel ? "bot" : "versus"),
      score: player.score,
      lines: player.lines,
      blocks: player.blocks,
      combo: player.combo,
      win: s.winner === human,
      bot: !!app.botLevel
    };
  }

  function awardResult(s) {
    if (!PROGRESS || !app.profile) return null;
    var reward = PROGRESS.recordGame(app.profile, resultPayload(s));
    renderHomeMeta();
    if (FX && (reward.newRecord || reward.levelUp || reward.unlocked.length)) {
      FX.confetti();
      if (app.sound) sfxReward();
      if (app.vibrate) FX.vibrate(30);
    }
    return reward;
  }

  /* ------------------------------------------------------------------ */
  /* render: skor tablosu                                                */
  /* ------------------------------------------------------------------ */

  function miniBoardHTML(board) {
    if (!board) return "";
    var html = '<div class="score-mini" aria-hidden="true">';
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var color = board[r][c];
        html += '<i class="' + (color ? "on " + colorClass(color) : "") + '"></i>';
      }
    }
    return html + "</div>";
  }

  function scoreCardHTML(index, s) {
    var player = s.players[index];
    if (!player) return "";
    var active = s.phase === "playing" && s.turnBased && s.turn === index;
    var sub = player.lines + " satır · " + player.blocks + " blok";
    if (player.penalties) sub += ' · <span class="penalty">' + player.penalties + " ceza</span>";
    var offline = app.online && !player.connected;
    var mini = s.mode === "versus" ? miniBoardHTML(player.board) : "";
    var clock = s.timeMode === "turn" && !s.turnBased && s.phase === "playing"
      ? '<span class="score-time" data-clock="' + index + '">' + fmtTime(clockValue(s, index)) + "</span>"
      : "";
    return '' +
      '<div class="score-card p' + (index + 1) + (active ? " active" : "") + (mini ? " has-mini" : "") + '">' +
        '<div class="score-main">' +
          '<span class="score-name"><span class="score-dot"></span>' + esc(player.name) + clock + '</span>' +
          '<span class="score-value">' + fmt(player.score) + '</span>' +
          '<span class="score-sub">' + (offline ? '<span class="conn-flag">bağlantı yok</span>' : sub) + '</span>' +
        '</div>' +
        mini +
      '</div>';
  }

  function timeHTML(s) {
    if (!s.timeMode || s.timeMode === "none" || s.phase === "over") return "";
    var label = fmtTime(clockValue(s));
    return '<span class="tp-time" id="time-left">' + label + '</span>';
  }

  function turnPillHTML(s) {
    var top = "";
    var main = "";
    var cls = "";
    if (s.mode === "coop") {
      top = s.phase === "over" ? "tur bitti" : "ortak skor";
      main = fmt(s.shared ? s.shared.score : 0);
      cls = s.phase === "over" ? "over" : "";
    } else if (s.phase === "over") {
      top = "kazanan";
      main = s.winner != null && s.players[s.winner] ? s.players[s.winner].name : "bitti";
      cls = "over";
    } else if (app.online) {
      top = "canlı";
      main = "ikisi de";
      cls = "live";
    } else if (app.botLevel) {
      top = s.turn === 1 ? "bot düşünüyor" : "sıra";
      main = s.turn === 1 ? "Bot" : "Sen";
      cls = s.turn === 1 ? "thinking" : "";
    } else {
      top = "sıra";
      main = s.players[s.turn] ? s.players[s.turn].name : "—";
    }
    return '<div class="turn-pill ' + cls + '"><span class="tp-top">' + top + '</span><span class="tp-main">' + esc(main) + '</span>' + timeHTML(s) + '</div>';
  }

  function renderScoreboard() {
    var s = app.state;
    $("#scoreboard").innerHTML =
      scoreCardHTML(0, s) +
      turnPillHTML(s) +
      scoreCardHTML(1, s);
  }

  /* ------------------------------------------------------------------ */
  /* render: tahta / tray                                                */
  /* ------------------------------------------------------------------ */

  function boardHTML(board, id, owner, label) {
    var html = '<div class="board-shell">';
    if (label) {
      html += '<div class="board-label">' + label + '</div>';
    }
    html += '<div class="board" id="' + id + '" data-board="' + owner + '" role="grid" aria-label="8 çarpı 8 oyun tahtası">';
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var color = board[r][c];
        html += '<div class="cell' + (color ? " on " + colorClass(color) : "") +
          '" role="gridcell" data-r="' + r + '" data-c="' + c + '"></div>';
      }
    }
    return html + "</div></div>";
  }

  function pieceHTML(piece, index, interactive, dim) {
    if (!piece) {
      return '<div class="piece empty" aria-hidden="true"></div>';
    }
    var filled = {};
    piece.cells.forEach(function (cell) { filled[cell[0] + "-" + cell[1]] = true; });
    var html = '<div class="piece' + (app.selected === index ? " selected" : "") +
      (dim ? " dead" : "") + (interactive ? "" : " locked") +
      '" data-piece="' + index + '" role="button" tabindex="' + (interactive ? "0" : "-1") +
      '" aria-label="Blok ' + (index + 1) + '" style="grid-template-columns:repeat(' + piece.w + ', var(--tile))">';
    for (var r = 0; r < piece.h; r++) {
      for (var c = 0; c < piece.w; c++) {
        var isOn = !!filled[r + "-" + c];
        html += '<span class="pcell' + (isOn ? " on " + colorClass(piece.color) : "") +
          '" data-pr="' + r + '" data-pc="' + c + '"></span>';
      }
    }
    return html + "</div>";
  }

  function trayHTML(tray, interactive, dim) {
    var html = '<div class="tray" id="tray" aria-label="Blok seçimi">';
    for (var i = 0; i < tray.length; i++) {
      html += pieceHTML(tray[i], i, interactive, dim);
    }
    return html + "</div>";
  }

  function renderGame() {
    var s = app.state;
    if (!s) return;
    if (s.turn !== app.lastTurn) {
      app.lastTurn = s.turn;
      app.selected = null;
      app.cursor = null;
    }
    cancelDrag();
    hidePreview();
    renderScoreboard();

    var table = $("#table-area");
    var interactive = canPlay();
    var html = "";

    if (s.mode === "coop") {
      var shared = s.shared;
      var turnPlayer = s.players[s.turn];
      html += boardHTML(shared.board, "board-shared", "shared", 'Ortak tahta <span class="you">paylaşımlı</span>');
      html += '<div class="tray-wrap">';
      html += '<div class="turn-note">' +
        (s.phase === "over" ? '<span class="dot"></span>Tur bitti' :
          '<span class="dot"></span>Sıra: <b>' + esc(turnPlayer ? turnPlayer.name : "—") + '</b>' +
          (shared.combo > 1 ? ' · combo ×' + shared.combo : "")) +
        '</div>';
      html += trayHTML(shared.tray, interactive);
      html += '</div>';
    } else if (!app.online) {
      var activeIndex = displayIndex();
      var activePlayer = s.players[activeIndex];
      var activeColor = activeIndex === 0 ? "var(--coral)" : "var(--cobalt)";
      var waitingBot = app.botLevel && s.turn !== activeIndex;
      html += '<div class="vs-local">';
      html += boardHTML(
        activePlayer.board,
        "board-" + activeIndex,
        "active",
        '<span class="score-dot" style="background:' + activeColor + '"></span>' +
        esc(activePlayer.name) + ' <span class="you">' +
          (waitingBot ? "bot oynuyor" : "sıra sende") + '</span>'
      );
      html += '<div class="tray-wrap">';
      html += trayHTML(activePlayer ? activePlayer.tray : [], interactive);
      html += '</div>';
      html += '</div>';
    } else {
      var me = s.players[app.me];
      html += boardHTML(me.board, "board-me", String(app.me), 'Senin tahtan <span class="you">sen</span>');
      html += '<div class="tray-wrap">';
      html += '<div class="turn-note">' +
        (s.phase === "over" ? '<span class="dot"></span>Tur bitti' :
          '<span class="dot"></span>İkiniz de aynı anda oynuyorsunuz' +
          (me.combo > 1 ? ' · combo ×' + me.combo : "")) +
        '</div>';
      html += trayHTML(me.tray, interactive);
      html += '</div>';
    }

    table.innerHTML = html;
    bindGameEvents();
    updateHint();
    animateLastMove();
    updateClock();
    updateRoomChrome();
    scheduleBot();
  }

  function updateHint() {
    var s = app.state;
    var hint = $("#game-hint");
    var restart = $("#game-restart");
    if (!s || !hint) return;

    var canRematch = s.phase === "over" && (!app.online || app.me === s.host);
    restart.hidden = !canRematch;
    restart.textContent = app.online ? "Yeniden başlat" : "Yeniden oyna";

    if (s.phase === "over") {
      hint.textContent = s.reason || "Tur bitti.";
      return;
    }
    if (app.daily) {
      hint.textContent = app.botThinking ? "Günün botu oynuyor…" : "Günün tahtası · satırları patlat, süre kazan.";
      return;
    }
    if (app.botThinking) {
      hint.textContent = "Bot düşünüyor…";
      return;
    }
    if (s.mode === "coop") {
      if (app.online && s.turn !== app.me) {
        hint.textContent = (s.players[s.turn] ? s.players[s.turn].name : "Arkadaşın") + " oynuyor…";
      } else {
        hint.textContent = "Bloğu tahtaya sürükle ya da dokunup yerleştir.";
      }
    } else if (app.online) {
      hint.textContent = "Tahtan dolarsa kaybedersin. Satırları patlat.";
    } else {
      var current = s.players[s.turn];
      hint.textContent = "Sıra: " + (current ? current.name : "—") + " · Bloğu tahtaya sürükle.";
    }
  }

  /* ------------------------------------------------------------------ */
  /* etkileşim                                                           */
  /* ------------------------------------------------------------------ */

  function bindGameEvents() {
    var tray = $("#tray");
    if (tray) {
      tray.addEventListener("pointerdown", onTrayPointerDown);
      tray.addEventListener("keydown", onTrayKeyDown);
    }
    $$(".board").forEach(function (boardEl) {
      boardEl.addEventListener("pointermove", onBoardPointerMove);
      boardEl.addEventListener("pointerleave", function () {
        if (!app.drag) hidePreview();
      });
      boardEl.addEventListener("click", onBoardClick);
    });
  }

  function onTrayKeyDown(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    var pieceEl = event.target.closest(".piece");
    if (!pieceEl || pieceEl.classList.contains("empty") || pieceEl.classList.contains("dead")) return;
    if (!canPlay()) return;
    event.preventDefault();
    var index = Number(pieceEl.dataset.piece);
    app.selected = app.selected === index ? null : index;
    app.cursor = app.selected == null ? null : findCursorFor(index);
    $$(".piece").forEach(function (el) {
      el.classList.toggle("selected", Number(el.dataset.piece) === app.selected);
    });
    paintCursor();
    if (app.selected != null) toast("Blok seçildi. Ok tuşlarıyla gez, Enter ile bırak.");
  }

  /* Klavye için ilk sığan konumu bulur. */
  function findCursorFor(pieceIndex) {
    var s = app.state;
    if (!s) return null;
    var tray = s.mode === "coop" ? s.shared.tray : s.players[app.online ? app.me : displayIndex()].tray;
    var board = s.mode === "coop" ? s.shared.board : s.players[app.online ? app.me : displayIndex()].board;
    var piece = tray[pieceIndex];
    if (!piece) return null;
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (CORE.canPlace(board, piece, r, c)) return { row: r, col: c };
      }
    }
    return { row: 0, col: 0 };
  }

  function paintCursor() {
    $$(".cell.cursor").forEach(function (cell) { cell.classList.remove("cursor"); });
    var cursor = app.cursor;
    if (!cursor || app.selected == null) return;
    var s = app.state;
    var boardEl = activeBoardEl();
    if (!s || !boardEl) return;
    var tray = s.mode === "coop" ? s.shared.tray : s.players[app.online ? app.me : displayIndex()].tray;
    var board = s.mode === "coop" ? s.shared.board : s.players[app.online ? app.me : displayIndex()].board;
    var piece = tray[app.selected];
    if (!piece) return;
    var geo = boardGeometry(boardEl);
    if (!geo) return;
    var valid = CORE.canPlace(board, piece, cursor.row, cursor.col);
    showPreview(piece, cursor.row, cursor.col, geo, valid);
    if (valid) markLineHint(boardEl, board, piece, cursor.row, cursor.col);
    else clearLineHint();
    var el = boardEl.children[cursor.row * SIZE + cursor.col];
    if (el) el.classList.add("cursor");
  }

  function onBoardKeyDown(event) {
    var s = app.state;
    if (!s || app.screen !== "game" || app.selected == null || !canPlay()) return;
    var moves = {
      ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1]
    };
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (app.cursor) performMove(app.selected, app.cursor.row, app.cursor.col);
      return;
    }
    if (!moves[event.key]) return;
    event.preventDefault();
    if (!app.cursor) app.cursor = findCursorFor(app.selected) || { row: 0, col: 0 };
    app.cursor = {
      row: Math.max(0, Math.min(SIZE - 1, app.cursor.row + moves[event.key][0])),
      col: Math.max(0, Math.min(SIZE - 1, app.cursor.col + moves[event.key][1]))
    };
    paintCursor();
  }

  function onTrayPointerDown(event) {
    if (!canPlay()) return;
    var pieceEl = event.target.closest(".piece");
    if (!pieceEl || pieceEl.classList.contains("empty") || pieceEl.classList.contains("dead")) return;
    event.preventDefault();

    var index = Number(pieceEl.dataset.piece);
    var s = app.state;
    var tray = s.mode === "coop" ? s.shared.tray : s.players[app.online ? app.me : displayIndex()].tray;
    var piece = tray[index];
    if (!piece) return;

    var grabR = Math.floor(piece.h / 2);
    var grabC = Math.floor(piece.w / 2);
    var cell = event.target.closest(".pcell");
    if (cell) {
      grabR = Number(cell.dataset.pr);
      grabC = Number(cell.dataset.pc);
    }

    var boardEl = activeBoardEl();
    if (!boardEl) return;
    var geo = boardGeometry(boardEl);
    if (!geo) return;

    app.selected = index;
    app.cursor = null;
    $$(".piece").forEach(function (el) {
      el.classList.toggle("selected", Number(el.dataset.piece) === index);
    });

    app.drag = {
      index: index,
      piece: piece,
      grabR: grabR,
      grabC: grabC,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      lift: event.pointerType === "mouse" ? 0 : 44,
      boardEl: boardEl,
      geo: geo,
      bounds: boardEl.getBoundingClientRect(),
      ghost: buildGhost(piece, geo),
      target: null,
      pointerId: event.pointerId,
      queued: null,
      frame: 0
    };
    moveGhost(event.clientX, event.clientY);
    window.addEventListener("pointermove", onDragMove, { passive: false });
    window.addEventListener("pointerup", onDragEnd);
    window.addEventListener("pointercancel", onDragEnd);
  }

  /* Çizim için gereken ölçüler: sürükleme başında bir kez okunur. */
  function boardGeometry(boardEl) {
    var cells = boardEl.children;
    if (!cells || cells.length < SIZE + 1) return null;
    var a = cells[0].getBoundingClientRect();
    var b = cells[1].getBoundingClientRect();
    var c = cells[SIZE].getBoundingClientRect();
    return {
      x: a.left,
      y: a.top,
      w: a.width,
      h: a.height,
      stepX: b.left - a.left,
      stepY: c.top - a.top
    };
  }

  function buildGhost(piece, geo) {
    var ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    var filled = {};
    piece.cells.forEach(function (cell) { filled[cell[0] + "-" + cell[1]] = true; });
    for (var r = 0; r < piece.h; r++) {
      for (var c = 0; c < piece.w; c++) {
        if (!filled[r + "-" + c]) continue;
        var span = document.createElement("span");
        span.className = "pcell on " + colorClass(piece.color);
        span.style.width = geo.w + "px";
        span.style.height = geo.h + "px";
        span.style.transform = "translate3d(" + (c * geo.stepX) + "px," + (r * geo.stepY) + "px,0)";
        ghost.appendChild(span);
      }
    }
    document.body.appendChild(ghost);
    return ghost;
  }

  function moveGhost(x, y) {
    var drag = app.drag;
    if (!drag || !drag.ghost) return;
    var left = x - (drag.grabC + 0.5) * drag.geo.stepX;
    var top = y - drag.lift - (drag.grabR + 0.5) * drag.geo.stepY;
    drag.ghost.style.transform = "translate3d(" + left + "px," + top + "px,0)";
  }

  /* pointermove saniyede yüzlerce kez gelir; kare başına bir kez işleriz. */
  function onDragMove(event) {
    var drag = app.drag;
    if (!drag) return;
    event.preventDefault();
    drag.queued = event;
    if (drag.frame) return;
    drag.frame = requestAnimationFrame(function () {
      var current = app.drag;
      if (!current) return;
      current.frame = 0;
      var queued = current.queued;
      current.queued = null;
      if (queued) updateDrag(queued);
    });
  }

  function updateDrag(event) {
    var drag = app.drag;
    if (!drag) return;
    if (app.cursor) {
      app.cursor = null;
      $$(".cell.cursor").forEach(function (cell) { cell.classList.remove("cursor"); });
    }
    if (Math.abs(event.clientX - drag.startX) > 6 || Math.abs(event.clientY - drag.startY) > 6) {
      drag.moved = true;
    }
    moveGhost(event.clientX, event.clientY);

    var geo = drag.geo;
    var bounds = drag.bounds;
    var col = Math.round((event.clientX - (drag.grabC + 0.5) * geo.stepX - geo.x) / geo.stepX);
    var row = Math.round((event.clientY - drag.lift - (drag.grabR + 0.5) * geo.stepY - geo.y) / geo.stepY);
    var inside = event.clientX >= bounds.left - geo.stepX && event.clientX <= bounds.right + geo.stepX &&
      event.clientY >= bounds.top - geo.stepY - drag.lift && event.clientY <= bounds.bottom + geo.stepY;
    if (!inside) {
      hidePreview();
      drag.target = null;
      if (drag.ghost) drag.ghost.style.opacity = "";
      return;
    }

    var board = activeBoard();
    if (!board) return;
    var valid = CORE.canPlace(board, drag.piece, row, col);
    var key = row + ":" + col + ":" + (valid ? 1 : 0);
    if (drag.target && drag.target.key === key) return;  // hedef değişmedi: boşuna çizme
    drag.target = { row: row, col: col, valid: valid, key: key };
    showPreview(drag.piece, row, col, geo, valid);
    /* Tahtanın üstündeyken parmağın altındaki kopya gizlenir; hedef önizlemesi yeterli. */
    if (drag.ghost) drag.ghost.style.opacity = "0";
    if (valid) markLineHint(drag.boardEl, board, drag.piece, row, col);
    else clearLineHint();
  }

  function onDragEnd() {
    var drag = app.drag;
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
    window.removeEventListener("pointercancel", onDragEnd);
    if (!drag) return;
    if (drag.frame) {
      cancelAnimationFrame(drag.frame);
      drag.frame = 0;
    }
    if (drag.queued) {
      var queued = drag.queued;
      drag.queued = null;
      updateDrag(queued);
    }
    if (drag.ghost && drag.ghost.parentNode) drag.ghost.parentNode.removeChild(drag.ghost);
    hidePreview();
    var target = drag.target;
    app.drag = null;
    if (drag.moved && target && target.valid) {
      performMove(drag.index, target.row, target.col);
    } else if (!drag.moved) {
      app.selected = drag.index;
      app.cursor = null;
      $$(".piece").forEach(function (el) {
        el.classList.toggle("selected", Number(el.dataset.piece) === drag.index);
      });
    }
  }

  function cancelDrag() {
    if (!app.drag) return;
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
    window.removeEventListener("pointercancel", onDragEnd);
    if (app.drag.frame) cancelAnimationFrame(app.drag.frame);
    if (app.drag.ghost && app.drag.ghost.parentNode) app.drag.ghost.parentNode.removeChild(app.drag.ghost);
    app.drag = null;
    hidePreview();
  }

  function activeBoardEl() {
    var s = app.state;
    if (!s) return null;
    if (s.mode === "coop") return $("#board-shared");
    if (!app.online) return $("#board-" + displayIndex());
    return $("#board-me");
  }

  function activeBoard() {
    var s = app.state;
    if (!s) return null;
    if (s.mode === "coop") return s.shared.board;
    return s.players[app.online ? app.me : displayIndex()].board;
  }

  /* ---------- hedef önizlemesi: tahtada tek katman, renkli ve okunur ---------- */

  function showPreview(piece, row, col, geo, valid) {
    var el = app.preview;
    if (!el || app.previewPiece !== piece) {
      hidePreview();
      el = document.createElement("div");
      el.className = "drop-preview";
      var filled = {};
      piece.cells.forEach(function (cell) { filled[cell[0] + "-" + cell[1]] = true; });
      for (var r = 0; r < piece.h; r++) {
        for (var c = 0; c < piece.w; c++) {
          if (!filled[r + "-" + c]) continue;
          var span = document.createElement("span");
          span.className = "dp on " + colorClass(piece.color);
          span.style.width = geo.w + "px";
          span.style.height = geo.h + "px";
          span.style.transform = "translate3d(" + (c * geo.stepX) + "px," + (r * geo.stepY) + "px,0)";
          el.appendChild(span);
        }
      }
      document.body.appendChild(el);
      app.preview = el;
      app.previewPiece = piece;
    }
    el.style.transform = "translate3d(" + (geo.x + col * geo.stepX) + "px," + (geo.y + row * geo.stepY) + "px,0)";
    el.classList.toggle("bad", !valid);
  }

  function hidePreview() {
    if (app.preview && app.preview.parentNode) app.preview.parentNode.removeChild(app.preview);
    app.preview = null;
    app.previewPiece = null;
    clearLineHint();
  }

  function clearLineHint() {
    if (!app.hintCells) return;
    app.hintCells.forEach(function (cell) { cell.classList.remove("clear-hint"); });
    app.hintCells = null;
  }

  /* Patlayacak satır/sütunları önceden işaretler (yalnızca hedef değişince çağrılır). */
  function markLineHint(boardEl, board, piece, row, col) {
    clearLineHint();
    var test = board.map(function (line) { return line.slice(); });
    piece.cells.forEach(function (cell) { test[row + cell[0]][col + cell[1]] = "preview"; });
    var full = CORE.fullLines(test);
    if (!full.rows.length && !full.cols.length) return;
    var els = [];
    full.rows.forEach(function (r) {
      for (var c = 0; c < SIZE; c++) {
        var el = boardEl.children[r * SIZE + c];
        if (el) els.push(el);
      }
    });
    full.cols.forEach(function (c) {
      for (var r = 0; r < SIZE; r++) {
        var el = boardEl.children[r * SIZE + c];
        if (el) els.push(el);
      }
    });
    els.forEach(function (el) { el.classList.add("clear-hint"); });
    app.hintCells = els;
  }

  function onBoardPointerMove(event) {
    if (app.drag || app.selected == null || event.pointerType !== "mouse" || !canPlay()) return;
    var cell = event.target.closest(".cell");
    if (!cell || !app.state) return;
    var boardEl = activeBoardEl();
    var board = activeBoard();
    if (!boardEl || !board) return;
    var s = app.state;
    var tray = s.mode === "coop" ? s.shared.tray : s.players[app.online ? app.me : displayIndex()].tray;
    var piece = tray[app.selected];
    if (!piece) return;
    var geo = boardGeometry(boardEl);
    if (!geo) return;
    var row = Number(cell.dataset.r);
    var col = Number(cell.dataset.c);
    var valid = CORE.canPlace(board, piece, row, col);
    showPreview(piece, row, col, geo, valid);
    if (valid) markLineHint(boardEl, board, piece, row, col);
    else clearLineHint();
  }

  function onBoardClick(event) {
    if (app.selected == null || !canPlay()) return;
    var cell = event.target.closest(".cell");
    if (!cell) return;
    app.cursor = null;
    performMove(app.selected, Number(cell.dataset.r), Number(cell.dataset.c));
  }

  function animateLastMove() {
    var s = app.state;
    if (!s || !s.lastMove) return;
    if (s.seq <= app.lastAnimated) return;
    app.lastAnimated = s.seq;
    var last = s.lastMove;
    var owner = s.mode === "coop" ? "shared" : (app.online ? String(last.by) : "active");
    var boardEl = document.querySelector('[data-board="' + owner + '"]');
    /* Botun hamlesi oyuncunun tahtasında oynatılmasın. */
    if (boardEl && s.mode === "versus" && !app.online && last.by !== displayIndex()) boardEl = null;
    if (boardEl) {
      last.placed.forEach(function (cell) {
        var el = boardEl.children[cell[0] * SIZE + cell[1]];
        if (el) el.classList.add("pop");
      });
      last.rows.forEach(function (r) {
        for (var c = 0; c < SIZE; c++) {
          var el = boardEl.children[r * SIZE + c];
          if (el) el.classList.add("flash");
        }
      });
      last.cols.forEach(function (c) {
        for (var r = 0; r < SIZE; r++) {
          var el = boardEl.children[r * SIZE + c];
          if (el) el.classList.add("flash");
        }
      });
    }

    if (last.lines > 0) {
      sfxClear(last.lines);
      if (app.vibrate && FX) FX.vibrate(last.lines > 1 ? [18, 35, 18] : 14);
      if (FX && boardEl) {
        var rect = boardEl.getBoundingClientRect();
        var pitch = rect.width / SIZE;
        var cells = last.cleared && last.cleared.length ? last.cleared : [];
        if (cells.length > 18) cells = cells.slice(0, 18);
        cells.forEach(function (cell) {
          var cx = rect.left + (cell[1] + 0.5) * pitch;
          var cy = rect.top + (cell[0] + 0.5) * pitch;
          FX.burst(cx, cy, last.piece.color, 5, 0.7);
          if (Math.random() < 0.3) FX.burst(cx, cy, "mustard", 2, 0.9);
        });
        FX.floatText(rect.left + rect.width / 2, rect.top + rect.height * 0.38,
          "+" + last.points, "points");
        if (last.timeBonus) {
          FX.floatText(rect.left + rect.width / 2, rect.top + rect.height * 0.5,
            "+" + last.timeBonus + " sn", "time");
        }
        if (last.lines >= 2) FX.shake(boardEl);
        if (last.lines >= 3) FX.confetti();
        if (last.combo > 1) {
          FX.floatText(rect.left + rect.width / 2, rect.top + rect.height * 0.62,
            "COMBO ×" + last.combo, "combo");
        }
      }
      if (last.lines > 1 || last.combo > 1) {
        toast("+" + last.points + " · " + last.lines + " satır" + (last.combo > 1 ? " · combo ×" + last.combo : ""));
      }
    } else {
      sfxPlace();
      if (app.vibrate && FX) FX.vibrate(5);
      if (FX && boardEl) FX.pulse(boardEl);
    }
    if (last.garbage && FX) {
      var rivalBoard = document.querySelector('[data-board="' + last.garbage.to + '"]');
      if (rivalBoard) {
        FX.shake(rivalBoard);
        toast("Rakibe " + last.garbage.rows + " çöp satır!");
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* lobi                                                               */
  /* ------------------------------------------------------------------ */

  function renderLobby() {
    var s = app.state;
    if (!s || s.phase !== "lobby") return;
    var host = s.host;
    var isHost = app.me === host;
    $("#lobby-code").textContent = s.code || app.room || "-----";
    $("#lobby-title").textContent = s.players.length < 2 ? "Arkadaşını bekle" : "Herkes hazır";

    $$("#lobby-mode button").forEach(function (button) {
      var mode = button.dataset.mode;
      button.setAttribute("aria-pressed", mode === s.mode ? "true" : "false");
      button.disabled = !isHost;
    });

    $$("#lobby-timer button").forEach(function (button) {
      var on = button.dataset.time === (s.timeMode || "shared");
      button.setAttribute("aria-pressed", on ? "true" : "false");
      button.disabled = !isHost;
    });

    var slots = "";
    for (var i = 0; i < 2; i++) {
      var player = s.players[i];
      if (player) {
        var initial = (player.name || "?").trim().charAt(0).toUpperCase() || "?";
        var status = player.connected ? "Hazır" : "Bağlantı bekleniyor";
        if (i === app.me) status += " · sen";
        slots += '<li class="slot">' +
          '<span class="avatar">' + esc(initial) + '</span>' +
          '<span class="slot-info"><span class="slot-name">' + esc(player.name) + '</span>' +
          '<span class="slot-status' + (player.connected ? "" : " offline") + '">' + status + '</span></span>' +
          (i === host ? '<span class="tag-host">oda sahibi</span>' : "") +
          '</li>';
      } else {
        slots += '<li class="slot empty"><span class="avatar">?</span>' +
          '<span class="slot-info"><span class="slot-name">Boş yer</span>' +
          '<span class="slot-status">Kodu paylaş, arkadaşın katılsın</span></span></li>';
      }
    }
    $("#lobby-slots").innerHTML = slots;

    var startBtn = $("#start-btn");
    if (isHost) {
      startBtn.hidden = false;
      startBtn.disabled = s.players.length < 2 || !s.players.every(function (p) { return p.connected; });
      startBtn.textContent = s.players.length < 2 ? "İkinci oyuncu bekleniyor" : "Oyunu başlat";
      $("#lobby-hint").textContent = s.players.length < 2
        ? "Kodu arkadaşına gönder. O da bu sayfada kodu girsin."
        : "İki oyuncu da hazır. Başlatabilirsin.";
    } else {
      startBtn.hidden = true;
      $("#lobby-hint").textContent = s.players.length < 2
        ? "Oda sahibi arkadaşını bekliyor."
        : "Oda sahibi oyunu başlatınca tahta açılır.";
    }
    updateRoomChrome();
  }

  /* ------------------------------------------------------------------ */
  /* modallar                                                            */
  /* ------------------------------------------------------------------ */

  function openOverlay(innerHTML, closable) {
    var overlay = $("#overlay");
    var sheet = $(".sheet", overlay);
    sheet.innerHTML = innerHTML;
    overlay.hidden = false;
    app.overlayClosable = closable !== false;
    document.body.style.overflow = "hidden";
    hideToast();
    var first = sheet.querySelector("[data-autofocus]") || sheet.querySelector("button");
    if (first) setTimeout(function () { first.focus(); }, 30);
  }

  function closeOverlay() {
    var overlay = $("#overlay");
    overlay.hidden = true;
    $(".sheet", overlay).innerHTML = "";
    document.body.style.overflow = "";
  }

  function showHelp() {
    openOverlay(
      '<span class="result-badge">Kurallar</span>' +
      '<h2>İki kişilik blok</h2>' +
      '<p class="sheet-sub">Her turda üç blok gelir. Blokları 8×8 tahtaya sürükle; satır ya da sütun tamamlanınca patlar. Üç blok bitmeden yenisi gelmez.</p>' +
      '<ul class="help-list">' +
        '<li><b>Ortak tahta</b><span>Tek tahta, tek skor. Sırayla oynarsınız; herkesin katkısı ayrı sayılır. Tahta tıkanınca tur biter.</span></li>' +
        '<li><b>Rakip</b><span>Herkesin kendi tahtası, aynı blok sırası. Tahtası dolan oyuncu kaybeder. İki satır birden patlatırsan rakibin tahtasına çöp satır itersin.</span></li>' +
        '<li><b>Süre</b><span>Ortak sayaçta süre bitince yüksek skor kazanır. Sıra sayacında süre dolarsa −15 puan ceza alır ve sıra geçer. Satır patlatmak süre kazandırır.</span></li>' +
        '<li><b>Combo</b><span>Üst üste satır patlatırsan puan çarpanı yükselir; üçlü patlatma daha çok süre verir.</span></li>' +
        '<li><b>Günün tahtası</b><span>Her gün aynı blok dizisi. Bir tur oyna, seriyi sürdür, bonus coin kazan.</span></li>' +
        '<li><b>Uzaktan</b><span>Oda kur, 5 haneli kodu paylaş. İki oyuncu da aynı sunucuya bağlanır.</span></li>' +
      '</ul>' +
      '<div class="sheet-actions"><button class="btn btn-ink" type="button" data-close data-autofocus>Anladım</button></div>'
    );
  }

  function timeModeLabel(mode) {
    if (mode === "none") return "Süresiz";
    if (mode === "turn") return "Sıra süresi";
    return "Ortak süre";
  }

  function showResult(reward) {
    var s = app.state;
    if (!s) return;
    var coop = s.mode === "coop";
    var winner = s.winner;
    var human = app.online ? app.me : 0;
    var won = winner === human;
    var badge;
    var title;
    if (coop) {
      badge = "ortak tur";
      title = "Tur bitti";
    } else if (winner != null && s.players[winner]) {
      badge = won ? "kazandın" : "kaybettin";
      title = s.players[winner].name + " kazandı";
    } else {
      badge = "tur bitti";
      title = "Berabere";
    }
    if (app.daily) badge = "günün tahtası";

    var rows = s.players.map(function (player, index) {
      var isWinner = !coop && winner === index;
      return '<div class="result-row' + (isWinner ? " win" : "") + '">' +
        '<span class="rname"><span class="score-dot" style="background:' +
          (index === 0 ? "var(--coral)" : "var(--cobalt)") + '"></span><span>' + esc(player.name) + '</span></span>' +
        '<span class="rscore">' + fmt(player.score) + '</span>' +
        '</div>';
    }).join("");

    var meta = "";
    if (coop) {
      meta += '<span>Ortak skor ' + fmt(s.shared.score) + '</span>';
      meta += '<span>' + s.shared.lines + ' satır</span>';
      meta += '<span>' + s.shared.blocks + ' blok tahtada</span>';
      if (s.shared.combo > 1) meta += '<span>Son combo ×' + s.shared.combo + '</span>';
    } else {
      meta += '<span>' + s.players[0].lines + ' + ' + s.players[1].lines + ' satır</span>';
      meta += '<span>' + ((s.players[0].moves || 0) + (s.players[1].moves || 0)) + ' hamle</span>';
      meta += '<span>' + timeModeLabel(s.timeMode || app.timeMode) + '</span>';
    }

    var rewardHTML = "";
    if (reward) {
      rewardHTML += '<div class="reward-row">' +
        '<span><b>+' + fmt(reward.xp) + '</b> XP</span>' +
        '<span><b>+' + fmt(reward.coins) + '</b> coin</span>';
      if (reward.newRecord) rewardHTML += '<span class="reward-badge">yeni rekor</span>';
      if (reward.levelUp) rewardHTML += '<span class="reward-badge level">seviye ' + reward.levelAfter + '</span>';
      rewardHTML += '</div>';
      if (reward.daily && reward.daily.newDay) {
        rewardHTML += '<p class="result-note daily-note">Günün tahtası tamam · ' +
          reward.daily.streak + ' günlük seri' +
          (reward.daily.bonus ? " · +" + reward.daily.bonus + " bonus coin" : "") + '</p>';
      }
      if (reward.unlocked && reward.unlocked.length) {
        rewardHTML += '<div class="reward-unlock"><span class="tiny">Yeni başarım</span>' +
          reward.unlocked.map(function (item) {
            return '<span class="unlock-chip">' + item.title + '</span>';
          }).join("") + '</div>';
      }
    }

    var canRematch = !app.online || app.me === s.host;
    var action = canRematch
      ? '<button class="btn btn-coral" type="button" data-rematch data-autofocus>' +
        (app.daily ? "Yeniden oyna" : "Yeniden oyna") + '</button>'
      : '<p class="result-note">Yeniden başlatmayı oda sahibi yapar.</p>';

    var rejoinNote = app.online && s.players.some(function (p) { return !p.connected; })
      ? '<p class="result-note">Bir oyuncunun bağlantısı yok. Yeniden başlatmak için iki oyuncu da bağlı olmalı.</p>'
      : "";

    var sub = coop
      ? '<p class="sheet-sub">Birlikte ' + fmt(s.shared.score) + ' puana ulaştınız.</p>'
      : (app.botLevel
        ? '<p class="sheet-sub">' + (won ? "Botu geçtin." : "Bot bu turu aldı.") +
          (app.daily ? " Günün tahtası sayıldı." : "") + '</p>'
        : '<p class="sheet-sub">' + (won ? "Rakibinin tahtası doldu." : "Tahtan doldu.") + '</p>');

    openOverlay(
      '<span class="result-badge' + (coop ? "" : (won ? "" : " lost")) + '">' + badge + '</span>' +
      '<h2>' + esc(title) + '</h2>' +
      sub +
      '<div class="result-scores">' + rows + '</div>' +
      '<div class="result-meta">' + meta + '</div>' +
      rewardHTML +
      (s.reason ? '<p class="result-note">' + esc(s.reason) + '</p>' : "") +
      rejoinNote +
      '<div class="sheet-actions">' +
        action +
        '<button class="btn btn-outline" type="button" data-close>Tahtaya bak</button>' +
        '<button class="btn btn-ghost" type="button" data-home>Ana menü</button>' +
      '</div>',
      true
    );
    if (s.phase === "over") {
      if (won || coop) sfxWin(); else sfxLose();
    }
  }

  function showMenu() {
    var s = app.state;
    if (!s) return;
    var online = app.online;
    var canRestart = s.phase === "over" ? (!online || app.me === s.host) : false;
    var restartLabel = online ? "Yeniden başlat" : "Yeni oyun";
    var info = app.profile ? PROGRESS.levelInfo(app.profile.xp) : null;
    openOverlay(
      '<span class="result-badge">Duraklat</span>' +
      '<h2>Oyun menüsü</h2>' +
      '<p class="sheet-sub">' + (online ? 'Oda <b>' + esc(app.room || "") + '</b> · ' + modeName(s.mode) + ' · Online' : modeName(s.mode) + ' · Aynı cihaz') + '</p>' +
      (info ? '<p class="result-note">Seviye ' + info.level + ' · ' + fmt(app.profile.coins) + ' coin · ' + fmt(app.profile.bestAny || 0) + ' rekor</p>' : '') +
      '<div class="sheet-actions">' +
        (canRestart ? '<button class="btn btn-coral" type="button" data-restart>' + restartLabel + '</button>' : '') +
        '<button class="btn btn-outline" type="button" data-help>Nasıl oynanır?</button>' +
        '<button class="btn btn-outline" type="button" data-sound>' + (app.sound ? "Sesi kapat" : "Sesi aç") + '</button>' +
        '<button class="btn btn-outline" type="button" data-vibrate>' + (app.vibrate ? "Titreşimi kapat" : "Titreşimi aç") + '</button>' +
        '<button class="btn btn-ghost" type="button" data-reset-progress>İlerlemeyi sıfırla</button>' +
        '<button class="btn btn-ghost" type="button" data-exit>Oyundan çık</button>' +
      '</div>' +
      '<div class="sheet-actions"><button class="btn btn-ink" type="button" data-close data-autofocus>Devam et</button></div>',
      true
    );
  }

  function showConfirm(title, text, confirmLabel, onConfirm) {
    openOverlay(
      '<span class="result-badge">Emin misin?</span>' +
      '<h2>' + esc(title) + '</h2>' +
      '<p class="sheet-sub">' + esc(text) + '</p>' +
      '<div class="sheet-actions">' +
        '<button class="btn btn-coral" type="button" data-confirm data-autofocus>' + esc(confirmLabel) + '</button>' +
        '<button class="btn btn-outline" type="button" data-close>Vazgeç</button>' +
      '</div>',
      true
    );
    var sheet = $(".sheet");
    var confirmBtn = sheet.querySelector("[data-confirm]");
    if (confirmBtn) {
      confirmBtn.addEventListener("click", function () {
        closeOverlay();
        onConfirm();
      });
    }
  }

  function closeOverlayHandler() {
    if (app.overlayClosable) closeOverlay();
  }

  /* ------------------------------------------------------------------ */
  /* toast                                                              */
  /* ------------------------------------------------------------------ */

  function toast(message) {
    var el = $("#toast");
    el.textContent = message;
    el.classList.add("show");
    if (app.toastTimer) clearTimeout(app.toastTimer);
    app.toastTimer = setTimeout(function () {
      el.classList.remove("show");
    }, 2800);
  }

  function hideToast() {
    var el = $("#toast");
    if (!el) return;
    el.classList.remove("show");
    if (app.toastTimer) {
      clearTimeout(app.toastTimer);
      app.toastTimer = null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* olay bağlama                                                        */
  /* ------------------------------------------------------------------ */

  function playerName() {
    var input = $("#player-name");
    var value = input ? input.value.trim() : "";
    if (value) save(LS_NAME, value);
    return value;
  }

  /* Sunucu yoksa kullanıcıyı doğrudan adres alanına götürür. */
  function askServer(message) {
    toast(message || "Uzaktan oyun için sunucu ayarlı değil.");
    var online = $("#online-card");
    if (online && !online.open) online.open = true;
  }

  function createRoom(mode) {
    if (app.busy) return;
    app.busy = true;
    var name = playerName();
    ensureSocket().then(function () {
      wsSend({ t: "create", mode: mode, name: name });
      setTimeout(function () { app.busy = false; }, 500);
    }).catch(function (error) {
      app.busy = false;
      var message = error.message || "Sunucuya bağlanılamadı.";
      if (/sunucu/i.test(message)) askServer(message);
      else toast(message);
    });
  }

  function joinRoom(code) {
    if (app.busy) return;
    var clean = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
    if (clean.length < 5) {
      toast("5 haneli oda kodunu gir.");
      $("#join-code").focus();
      return;
    }
    app.busy = true;
    var name = playerName();
    ensureSocket().then(function () {
      wsSend({ t: "join", code: clean, name: name });
      setTimeout(function () { app.busy = false; }, 500);
    }).catch(function (error) {
      app.busy = false;
      var message = error.message || "Sunucuya bağlanılamadı.";
      if (/sunucu/i.test(message)) askServer(message);
      else toast(message);
    });
  }

  function leaveToHome(confirmFirst) {
    var doLeave = function () {
      if (app.online) {
        wsSend({ t: "leave" });
        setTimeout(function () {
          cleanupOnline(false);
          showScreen("home");
        }, 60);
      } else {
        showScreen("home");
      }
      app.state = null;
      app.game = null;
      app.selected = null;
      app.shownResultKey = null;
      updateRoomChrome();
    };

    if (!confirmFirst) return doLeave();
    var inPlay = app.state && app.state.phase === "playing" && app.screen === "game";
    if (!inPlay) return doLeave();
    showConfirm(
      "Oyundan çıkılsın mı?",
      app.online ? "Odadan ayrılırsan arkadaşın devam edemez." : "Bu turdaki skor kaybolur.",
      "Çık",
      doLeave
    );
  }

  function bindStaticEvents() {
    $("#brand").addEventListener("click", function () {
      if (app.screen === "home") return;
      leaveToHome(true);
    });

    $("#exit-btn").addEventListener("click", function () {
      leaveToHome(true);
    });

    $("#help-btn").addEventListener("click", showHelp);

    $("#sound-btn").addEventListener("click", function () {
      app.sound = !app.sound;
      save(LS_SOUND, app.sound ? "1" : "0");
      updateSoundButton();
      if (app.sound) { audio(); sfxPlace(); }
    });

    $$("[data-local]").forEach(function (button) {
      button.addEventListener("click", function () {
        audio();
        startLocal(button.dataset.local === "coop" ? "coop" : "versus", { timeMode: app.timeMode });
      });
    });

    $$("[data-host]").forEach(function (button) {
      button.addEventListener("click", function () {
        audio();
        createRoom(button.dataset.host === "coop" ? "coop" : "versus");
      });
    });

    $("#join-form").addEventListener("submit", function (event) {
      event.preventDefault();
      audio();
      joinRoom($("#join-code").value);
    });

    $("#join-code").addEventListener("input", function (event) {
      event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
    });

    $("#player-name").addEventListener("input", function (event) {
      save(LS_NAME, event.target.value.trim());
    });

    $("#copy-code").addEventListener("click", function () {
      copyText($("#lobby-code").textContent, "Oda kodu kopyalandı.");
    });

    $("#share-code").addEventListener("click", shareRoom);

    $("#start-btn").addEventListener("click", function () {
      wsSend({ t: "start" });
    });

    $("#leave-lobby").addEventListener("click", function () {
      leaveToHome(false);
    });

    $$("#lobby-mode button").forEach(function (button) {
      button.addEventListener("click", function () {
        wsSend({ t: "mode", mode: button.dataset.mode });
      });
    });

    $$("#lobby-timer button").forEach(function (button) {
      button.addEventListener("click", function () {
        wsSend({ t: "timer", mode: button.dataset.time });
      });
    });

    $("#game-menu").addEventListener("click", showMenu);

    $("#game-restart").addEventListener("click", function () {
      restartGame();
    });

    $("#overlay").addEventListener("click", function (event) {
      if (event.target === $("#overlay")) closeOverlayHandler();
    });

    $(".sheet").addEventListener("click", function (event) {
      var target = event.target.closest("button");
      if (!target) return;

      if (target.hasAttribute("data-close")) {
        closeOverlay();
        return;
      }
      if (target.hasAttribute("data-home")) {
        closeOverlay();
        leaveToHome(false);
        return;
      }
      if (target.hasAttribute("data-help")) {
        showHelp();
        return;
      }
      if (target.hasAttribute("data-sound")) {
        app.sound = !app.sound;
        save(LS_SOUND, app.sound ? "1" : "0");
        updateSoundButton();
        showMenu();
        return;
      }
      if (target.hasAttribute("data-vibrate")) {
        app.vibrate = !app.vibrate;
        if (app.profile) { app.profile.vibrate = app.vibrate; PROGRESS.save(app.profile); }
        if (app.vibrate && FX) FX.vibrate(25);
        showMenu();
        return;
      }
      if (target.hasAttribute("data-reset-progress")) {
        closeOverlay();
        showConfirm("İlerleme sıfırlansın mı?",
          "Seviye, coin, başarımlar ve rekorlar silinir. Bu geri alınamaz.",
          "Sıfırla", function () {
            if (PROGRESS) app.profile = PROGRESS.reset();
            app.timeMode = "shared";
            renderHomeMeta();
            toast("İlerleme sıfırlandı.");
          });
        return;
      }
      if (target.hasAttribute("data-restart") || target.hasAttribute("data-rematch")) {
        closeOverlay();
        restartGame();
        return;
      }
      if (target.hasAttribute("data-exit")) {
        closeOverlay();
        leaveToHome(true);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (!$("#overlay").hidden) {
        if (event.key === "Escape") closeOverlayHandler();
        return;
      }
      if (event.defaultPrevented) return;
      if (app.screen === "game") {
        onBoardKeyDown(event);
        if (event.defaultPrevented) return;
      }
      if (event.key === "Escape" && app.selected != null) {
        app.selected = null;
        app.cursor = null;
        hidePreview();
        $$(".piece").forEach(function (el) { el.classList.remove("selected"); });
      }
    });

    window.addEventListener("online", function () {
      if (app.online && !app.ws) scheduleReconnect();
    });
  }

  function updateSoundButton() {
    var button = $("#sound-btn");
    button.setAttribute("aria-pressed", app.sound ? "true" : "false");
    button.setAttribute("aria-label", app.sound ? "Sesi kapat" : "Sesi aç");
  }

  function restartGame() {
    if (!app.state) return;
    if (app.online) {
      wsSend({ t: "rematch" });
      return;
    }
    startLocal(app.state.mode, {
      timeMode: app.timeMode,
      bot: app.botLevel,
      daily: app.daily,
      seed: app.daily ? PROGRESS.dailySeed() : undefined
    });
  }

  function copyText(text, message) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast(message || "Kopyalandı.");
      }).catch(function () {
        fallbackCopy(text, message);
      });
    } else {
      fallbackCopy(text, message);
    }
  }

  function fallbackCopy(text, message) {
    var area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try { document.execCommand("copy"); toast(message || "Kopyalandı."); } catch (error) { toast("Kopyalanamadı."); }
    document.body.removeChild(area);
  }

  function shareRoom() {
    var code = $("#lobby-code").textContent;
    var url = location.origin + location.pathname + "?oda=" + encodeURIComponent(code);
    if (navigator.share) {
      navigator.share({
        title: "Blok İki",
        text: "Blok İki oynayalım mı? Oda kodu: " + code,
        url: url
      }).catch(function () { /* kullanıcı iptal etti */ });
    } else {
      copyText(url, "Oda bağlantısı kopyalandı.");
    }
  }

  /* ------------------------------------------------------------------ */
  /* servis çalışanı                                                     */
  /* ------------------------------------------------------------------ */

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(function () { /* yoksay */ });
    });
  }

  /* ------------------------------------------------------------------ */

  init();
})();
