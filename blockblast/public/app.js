/* Blok İki — arayüz ve oturumlar */
(function () {
  "use strict";

  var CORE = window.BlokIki;
  if (!CORE) return;

  var SIZE = CORE.SIZE;
  var LS_NAME = "blokiki.name";
  var LS_SOUND = "blokiki.sound";
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
    busy: false
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

  /* ------------------------------------------------------------------ */
  /* yükleme                                                             */
  /* ------------------------------------------------------------------ */

  function init() {
    var savedName = read(LS_NAME);
    var nameInput = $("#player-name");
    if (savedName && nameInput) nameInput.value = savedName;

    var soundPref = read(LS_SOUND);
    app.sound = soundPref !== "0";
    updateSoundButton();

    buildHeroBoard();
    bindStaticEvents();
    registerServiceWorker();
    prepareSharedLink();
    attemptSessionRejoin();
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
    }
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  /* ------------------------------------------------------------------ */
  /* yerel oyun                                                          */
  /* ------------------------------------------------------------------ */

  function startLocal(mode) {
    app.online = false;
    app.me = 0;
    app.room = null;
    app.selected = null;
    app.pending = false;
    app.shownResultKey = null;
    app.lastAnimated = -1;
    app.game = new CORE.Game({
      mode: mode,
      names: ["Oyuncu 1", "Oyuncu 2"],
      turnBased: true
    });
    app.state = app.game.snapshot();
    showScreen("game");
    renderGame();
    sfxStart();
    checkResult();
  }

  function actorIndex() {
    var s = app.state;
    if (!s) return 0;
    if (!s.turnBased) return app.online ? app.me : 0;
    return s.turn;
  }

  function activePlayerIndex() {
    var s = app.state;
    if (!s) return 0;
    if (s.mode === "coop") return s.turn;
    return s.turnBased ? s.turn : (app.online ? app.me : 0);
  }

  function canAct() {
    var s = app.state;
    if (!s || s.phase !== "playing" || app.pending) return false;
    if (!app.online) return true;
    if (s.mode === "coop") return s.turn === app.me;
    return !!s.players[app.me] && s.players[app.me].alive;
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
    renderGame();
    checkResult();
  }

  /* ------------------------------------------------------------------ */
  /* sunucu / websocket                                                  */
  /* ------------------------------------------------------------------ */

  function wsUrl() {
    var protocol = location.protocol === "https:" ? "wss:" : "ws:";
    return protocol + "//" + location.host + "/ws";
  }

  function ensureSocket() {
    return new Promise(function (resolve, reject) {
      if (app.ws && app.ws.readyState === WebSocket.OPEN) return resolve(app.ws);
      if (location.protocol === "file:") {
        return reject(new Error("Online oyun için sayfayı sunucudan açmalısın. README'deki tek komutu çalıştır."));
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

  function applyState(state) {
    if (!state) return;
    app.state = state;
    app.pending = false;

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
    showResult();
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
    var offline = app.online && !player.connected;
    var mini = s.mode === "versus" && (app.online ? index !== app.me : index !== s.turn) ? miniBoardHTML(player.board) : "";
    return '' +
      '<div class="score-card p' + (index + 1) + (active ? " active" : "") + (mini ? " has-mini" : "") + '">' +
        '<div class="score-main">' +
          '<span class="score-name"><span class="score-dot"></span>' + esc(player.name) + '</span>' +
          '<span class="score-value">' + fmt(player.score) + '</span>' +
          '<span class="score-sub">' + (offline ? '<span class="conn-flag">bağlantı yok</span>' : sub) + '</span>' +
        '</div>' +
        mini +
      '</div>';
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
    } else {
      top = "sıra";
      main = s.players[s.turn] ? s.players[s.turn].name : "—";
    }
    return '<div class="turn-pill ' + cls + '"><span class="tp-top">' + top + '</span><span class="tp-main">' + esc(main) + '</span></div>';
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

  function pieceHTML(piece, index, interactive) {
    if (!piece) {
      return '<div class="piece empty" aria-hidden="true"></div>';
    }
    var filled = {};
    piece.cells.forEach(function (cell) { filled[cell[0] + "-" + cell[1]] = true; });
    var html = '<div class="piece' + (app.selected === index ? " selected" : "") + (interactive ? "" : " dead") +
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

  function trayHTML(tray, interactive) {
    var html = '<div class="tray" id="tray" aria-label="Blok seçimi">';
    for (var i = 0; i < tray.length; i++) {
      html += pieceHTML(tray[i], i, interactive);
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
    clearPreview();
    renderScoreboard();

    var table = $("#table-area");
    var interactive = canAct();
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
      var activeIndex = s.turn;
      var activePlayer = s.players[activeIndex];
      var activeColor = activeIndex === 0 ? "var(--coral)" : "var(--cobalt)";
      html += '<div class="vs-local">';
      html += boardHTML(
        activePlayer.board,
        "board-" + activeIndex,
        "active",
        '<span class="score-dot" style="background:' + activeColor + '"></span>' +
        esc(activePlayer.name) + ' <span class="you">sıra sende</span>'
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
    updateRoomChrome();
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
        if (!app.drag) clearPreview();
      });
      boardEl.addEventListener("click", onBoardClick);
    });
  }

  function onTrayKeyDown(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    var pieceEl = event.target.closest(".piece");
    if (!pieceEl || pieceEl.classList.contains("empty") || pieceEl.classList.contains("dead")) return;
    if (!canAct()) return;
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
    var tray = s.mode === "coop" ? s.shared.tray : s.players[app.online ? app.me : s.turn].tray;
    var board = s.mode === "coop" ? s.shared.board : s.players[app.online ? app.me : s.turn].board;
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
    var tray = s.mode === "coop" ? s.shared.tray : s.players[app.online ? app.me : s.turn].tray;
    var board = s.mode === "coop" ? s.shared.board : s.players[app.online ? app.me : s.turn].board;
    var piece = tray[app.selected];
    if (!piece) return;
    paintPreview(boardEl, piece, cursor.row, cursor.col);
    var el = boardEl.children[cursor.row * SIZE + cursor.col];
    if (el) el.classList.add("cursor");
  }

  function onBoardKeyDown(event) {
    var s = app.state;
    if (!s || app.screen !== "game" || app.selected == null || !canAct()) return;
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
    if (!canAct()) return;
    var pieceEl = event.target.closest(".piece");
    if (!pieceEl || pieceEl.classList.contains("empty") || pieceEl.classList.contains("dead")) return;
    event.preventDefault();

    var index = Number(pieceEl.dataset.piece);
    var s = app.state;
    var tray = s.mode === "coop" ? s.shared.tray : s.players[app.online ? app.me : s.turn].tray;
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
      lift: event.pointerType === "mouse" ? 0 : 46,
      boardEl: boardEl,
      ghost: null,
      target: null,
      pointerId: event.pointerId
    };
    buildGhost();
    moveGhost(event.clientX, event.clientY);
    window.addEventListener("pointermove", onDragMove, { passive: false });
    window.addEventListener("pointerup", onDragEnd);
    window.addEventListener("pointercancel", onDragEnd);
  }

  function buildGhost() {
    var drag = app.drag;
    if (!drag) return;
    var rect = drag.boardEl.getBoundingClientRect();
    var pitch = rect.width / SIZE;
    var tile = pitch * 0.86;
    var ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    ghost.style.setProperty("--tile", tile + "px");
    ghost.style.gridTemplateColumns = "repeat(" + drag.piece.w + ", " + tile + "px)";
    ghost.style.gap = (pitch - tile) + "px";
    var filled = {};
    drag.piece.cells.forEach(function (cell) { filled[cell[0] + "-" + cell[1]] = true; });
    for (var r = 0; r < drag.piece.h; r++) {
      for (var c = 0; c < drag.piece.w; c++) {
        var el = document.createElement("span");
        el.className = "pcell" + (filled[r + "-" + c] ? " on " + colorClass(drag.piece.color) : "");
        ghost.appendChild(el);
      }
    }
    document.body.appendChild(ghost);
    drag.ghost = ghost;
  }

  function moveGhost(x, y) {
    var drag = app.drag;
    if (!drag || !drag.ghost) return;
    var rect = drag.boardEl.getBoundingClientRect();
    var pitch = rect.width / SIZE;
    var left = x - (drag.grabC + 0.5) * pitch;
    var top = y - drag.lift - (drag.grabR + 0.5) * pitch;
    drag.ghost.style.left = left + "px";
    drag.ghost.style.top = top + "px";
  }

  function onDragMove(event) {
    var drag = app.drag;
    if (!drag) return;
    event.preventDefault();
    if (app.cursor) {
      app.cursor = null;
      $$(".cell.cursor").forEach(function (cell) { cell.classList.remove("cursor"); });
    }
    if (Math.abs(event.clientX - drag.startX) > 6 || Math.abs(event.clientY - drag.startY) > 6) {
      drag.moved = true;
    }
    moveGhost(event.clientX, event.clientY);
    var rect = drag.boardEl.getBoundingClientRect();
    var pitch = rect.width / SIZE;
    var col = Math.round((event.clientX - rect.left - (drag.grabC + 0.5) * pitch) / pitch);
    var row = Math.round((event.clientY - drag.lift - rect.top - (drag.grabR + 0.5) * pitch) / pitch);
    var inside = event.clientX >= rect.left - pitch && event.clientX <= rect.right + pitch &&
      event.clientY >= rect.top - pitch && event.clientY <= rect.bottom + pitch;
    if (!inside) {
      clearPreview();
      drag.target = null;
      return;
    }
    var valid = paintPreview(drag.boardEl, drag.piece, row, col);
    drag.target = { row: row, col: col, valid: valid };
  }

  function onDragEnd() {
    var drag = app.drag;
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
    window.removeEventListener("pointercancel", onDragEnd);
    if (!drag) return;
    if (drag.ghost && drag.ghost.parentNode) drag.ghost.parentNode.removeChild(drag.ghost);
    clearPreview();
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
    if (app.drag.ghost && app.drag.ghost.parentNode) app.drag.ghost.parentNode.removeChild(app.drag.ghost);
    app.drag = null;
  }

  function activeBoardEl() {
    var s = app.state;
    if (!s) return null;
    if (s.mode === "coop") return $("#board-shared");
    if (!app.online) return $("#board-" + s.turn);
    return $("#board-me");
  }

  function paintPreview(boardEl, piece, row, col) {
    clearPreview();
    var valid = true;
    var s = app.state;
    var board = s.mode === "coop" ? s.shared.board : s.players[app.online ? app.me : s.turn].board;
    if (!CORE.canPlace(board, piece, row, col)) valid = false;

    for (var i = 0; i < piece.cells.length; i++) {
      var r = row + piece.cells[i][0];
      var c = col + piece.cells[i][1];
      if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) { valid = false; continue; }
      var cell = boardEl.children[r * SIZE + c];
      if (!cell) continue;
      cell.classList.add(valid ? "ghost" : "bad", colorClass(piece.color));
    }

    if (valid) {
      var test = board.map(function (line) { return line.slice(); });
      piece.cells.forEach(function (cell) {
        test[row + cell[0]][col + cell[1]] = "preview";
      });
      var full = CORE.fullLines(test);
      full.rows.forEach(function (r) {
        for (var c = 0; c < SIZE; c++) {
          var el = boardEl.children[r * SIZE + c];
          if (el) el.classList.add("clear-hint");
        }
      });
      full.cols.forEach(function (c) {
        for (var r = 0; r < SIZE; r++) {
          var el = boardEl.children[r * SIZE + c];
          if (el) el.classList.add("clear-hint");
        }
      });
    }
    return valid;
  }

  function clearPreview() {
    $$(".cell.ghost, .cell.bad").forEach(function (cell) {
      cell.classList.remove("ghost", "bad", "c-coral", "c-cobalt", "c-mustard", "c-mint", "c-grape", "c-sky");
    });
    $$(".cell.clear-hint").forEach(function (cell) {
      cell.classList.remove("clear-hint");
    });
  }

  function onBoardPointerMove(event) {
    if (app.drag || app.selected == null || event.pointerType !== "mouse" || !canAct()) return;
    var cell = event.target.closest(".cell");
    if (!cell || !app.state) return;
    var s = app.state;
    var tray = s.mode === "coop" ? s.shared.tray : s.players[app.online ? app.me : s.turn].tray;
    var piece = tray[app.selected];
    if (!piece) return;
    paintPreview(activeBoardEl(), piece, Number(cell.dataset.r), Number(cell.dataset.c));
  }

  function onBoardClick(event) {
    if (app.selected == null || !canAct()) return;
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
      if (navigator.vibrate) navigator.vibrate(last.lines > 1 ? [18, 35, 18] : 14);
      if (last.lines > 1 || last.combo > 1) {
        toast("+" + last.points + " · " + last.lines + " satır" + (last.combo > 1 ? " · combo ×" + last.combo : ""));
      }
    } else {
      sfxPlace();
      if (navigator.vibrate) navigator.vibrate(5);
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
        '<li><b>Rakip</b><span>Herkesin kendi tahtası, aynı blok sırası. Tahtası dolan oyuncu kaybeder.</span></li>' +
        '<li><b>Combo</b><span>Üst üste satır patlatırsan puan çarpanı yükselir.</span></li>' +
        '<li><b>Uzaktan</b><span>Oda kur, 5 haneli kodu paylaş. İki oyuncu da aynı sunucuya bağlanır.</span></li>' +
      '</ul>' +
      '<div class="sheet-actions"><button class="btn btn-ink" type="button" data-close data-autofocus>Anladım</button></div>'
    );
  }

  function showResult() {
    var s = app.state;
    if (!s) return;
    var coop = s.mode === "coop";
    var winner = s.winner;
    var badge;
    var title;
    if (coop) {
      badge = "ortak tur";
      title = "Tur bitti";
    } else if (winner != null && s.players[winner]) {
      badge = app.online ? (winner === app.me ? "kazandın" : "kaybettin") : "rakip modu";
      title = s.players[winner].name + " kazandı";
    } else {
      badge = "tur bitti";
      title = "Berabere";
    }

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
      meta += '<span>' + (s.shared.moves || 0) + ' hamle</span>';
      if (s.shared.combo > 1) meta += '<span>Son combo ×' + s.shared.combo + '</span>';
    } else {
      meta += '<span>' + s.players[0].lines + ' + ' + s.players[1].lines + ' satır</span>';
      meta += '<span>' + ((s.players[0].moves || 0) + (s.players[1].moves || 0)) + ' hamle</span>';
      meta += '<span>Aynı blok dizisi</span>';
    }

    var canRematch = !app.online || app.me === s.host;
    var action = canRematch
      ? '<button class="btn btn-coral" type="button" data-rematch data-autofocus>Yeniden oyna</button>'
      : '<p class="result-note">Yeniden başlatmayı oda sahibi yapar.</p>';

    var rejoinNote = app.online && s.players.some(function (p) { return !p.connected; })
      ? '<p class="result-note">Bir oyuncunun bağlantısı yok. Yeniden başlatmak için iki oyuncu da bağlı olmalı.</p>'
      : "";

    openOverlay(
      '<span class="result-badge' + (coop ? "" : (app.online && winner !== app.me ? " lost" : "")) + '">' + badge + '</span>' +
      '<h2>' + esc(title) + '</h2>' +
      (coop ? '<p class="sheet-sub">Birlikte ' + fmt(s.shared.score) + ' puana ulaştınız.</p>' :
        '<p class="sheet-sub">' + (app.online ? (winner === app.me ? "Rakibinin tahtası doldu." : "Tahtan doldu.") : "Tur sona erdi.") + '</p>') +
      '<div class="result-scores">' + rows + '</div>' +
      '<div class="result-meta">' + meta + '</div>' +
      (s.reason ? '<p class="result-note">' + esc(s.reason) + '</p>' : "") +
      rejoinNote +
      '<div class="sheet-actions">' +
        action +
        '<button class="btn btn-outline" type="button" data-close>Tahtaya bak</button>' +
        '<button class="btn btn-ghost" type="button" data-home>Ana menü</button>' +
      '</div>',
      true
    );
    if (s.phase === "over") sfxLose();
  }

  function showMenu() {
    var s = app.state;
    if (!s) return;
    var online = app.online;
    var canRestart = s.phase === "over" ? (!online || app.me === s.host) : false;
    var restartLabel = online ? "Yeniden başlat" : "Yeni oyun";
    openOverlay(
      '<span class="result-badge">Duraklat</span>' +
      '<h2>Oyun menüsü</h2>' +
      '<p class="sheet-sub">' + (online ? 'Oda <b>' + esc(app.room || "") + '</b> · ' + modeName(s.mode) + ' · Online' : modeName(s.mode) + ' · Aynı cihaz') + '</p>' +
      '<div class="sheet-actions">' +
        (canRestart ? '<button class="btn btn-coral" type="button" data-restart>' + restartLabel + '</button>' : '') +
        '<button class="btn btn-outline" type="button" data-help>Nasıl oynanır?</button>' +
        '<button class="btn btn-outline" type="button" data-sound>' + (app.sound ? "Sesi kapat" : "Sesi aç") + '</button>' +
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

  function createRoom(mode) {
    if (app.busy) return;
    app.busy = true;
    var name = playerName();
    ensureSocket().then(function () {
      wsSend({ t: "create", mode: mode, name: name });
      setTimeout(function () { app.busy = false; }, 500);
    }).catch(function (error) {
      app.busy = false;
      toast(error.message || "Sunucuya bağlanılamadı.");
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
      toast(error.message || "Sunucuya bağlanılamadı.");
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
        startLocal(button.dataset.local === "coop" ? "coop" : "versus");
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
        clearPreview();
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
    startLocal(app.state.mode);
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
