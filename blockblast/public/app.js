/* Blokara 1v1 — arayüz ve oturumlar */
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
  var LS_GOOGLE = "blokiki.google";
  var LS_FRIEND_CODE = "blokara.friendCode";
  var LS_FRIENDS = "blokara.friends";
  var LS_ADS_FREE = "blokara.adsFree";
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
    /* Sürükleme sürerken gelen durum güncellemeleri çizimi bekletir;
       parmak kalkınca tek seferde uygulanır (rakip hamlesi taşı düşürmesin). */
    dirty: false,
    rendering: false,
    sound: true,
    audio: null,
    toastTimer: null,
    overlayClosable: true,
    busy: false,
    profile: null,
    timeMode: "shared",
    matching: false,
    clockTimer: null,
    lastClockAt: 0,
    onlineAt: 0,
    lastSignature: "",
    recordedKey: null,
    lastReward: null,
    lastClockWhole: -1,
    soundOn: true,
    vibrate: true,
    lastServerAt: 0,
    backgrounded: false,
    friendCode: "",
    friends: [],
    friendLookup: {},
    pendingFriendAdd: "",
    pendingInvite: null,
    friendsTimer: null,
    friendLookupSeq: 0,
    inviteAfterCreate: "",
    interstitialPending: false,
    daily: false,
    overlayReturnFocus: null
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
    if (app.daily) return "Günün tahtası";
    if (mode === "coop") return "Ortak tahta";
    if (mode === "solo") return "Tek kişilik";
    return "Rakip";
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

  function clampPan(value) {
    return Math.max(-1, Math.min(1, Number(value) || 0));
  }

  /* Tek nota. options: type, volume, slide (Hz cinsinden bağıl kayma),
     to (mutlak hedef frekans), pan (-1 sol … 1 sağ), attack (saniye),
     delay (saniye, sesi ileri planlar). */
  function tone(freq, duration, options) {
    if (!app.sound) return;
    var ctx = audio();
    if (!ctx) return;
    options = options || {};
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    var now = ctx.currentTime + (options.delay || 0);
    var attack = options.attack == null ? 0.012 : Math.max(0.004, options.attack);
    osc.type = options.type || "triangle";
    osc.frequency.setValueAtTime(freq, now);
    if (options.to) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, options.to), now + duration);
    } else if (options.slide) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + options.slide), now + duration);
    }
    var volume = options.volume == null ? 0.06 : options.volume;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    var out = gain;
    if (options.pan != null && ctx.createStereoPanner) {
      var panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(clampPan(options.pan), now);
      if (options.panTo != null) {
        panner.pan.linearRampToValueAtTime(clampPan(options.panTo), now + duration);
      }
      gain.connect(panner);
      out = panner;
    }
    out.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  /* Kısa gürültü patlaması: patlamaya gövde ve "moloz" hissi verir. */
  function noiseBurst(duration, volume, cutoff) {
    if (!app.sound) return;
    var ctx = audio();
    if (!ctx) return;
    var length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    var buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < length; i++) {
      var t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2);
    }
    var source = ctx.createBufferSource();
    source.buffer = buffer;
    var filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(cutoff || 1400, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(160, ctx.currentTime + duration);
    var gain = ctx.createGain();
    var now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume || 0.05, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  /* Süzgeçli gürültü "vınlaması". Satır patlamasında soldan sağa, sütun
     patlamasında yukarıdan aşağı akan bir doku verir. */
  function noiseSweep(duration, volume, fromHz, toHz, panFrom, panTo, delay) {
    if (!app.sound) return;
    var ctx = audio();
    if (!ctx) return;
    var length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    var buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < length; i++) {
      var t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 1.5);
    }
    var source = ctx.createBufferSource();
    source.buffer = buffer;
    var filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 1.2;
    var now = ctx.currentTime + (delay || 0);
    filter.frequency.setValueAtTime(Math.max(80, fromHz), now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, toHz), now + duration);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + duration * 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    var out = gain;
    if (ctx.createStereoPanner) {
      var panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(clampPan(panFrom), now);
      panner.pan.linearRampToValueAtTime(clampPan(panTo), now + duration);
      gain.connect(panner);
      out = panner;
    }
    out.connect(ctx.destination);
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  function sfxPlace() { tone(240, 0.08, { type: "square", slide: -70, volume: 0.035 }); }
  /* Puan kazanınca kısa, yükselen bir çınlama. Puan arttıkça tizleşir;
     böylece her hamlenin karşılığı duyulur. */
  function sfxPoints(points, combo, lines) {
    var base = 587.33;
    var step = Math.min(6, Math.floor((points || 0) / 25));
    var freq = base * Math.pow(2, step / 12) * (combo > 1 ? 1.06 : 1);
    var volume = lines > 0 ? 0.032 : 0.05;
    tone(freq, 0.09, { type: "triangle", volume: volume });
    setTimeout(function () {
      tone(freq * 1.335, 0.13, { type: "sine", volume: volume * 0.9 });
    }, 55);
  }
  function sfxPurchase() {
    [659.25, 880, 1174.66].forEach(function (freq, index) {
      setTimeout(function () { tone(freq, 0.16, { type: "triangle", volume: 0.055 }); }, index * 90);
    });
  }
  /* --- Satır (yatay) patlaması: soldan sağa akan parlak bir "şşşt" ve
     dört notalı yükselen çınlama. Çizgi sayısı arttıkça nota eklenir. --- */
  function sfxRowClear(count) {
    var n = Math.max(1, Math.min(4, count || 1));
    noiseSweep(0.24, 0.07, 720, 5400, -0.9, 0.9);
    var notes = [659.25, 830.61, 987.77, 1318.51];
    for (var i = 0; i < n; i++) {
      (function (index) {
        var pan = -0.6 + index * 0.4;
        setTimeout(function () {
          tone(notes[index], 0.15, { type: "triangle", volume: 0.055, pan: pan });
          tone(notes[index] * 2, 0.09, { type: "sine", volume: 0.018, pan: pan });
        }, index * 42);
      })(i);
    }
  }

  /* --- Sütun (dikey) patlaması: yukarıdan aşağı inen tok bir vuruş,
     derin bas ve alçalan çan sesleri. Satırdan belirgin biçimde farklı. --- */
  function sfxColClear(count) {
    var n = Math.max(1, Math.min(4, count || 1));
    noiseSweep(0.22, 0.06, 3400, 480, 0.15, -0.15);
    tone(104, 0.2, { type: "sine", to: 76, volume: 0.11 });
    tone(156, 0.16, { type: "triangle", to: 108, volume: 0.05 });
    var notes = [987.77, 830.61, 659.25, 523.25];
    for (var i = 0; i < n; i++) {
      (function (index) {
        setTimeout(function () {
          tone(notes[index], 0.18, { type: "sine", volume: 0.05, pan: 0.2 - index * 0.12 });
          tone(notes[index] * 0.5, 0.22, { type: "triangle", volume: 0.025 });
        }, 60 + index * 55);
      })(i);
    }
  }

  /* --- Satır + sütun aynı anda (PERFECT): iki ses üst üste + altın vuruş. --- */
  function sfxCrossClear(count) {
    noiseSweep(0.38, 0.085, 620, 6200, -0.85, 0.85);
    sfxRowClear(Math.min(4, (count || 2) - 1));
    sfxColClear(Math.min(4, (count || 2) - 1));
    tone(65, 0.42, { type: "sine", to: 48, volume: 0.17 });
    [1046.5, 1318.51, 1567.98, 2093].forEach(function (freq, index) {
      setTimeout(function () {
        tone(freq, 0.3, { type: "sine", volume: 0.035, pan: -0.5 + index * 0.33 });
      }, 90 + index * 55);
    });
  }

  /* Eski çağrılar için güvenli geri dönüş: yön bilinmiyorsa satır sesi. */
  function sfxClear(lines) { sfxRowClear(lines); }

  /* Kalın, tok vuruş: patlamanın gövdesini duyurur. */
  function sfxBass(lines, cross) {
    var power = cross ? 1.3 : (lines >= 3 ? 1.2 : 1);
    noiseBurst(cross ? 0.34 : 0.24, 0.07 * power, cross ? 1900 : 1300);
    tone(96, 0.2, { type: "sine", slide: -34, volume: 0.13 * power });
    tone(58, 0.32, { type: "triangle", slide: -16, volume: 0.15 * power });
    setTimeout(function () {
      tone(72, 0.18, { type: "sine", slide: -24, volume: 0.09 * power });
    }, 45);
    if (cross) {
      setTimeout(function () {
        tone(130, 0.26, { type: "triangle", slide: -60, volume: 0.1 });
        tone(65, 0.36, { type: "sine", slide: -20, volume: 0.13 });
        noiseBurst(0.28, 0.055, 2200);
      }, 110);
    }
  }
  function sfxStart() {
    tone(392, 0.1, { volume: 0.05 });
    setTimeout(function () { tone(523.25, 0.14, { volume: 0.05 }); }, 100);
  }
  function sfxLose() {
    /* Kısa, alçalan bir "hayal kırıklığı" motifi ve tok bir kapanış. */
    [392, 349.23, 293.66, 220].forEach(function (freq, index) {
      setTimeout(function () {
        tone(freq, 0.24, { type: "triangle", slide: -18, volume: 0.05 });
      }, index * 130);
    });
    setTimeout(function () {
      tone(110, 0.5, { type: "sine", slide: -40, volume: 0.12 });
      tone(55, 0.55, { type: "triangle", slide: -12, volume: 0.1 });
      noiseBurst(0.32, 0.035, 700);
    }, 480);
  }
  function sfxWin() {
    /* Zafer: yükselen fanfar, altında büyüyen bas, ardından geniş bir
       majör akor ve tiz kıvılcımlar. Kısa bir yankı katmanı sahneyi
       büyütür; hepsi WebAudio ile üretilir (dosya yok). */
    var arp = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98];
    arp.forEach(function (freq, index) {
      setTimeout(function () {
        tone(freq, 0.22, { type: "triangle", volume: 0.058, attack: 0.006 });
        tone(freq * 2, 0.14, { type: "sine", volume: 0.02 });
        tone(freq * 1.5, 0.16, { type: "sine", volume: 0.016, pan: index % 2 ? 0.4 : -0.4 });
      }, index * 82);
    });

    /* Altında yükselen bas: fanfara ağırlık katar. */
    tone(130.81, 0.7, { type: "triangle", to: 196, volume: 0.07, attack: 0.05 });
    setTimeout(function () {
      tone(196, 0.5, { type: "sine", to: 261.63, volume: 0.05, attack: 0.05 });
    }, 210);

    /* Final akoru: kök + üçlü + beşli + oktav, hafif detune ile geniş. */
    setTimeout(function () {
      [261.63, 329.63, 392, 523.25].forEach(function (freq, index) {
        tone(freq, 0.9, { type: "triangle", volume: 0.036, attack: 0.04, pan: -0.3 + index * 0.2 });
        tone(freq * 1.003, 0.9, { type: "sine", volume: 0.018, attack: 0.05 });
      });
      tone(1046.5, 0.55, { type: "sine", volume: 0.028 });
      tone(2093, 0.42, { type: "sine", volume: 0.018 });
    }, 540);

    /* Tiz kıvılcım yağmuru: yukarı doğru kayan parlak notalar. */
    [1567.98, 1975.53, 2349.32, 2637.02].forEach(function (freq, index) {
      setTimeout(function () {
        tone(freq, 0.18, { type: "sine", volume: 0.018, pan: -0.6 + index * 0.4 });
      }, 760 + index * 70);
    });

    /* Kısa yankı: aynı akoru daha kısık ve gecikmeli tekrar eder. */
    setTimeout(function () {
      [523.25, 659.25, 783.99].forEach(function (freq) {
        tone(freq, 0.5, { type: "sine", volume: 0.012 });
      });
    }, 1040);
    setTimeout(function () {
      [523.25, 783.99].forEach(function (freq) {
        tone(freq, 0.4, { type: "sine", volume: 0.006 });
      });
    }, 1320);
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

  /* Kalın ve tok bir sesle "Perfect" / "Great" anonsu. Tarayıcı ses
     sentezini desteklemiyorsa sessizce yok sayılır. */
  function speakGrade(grade) {
    if (!app.sound || !window.speechSynthesis) return;
    try {
      var text = String(grade || "").replace(/[!.]/g, "").trim();
      if (!text) return;
      var utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.pitch = 0.25;
      utterance.rate = 0.9;
      utterance.volume = 0.85;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch (error) { /* ses sentezi yoksa yoksay */ }
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
    initGoogleAccount();
    initNativeIntegrations();
    buildHeroBoard();
    bindStaticEvents();
    bindLifecycle();
    renderHomeMeta();
    registerServiceWorker();
    prepareSharedLink();
    attemptSessionRejoin();
    exposeDebug();

    bindPlayTabs();
    window.scrollTo(0, 0);
  }

  /* Yalnızca ?test=1 ile açılır; otomatik testler durumu sürebilsin diye. */
  function exposeDebug() {
    if (!/[?&]test=1/.test(location.search)) return;
    window.BlokDebug = {
      start: startLocal,
      friendCode: friendCode,
      setFriendCode: setFriendCode,
      game: function () { return app.game; },
      send: function (message) {
        if (app.ws && app.ws.readyState === WebSocket.OPEN) app.ws.send(JSON.stringify(message));
        return !!app.ws;
      },
      snapshot: function () { return app.state; },
      /* Yalnızca testlerde: tahtaya dikdörtgen doldurup yeniden çizer. */
      fillRegion: function (row, col, height, width, color) {
        var s = app.state;
        var g = app.game;
        if (!s || !g) return null;
        var board = s.mode === "coop" ? g.shared.board : g.players[0].board;
        for (var r = row; r < row + height; r++) {
          for (var c = col; c < col + width; c++) {
            if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) board[r][c] = color || "mint";
          }
        }
        app.state = g.snapshot();
        renderGame();
        return app.state;
      },
      fillRow: function (row, color) {
        return this.fillRegion(row, 0, 1, SIZE, color);
      },
      drag: function () {
        var d = app.drag;
        if (!d) return null;
        return {
          lift: d.lift, grabR: d.grabR, grabC: d.grabC,
          h: d.piece ? d.piece.h : null, w: d.piece ? d.piece.w : null,
          size: d.piece ? d.piece.cells.length : null,
          stepY: d.geo ? d.geo.stepY : null, cellH: d.geo ? d.geo.h : null,
          stepX: d.geo ? d.geo.stepX : null, cellW: d.geo ? d.geo.w : null,
          geoX: d.geo ? d.geo.x : null, geoY: d.geo ? d.geo.y : null,
          target: d.target, moved: d.moved,
          ghostTop: d.ghost ? d.ghost.style.transform : null,
          ghostMoves: d.ghostMoves || 0, ghostAt: d.ghostAt || null,
          hasGhost: !!d.ghost, ghostInDom: !!(d.ghost && d.ghost.parentNode),
          queued: !!d.queued, frame: !!d.frame
        };
      },
      status: function () {
        return {
          online: app.online,
          room: app.room,
          me: app.me,
          ws: app.ws ? app.ws.readyState : null,
          screen: app.screen,
          phase: app.state ? app.state.phase : null,
          players: app.state ? app.state.players.map(function (p) {
            return p.name + ":" + (p.connected ? "on" : "off");
          }) : []
        };
      },
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
      },
      /* Sesleri tek tek çalmak için (testte sessiz/bozuk ses yakalanır). */
      sfx: {
        place: sfxPlace, points: sfxPoints, row: sfxRowClear, col: sfxColClear,
        cross: sfxCrossClear, win: sfxWin, lose: sfxLose, reward: sfxReward
      },
      resetAudio: function () { app.audio = null; return true; }
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
    updatePurchaseStrip();
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

    renderAchievements();
    syncSetupButtons();
    updateMatchButton();
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
  }

  /* Arkadaşınla oyna panelindeki üç yol arasında geçiş.
     Katlanan menü yok; seçim doğrudan yapılır. */
  function selectPlayPane(pane) {
    var name = pane === "join" ? "join" : (pane === "match" ? "match" : "create");
    $$(".play-tab").forEach(function (tab) {
      var active = tab.dataset.pane === name;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.tabIndex = active ? 0 : -1;
    });
    $$(".play-pane").forEach(function (panel) {
      panel.hidden = panel.id !== "pane-" + name;
    });
    app.playPane = name;
    if (name === "join") {
      var code = $("#join-code");
      if (code) setTimeout(function () { code.focus(); }, 30);
    }
    return name;
  }

  function bindPlayTabs() {
    var tabs = $$(".play-tab");
    if (!tabs.length) return;
    tabs.forEach(function (tab, index) {
      tab.addEventListener("click", function () {
        audio();
        selectPlayPane(tab.dataset.pane);
      });
      tab.addEventListener("keydown", function (event) {
        var step = event.key === "ArrowRight" ? 1
          : (event.key === "ArrowLeft" ? -1
            : (event.key === "Home" ? -index
              : (event.key === "End" ? tabs.length - 1 - index : 0)));
        if (!step) return;
        event.preventDefault();
        var next = tabs[(index + step + tabs.length) % tabs.length];
        selectPlayPane(next.dataset.pane);
        next.focus();
      });
    });
    selectPlayPane(app.playPane || "create");
  }

  /* APK'da sayfa file:// üzerinden açılır; sunucu adresi derlemeye gömülür. */
  function initServerField() {
    /* Sunucu adresi arayüzde sorulmuyor; ayar dosyasından/derlemeden gelir.
       Adres gömülü değilse arkadaşla oyun bölümünü kapatıp nedenini yazarız. */
    if (location.protocol !== "file:" || serverBase()) return;
    var card = $("#online-card");
    if (!card) return;
    card.classList.add("offline-only");
    $$("button, input", card).forEach(function (el) {
      el.disabled = true;
    });
    var note = document.createElement("p");
    note.className = "online-note";
    note.textContent = "Bu kurulumda sunucu adresi tanımlı değil. " +
      "Tek başına ya da aynı cihazda iki kişi oynamak sorunsuz çalışır.";
    card.insertBefore(note, card.firstChild);
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

  /* Oyun sırasında ekran kararmasın (Android köprüsü varsa). */
  function setKeepAwake(on) {
    var bridge = window.BlokIkiServer;
    if (!bridge || typeof bridge.keepAwake !== "function") return;
    try { bridge.keepAwake(!!on); } catch (error) { /* yoksay */ }
  }

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
    setKeepAwake(name === "game");
    if (name === "game") {
      app.lastAnimated = -1;
      startClock();
    } else {
      stopClock();
      if (name === "home") renderHomeMeta();
    }
    syncBannerVisibility();
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
    var daily = mode === "daily";
    var solo = mode === "solo" || daily;
    if (daily && PROGRESS && app.profile && !PROGRESS.dailyReady(app.profile)) {
      toast("Bugünün tahtasını oynadın. Tekrar denemek seriyi etkilemez.");
    }
    app.daily = daily;
    app.timeMode = solo ? "none"
      : (CORE.TIME_MODES.indexOf(options.timeMode) >= 0 ? options.timeMode : (app.timeMode || "shared"));
    var names = solo ? ["Sen"] : ["Oyuncu 1", "Oyuncu 2"];
    app.game = new CORE.Game({
      mode: solo ? "solo" : (mode === "coop" ? "coop" : "versus"),
      names: names,
      /* Günün tahtası: herkes aynı tohumla aynı blok dizisini oynar. */
      seed: daily && PROGRESS ? PROGRESS.dailySeed() : options.seed,
      turnBased: true,
      timeMode: app.timeMode
    });
    app.state = app.game.snapshot();
    app.lastSignature = stateSignature(app.state);
    app.dirty = false;
    app.onlineAt = 0;
    showScreen("game");
    renderGame();
    startClock();
    sfxStart();
    checkResult();
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
    /* Yerel oyunda menü açıkken ya da uygulama arkadayken sayaç işlemez.
       Çevrimiçi oyunda süre sunucuda işlediği için durdurulmaz. */
    if (localPaused()) return;

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

  function actorIndex() {
    var s = app.state;
    if (!s) return 0;
    if (!s.turnBased) return app.online ? app.me : 0;
    return s.turn;
  }

  /* İki insan aynı cihazda oynarken tahta sırayla döner. Tek kişilikte
     her zaman tek tahta vardır. */
  function displayIndex() {
    var s = app.state;
    if (!s) return 0;
    if (app.online) return app.me;
    if (s.mode === "solo") return 0;
    return s.turn;
  }

  function activePlayerIndex() {
    var s = app.state;
    if (!s) return 0;
    if (s.mode === "coop") return s.turn;
    return s.turnBased ? s.turn : (app.online ? app.me : 0);
  }

  /* Hamle yapılabilir mi? */
  function canAct() {
    var s = app.state;
    if (!s || s.phase !== "playing" || app.pending) return false;
    if (!app.online) return true;
    if (s.mode === "coop") return s.turn === app.me;
    return !!s.players[app.me] && s.players[app.me].alive;
  }

  function canPlay() {
    return canAct();
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

  function ensureSocket(options) {
    var quiet = !!(options && options.quiet);
    return new Promise(function (resolve, reject) {
      if (app.ws && app.ws.readyState === WebSocket.OPEN) return resolve(app.ws);
      if (navigator.onLine === false) {
        return reject(new Error("İnternet bağlantısı yok. Bağlanınca tekrar dene."));
      }
      if (location.protocol === "file:" && !serverBase()) {
        return reject(new Error("Bu sürümde sunucu adresi tanımlı değil."));
      }
      var socket;
      try {
        socket = new WebSocket(wsUrl());
      } catch (error) {
        return reject(new Error("Sunucuya bağlanılamadı."));
      }
      app.ws = socket;
      var settled = false;
      /* Ücretsiz sunucular boşta uykuya geçer; ilk bağlantı 40-60 sn sürebilir. */
      var slowToast = setTimeout(function () {
        if (!settled && !quiet) toast("Sunucu uyanıyor, birkaç saniye sürer…");
      }, 4000);
      var timer = setTimeout(function () {
        if (!settled) {
          settled = true;
          clearTimeout(slowToast);
          try { socket.close(); } catch (error) { /* yoksay */ }
          reject(new Error("Sunucu yanıt vermedi."));
        }
      }, 45000);

      socket.addEventListener("open", function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(slowToast);
        app.reconnectAttempts = 0;
        resolve(socket);
        syncPresence();
      });

      socket.addEventListener("message", handleSocketMessage);

      socket.addEventListener("close", function () {
        clearTimeout(timer);
        clearTimeout(slowToast);
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
          clearTimeout(slowToast);
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
    app.lastServerAt = Date.now();
    var message;
    try { message = JSON.parse(event.data); } catch (error) { return; }
    if (!message || !message.t) return;

    if (message.t === "welcome") {
      app.online = true;
      app.matching = false;
      updateMatchButton();
      app.me = message.you;
      app.room = message.code;
      app.intentionalClose = false;
      app.reconnectAttempts = 0;
      app.pending = false;
      saveSession(message.code, message.token);
      startHeartbeat();
      applyState(message.state);
      syncPresence();
      if (app.inviteAfterCreate) {
        var inviteTo = app.inviteAfterCreate;
        app.inviteAfterCreate = null;
        wsSend({ t: "invite", to: inviteTo, code: app.room });
        toast("Oda kuruldu, davet gönderildi.");
      }
      return;
    }

    if (message.t === "presence") {
      if (!message.ok) toast("Arkadaş kodu kaydedilemedi.");
      return;
    }

    if (message.t === "lookup") {
      var lookedUp = findFriend(message.code);
      if (lookedUp) {
        if (message.name) lookedUp.name = String(message.name).slice(0, 16);
        lookedUp.online = !!message.online;
        saveFriends();
      }
      renderFriendsSheet();
      return;
    }

    if (message.t === "invited") {
      toast(message.ok
        ? (message.name ? message.name + " davet edildi." : "Davet gönderildi.")
        : (message.message || "Davet gönderilemedi."));
      return;
    }

    if (message.t === "invite") {
      showInviteBanner(message);
      return;
    }

    if (message.t === "state") {
      app.pending = false;
      app.matching = false;
      updateMatchButton();
      applyState(message.state);
      return;
    }

    if (message.t === "queued") {
      app.matching = true;
      updateMatchButton();
      return;
    }

    if (message.t === "matchcancel") {
      app.matching = false;
      updateMatchButton();
      return;
    }

    if (message.t === "error") {
      app.pending = false;
      app.matching = false;
      updateMatchButton();
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
    app.lastServerAt = Date.now();
    app.heartbeat = setInterval(function () {
      if (!app.ws || app.ws.readyState !== WebSocket.OPEN) return;
      /* Sessizce ölmüş bağlantı (tünel/uyku) fark edilmeden kalmasın. */
      if (Date.now() - app.lastServerAt > 30000) {
        try { app.ws.close(); } catch (error) { /* yoksay */ }
        return;
      }
      wsSend({ t: "ping" });
    }, 10000);
  }

  function handleSocketClose() {
    if (app.heartbeat) {
      clearInterval(app.heartbeat);
      app.heartbeat = null;
    }
    app.pending = false;
    if (app.matching) {
      app.matching = false;
      updateMatchButton();
      toast("Eşleşme bağlantısı koptu. Tekrar dene.");
    }
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
    /* Uygulama yeniden açıldığında sadece taze oturumu kendiliğinden dene;
       eski oda kayıtları arka planda sessizce temizlenir. */
    if (Date.now() - (session.at || 0) > 3 * 60 * 1000) {
      clearSession(session.code);
      return;
    }
    ensureSocket({ quiet: true }).then(function () {
      wsSend({ t: "rejoin", code: session.code, token: session.token });
    }).catch(function () {
      /* Çevrimdışıysak oturumu silme; internet gelince tekrar denenebilir. */
      if (navigator.onLine !== false) clearSession(session.code);
    });
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
    app.matching = false;
    updateMatchButton();
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
    if (typeof selectPlayPane === "function") selectPlayPane("join");
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
        return [p.score, p.alive ? 1 : 0, p.connected ? 1 : 0, p.penalties || 0,
          traySignature(p.tray), boardSignature(p.board)].join(":");
      }).join("|"),
      state.shared ? state.shared.score + ":" + state.shared.combo + ":" +
        traySignature(state.shared.tray) : ""
    ].join("~");
  }

  /* Tepsideki parçaların kimliği; elle değişen bir tepsi de yeniden çizilsin. */
  function traySignature(tray) {
    if (!tray) return "-";
    return tray.map(function (piece) { return piece ? piece.name : "."; }).join(",");
  }

  /* Rakip tahtasındaki değişimi (rakip hamlesi, çöp satır) yakalar. */
  function boardSignature(board) {
    if (!board) return "-";
    return board.map(function (row) {
      return row.map(function (cell) { return cell ? String(cell).charAt(0) : "."; }).join("");
    }).join("");
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

    var signature = stateSignature(state);
    if (signature === app.lastSignature && app.screen === "game") {
      updateClock();
      updateHint();
      return;
    }
    app.lastSignature = signature;
    app.recordedKey = null;
    /* Parmak ekrandayken gelen güncelleme (rakip hamlesi ya da çöp satır)
       eldeki taşı düşürmesin: yeni durumu parmak kalkınca çiz. */
    if (app.drag) {
      app.dirty = true;
      updateClock();
      updateHint();
      return;
    }
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
        win: false
      };
    }
    var human = app.online ? app.me : 0;
    var player = s.players[human] || s.players[0];
    var solo = s.mode === "solo";
    if (app.daily) {
      return {
        mode: "daily",
        score: player.score,
        lines: player.lines,
        blocks: player.blocks,
        combo: player.combo,
        win: false
      };
    }
    return {
      mode: solo ? "solo" : "versus",
      score: player.score,
      lines: player.lines,
      blocks: player.blocks,
      combo: player.combo,
      win: !solo && s.winner === human
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
    } else if (s.mode === "solo") {
      top = s.phase === "over" ? "tur bitti" : "tek kişilik";
      main = s.phase === "over" ? "skor" : "sen";
      cls = s.phase === "over" ? "over" : "";
    } else if (s.phase === "over") {
      var tied = s.winner == null || !s.players[s.winner];
      top = tied ? "berabere" : "kazanan";
      main = tied
        ? s.players.map(function (p) { return p.score; }).join(" - ")
        : s.players[s.winner].name;
      cls = "over";
    } else if (app.online) {
      top = "canlı";
      main = "ikisi de";
      cls = "live";
    } else {
      top = "sıra";
      main = s.players[s.turn] ? s.players[s.turn].name : "—";
    }
    return '<div class="turn-pill ' + cls + '"><span class="tp-top">' + top + '</span><span class="tp-main">' + esc(main) + '</span>' + timeHTML(s) + '</div>';
  }

  function renderScoreboard() {
    var s = app.state;
    var board = $("#scoreboard");
    var solo = s.mode === "solo";
    board.classList.toggle("solo", solo);
    board.innerHTML = solo
      ? (scoreCardHTML(0, s) + turnPillHTML(s))
      : (scoreCardHTML(0, s) + turnPillHTML(s) + scoreCardHTML(1, s));
  }

  /* ------------------------------------------------------------------ */
  /* render: tahta / tray                                                */
  /* ------------------------------------------------------------------ */

  function boardHTML(board, id, owner, label, extraClass) {
    var html = '<div class="board-shell' + (extraClass ? " " + extraClass : "") + '">';
    if (label) {
      html += '<div class="board-label">' + label + '</div>';
    }
    html += '<div class="board' + (extraClass ? " " + extraClass : "") + '" id="' + id + '" data-board="' + owner + '" role="grid" aria-label="8 çarpı 8 oyun tahtası">';
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
    return '<div class="tray" id="tray" aria-label="Blok seçimi">' +
      trayPiecesHTML(tray, interactive, dim) + "</div>";
  }

  function trayPiecesHTML(tray, interactive, dim) {
    var html = "";
    for (var i = 0; i < tray.length; i++) {
      html += pieceHTML(tray[i], i, interactive, dim);
    }
    return html;
  }

  /* Tepsi yalnızca içeriği değiştiğinde yeniden kurulur. */
  function syncTray(trayEl, tray, interactive) {
    if (!trayEl) return;
    var sig = traySignature(tray) + "|" + (interactive ? 1 : 0) + "|" + app.selected;
    if (trayEl.dataset.sig === sig) return;
    trayEl.innerHTML = trayPiecesHTML(tray, interactive);
    trayEl.dataset.sig = sig;
  }

  /* Tahta hücrelerini yerinde boyar; 64 hücreyi her hamlede yeniden
     oluşturmak yerine sadece rengi değişenlere dokunur. */
  function paintBoard(boardEl, board) {
    if (!boardEl || !board) return;
    var cells = boardEl.children;
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var cell = cells[r * SIZE + c];
        if (!cell) continue;
        var color = board[r][c];
        var want = "cell" + (color ? " on " + colorClass(color) : "");
        if (cell.className !== want) cell.className = want;
      }
    }
  }

  /* Aynı düzen korunurken yalnızca değişenleri tazeler. */
  function syncGameLayout(s, layout, interactive) {
    if (s.mode === "coop") {
      paintBoard($("#board-shared"), s.shared.board);
      var note = $("#turn-note");
      if (note) {
        note.innerHTML = s.phase === "over" ? '<span class="dot"></span>Tur bitti'
          : '<span class="dot"></span>Sıra: <b>' +
            esc(s.players[s.turn] ? s.players[s.turn].name : "—") + '</b>' +
            (s.shared.combo > 1 ? ' · combo ×' + s.shared.combo : "");
      }
      syncTray($("#tray"), s.shared.tray, interactive);
      return;
    }
    if (layout.indexOf("online-") === 0) {
      var me = s.players[app.me];
      var rival = s.players[1 - app.me];
      paintBoard($("#board-me"), me.board);
      if (rival) paintBoard($("#board-rival"), rival.board);
      var onlineNote = $("#turn-note");
      if (onlineNote) {
        onlineNote.innerHTML = s.phase === "over" ? '<span class="dot"></span>Tur bitti'
          : '<span class="dot"></span>İkiniz de aynı anda oynuyorsunuz' +
            (me.combo > 1 ? ' · combo ×' + me.combo : "");
      }
      syncTray($("#tray"), me.tray, interactive);
      var peerStats = $(".peer-stats");
      if (peerStats && rival) {
        peerStats.innerHTML = '<b>' + fmt(rival.score) + '</b> puan<span>' + rival.lines + ' satır</span>';
      }
      return;
    }
    var activeIndex = displayIndex();
    var activePlayer = s.players[activeIndex];
    if (activePlayer) {
      paintBoard($("#board-" + activeIndex), activePlayer.board);
      syncTray($("#tray"), activePlayer.tray, interactive);
    }
  }

  function renderGame() {
    var s = app.state;
    if (!s) return;
    if (s.turn !== app.lastTurn) {
      app.lastTurn = s.turn;
      app.selected = null;
      app.cursor = null;
    }
    app.rendering = true;
    cancelDrag();
    app.rendering = false;
    hidePreview();
    renderScoreboard();
    var table = $("#table-area");
    var interactive = canPlay();
    var layout = s.mode === "coop"
      ? "coop"
      : (app.online ? "online-" + app.me
        : "local-" + displayIndex() + "-" + (s.mode === "solo" ? "solo" : "versus"));
    var html = "";

    if (s.mode === "coop") {
      var shared = s.shared;
      var turnPlayer = s.players[s.turn];
      html += boardHTML(shared.board, "board-shared", "shared", 'Ortak tahta <span class="you">paylaşımlı</span>');
      html += '<div class="tray-wrap">';
      html += '<div class="turn-note" id="turn-note">' +
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
      var statusText = s.phase === "over" ? "tur bitti"
        : (s.mode === "solo" ? "tek kişilik" : "sıra sende");
      html += '<div class="vs-local">';
      html += boardHTML(
        activePlayer.board,
        "board-" + activeIndex,
        "active",
        '<span class="score-dot" style="background:' + activeColor + '"></span>' +
        esc(activePlayer.name) + ' <span class="you">' + statusText + '</span>'
      );
      html += '<div class="tray-wrap">';
      html += trayHTML(activePlayer ? activePlayer.tray : [], interactive);
      html += '</div>';
      html += '</div>';
    } else {
      var me = s.players[app.me];
      var rivalIndex = 1 - app.me;
      var rival = s.players[rivalIndex];
      html += '<div class="online-versus">';
      html += '<div class="versus-main">';
      html += boardHTML(me.board, "board-me", String(app.me), 'Senin tahtan <span class="you">sen</span>');
      html += '<div class="tray-wrap">';
      html += '<div class="turn-note" id="turn-note">' +
        (s.phase === "over" ? '<span class="dot"></span>Tur bitti' :
          '<span class="dot"></span>İkiniz de aynı anda oynuyorsunuz' +
          (me.combo > 1 ? ' · combo ×' + me.combo : "")) +
        '</div>';
      html += trayHTML(me.tray, interactive);
      html += '</div>';
      html += '</div>';
      if (rival) {
        html += '<aside class="peer-panel" aria-label="Rakip tahtası">';
        html += '<div class="peer-head"><span class="score-dot"></span><span>' + esc(rival.name) + '</span></div>';
        html += boardHTML(rival.board, "board-rival", String(rivalIndex), "", "peer readonly");
        html += '<div class="peer-stats"><b>' + fmt(rival.score) + '</b> puan<span>' +
          rival.lines + ' satır</span></div>';
        html += '</aside>';
      }
      html += '</div>';
    }

    if (table.dataset.layout !== layout) {
      table.dataset.layout = layout;
      table.innerHTML = html;
      bindGameEvents();
    } else {
      syncGameLayout(s, layout, interactive);
    }
    updateHint();
    animateLastMove();
    updateClock();
    updateRoomChrome();
  }

  /* Oyun sonu açıklamasını, kazanan sensen ikinci kişiye çevirir:
     "Ada kazandı" yerine "Kazandın". */
  function personalReason(s) {
    var reason = String((s && s.reason) || "");
    if (!reason || !s || s.mode !== "versus" || s.winner == null) return reason;
    var human = app.online ? app.me : 0;
    if (s.winner !== human) return reason;
    var player = s.players && s.players[human];
    var name = player ? String(player.name || "") : "";
    if (!name) return reason;
    var text = reason.split(name + " kazandı").join("Kazandın");
    if (text === reason && name === "Sen") text = reason.split("Sen kazandı").join("Kazandın");
    if (text !== reason && !/[.!]$/.test(text)) text += "!";
    return text;
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
      hint.textContent = personalReason(s) || "Tur bitti.";
      return;
    }
    if (s.mode === "solo") {
      hint.textContent = "Tek kişilik · satırları patlat, tahta dolana kadar dayan.";
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
      if (boardEl.classList.contains("readonly")) return;
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
    /* Aynı anda iki parmak: süren sürüklemeyi ikinci parmak ele geçirmesin.
       Bu, aynı cihazda iki kişi oynarken ikinci oyuncunun hamlesini yutuyordu. */
    if (app.drag) return;
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
    /* Bloğun alt kenarı parmağın hep biraz üstünde kalır: parmak bloğu
       kapatmaz. Yükseklik, tutulan hücreye göre hesaplanır. */
    var clearance = event.pointerType === "mouse" ? 0 : Math.max(24, Math.round(geo.stepY * 0.75));
    var lift = event.pointerType === "mouse" ? 0
      : Math.round((piece.h - grabR - 0.5) * geo.stepY + clearance);

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
      /* Parmakla sürüklerken blok parmağın biraz üstünde durur; parmak
         bloğu kapatmaz. Fare için kaldırma gerekmez. */
      lift: lift,
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
    drag.ghostAt = { x: x, y: y, left: left, top: top };
    drag.ghostMoves = (drag.ghostMoves || 0) + 1;
  }

  /* Sürükleme sırasında her harekette hemen güncelle. rAF bazı WebView'larda
     gecikip blok parmağın gerisinde kalıyordu; iş hafif, hedef değişmediyse
     yalnızca bir transform yazılır. */
  function onDragMove(event) {
    var drag = app.drag;
    if (!drag) return;
    if (event.pointerId !== drag.pointerId) return;
    if (event.cancelable) event.preventDefault();
    if (drag.moved && drag.lastX === event.clientX && drag.lastY === event.clientY) return;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    updateDrag(event);
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
    var piece = drag.piece;
    var maxRow = SIZE - piece.h;
    var maxCol = SIZE - piece.w;
    var rawCol = Math.round((event.clientX - (drag.grabC + 0.5) * geo.stepX - geo.x) / geo.stepX);
    var rawRow = Math.round((event.clientY - drag.lift - (drag.grabR + 0.5) * geo.stepY - geo.y) / geo.stepY);
    var inside = event.clientX >= bounds.left - geo.stepX * 1.5 &&
      event.clientX <= bounds.right + geo.stepX * 1.5 &&
      event.clientY >= bounds.top - geo.stepY * 1.5 - drag.lift &&
      event.clientY <= bounds.bottom + geo.stepY * 2;
    if (!inside) {
      hidePreviewVisual();
      drag.target = null;
      if (drag.ghost) drag.ghost.classList.remove("bad");
      return;
    }

    /* Önizleme tahtanın dışına taşmasın: hedefi tahta sınırına yasla. */
    var row = Math.max(0, Math.min(maxRow, rawRow));
    var col = Math.max(0, Math.min(maxCol, rawCol));

    var board = activeBoard();
    if (!board) return;
    var valid = CORE.canPlace(board, piece, row, col);
    var key = row + ":" + col + ":" + (valid ? 1 : 0);
    if (drag.target && drag.target.key === key) return;  // hedef değişmedi: boşuna çizme
    drag.target = { row: row, col: col, valid: valid, key: key };
    if (drag.ghost) drag.ghost.classList.toggle("bad", !valid);
    if (valid) {
      showPreview(piece, row, col, geo);
      markLineHint(drag.boardEl, board, piece, row, col);
    } else {
      /* Dolu ya da taşan yere hedef gösterme: blok yalnızca parmağın
         üstünde kalır, tahtadaki dolu karelerin üzerine binmez. */
      hidePreviewVisual();
      clearLineHint();
    }
  }

  function onDragEnd(event) {
    var drag = app.drag;
    if (drag && event && event.pointerId != null && event.pointerId !== drag.pointerId) return;
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
    window.removeEventListener("pointercancel", onDragEnd);
    if (!drag) return;
    if (drag.ghost && drag.ghost.parentNode) drag.ghost.parentNode.removeChild(drag.ghost);
    hidePreview();
    var target = drag.target;
    app.drag = null;
    flushDirty();
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

  /* Sürükleme sırasında ertelenen durum çizimini şimdi uygula. */
  function flushDirty() {
    if (!app.dirty || app.rendering) return;
    app.dirty = false;
    if (app.screen !== "game") return;
    renderGame();
    if (app.state && app.state.phase === "over") checkResult();
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
    flushDirty();
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

  function showPreview(piece, row, col, geo) {
    var el = app.preview;
    if (!el || app.previewPiece !== piece) {
      if (el) hidePreview();
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
    el.classList.remove("is-hidden");
    el.style.transform = "translate3d(" + (geo.x + col * geo.stepX) + "px," + (geo.y + row * geo.stepY) + "px,0)";
  }

  /* Geçersiz hedefte önizlemeyi silmeden gizleriz; böylece sürüklerken
     her karede DOM kurulmaz ve blok takılmaz. */
  function hidePreviewVisual() {
    if (app.preview) app.preview.classList.add("is-hidden");
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
    if (last.points > 0) sfxPoints(last.points, last.combo || 0, last.lines || 0);
    var owner = s.mode === "coop" ? "shared" : (app.online ? String(last.by) : "active");
    var boardEl = document.querySelector('[data-board="' + owner + '"]');
    /* Aynı cihazdaki iki insan oyununda sıra döndüğü için önceki tahta artık
       çizili değil; tek kişilikte her zaman aynı tahta ekranda. */
    if (boardEl && !app.online && s.mode === "versus" && last.by !== s.turn) boardEl = null;
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
      var cross = (last.rows && last.rows.length) && (last.cols && last.cols.length);
      var grade = cross || last.lines >= 3 ? "PERFECT!"
        : (last.lines === 2 ? "GREAT!" : "GOOD!");
      var gradeClass = cross || last.lines >= 3 ? "perfect"
        : (last.lines === 2 ? "great" : "good");
      var rowsCleared = last.rows ? last.rows.length : 0;
      var colsCleared = last.cols ? last.cols.length : 0;
      /* Yön duyusu: yatay satır, dikey sütun ve ikisi birden ayrı seslerle
         duyurulur; böylece oyuncu neyin patladığını gözü kapalı anlar. */
      if (rowsCleared && colsCleared) sfxCrossClear(rowsCleared + colsCleared);
      else if (colsCleared) sfxColClear(colsCleared);
      else if (rowsCleared) sfxRowClear(rowsCleared);
      else sfxClear(last.lines);
      sfxBass(last.lines, !!cross);
      if (app.vibrate && FX) {
        FX.vibrate(cross ? [22, 30, 22, 30, 34] : (last.lines > 1 ? [18, 35, 18] : 14));
      }
      if (FX) {
        FX.screenShake(cross ? 3 : (last.lines >= 2 ? 2 : 1));
        FX.flash(cross ? "cross" : (last.lines >= 2 ? "great" : "good"));
        FX.pulse($("#scoreboard"));
      }
      if (gradeClass === "perfect" || gradeClass === "great") speakGrade(grade);
      if (FX && boardEl) {
        var rect = boardEl.getBoundingClientRect();
        var pitch = rect.width / SIZE;
        var cells = last.cleared && last.cleared.length ? last.cleared : [];
        var cellColors = last.clearedColors || [];
        /* Patlama merkezden dışa doğru yayılsın: hücrenin merkeze uzaklığı
           gecikmeyi belirler. Böylece satır/sütun bir dalga gibi dağılır. */
        var midRow = (SIZE - 1) / 2;
        var midCol = (SIZE - 1) / 2;
        cells.forEach(function (cell, index) {
          var cx = rect.left + (cell[1] + 0.5) * pitch;
          var cy = rect.top + (cell[0] + 0.5) * pitch;
          var colorName = cellColors[index] || last.piece.color || "coral";
          var distance = Math.sqrt(Math.pow(cell[0] - midRow, 2) + Math.pow(cell[1] - midCol, 2));
          var delay = Math.min(240, distance * 22);
          FX.ghostCell(cx, cy, pitch * 1.02, colorName, delay);
          FX.debris(cx, cy, [colorName, "paper"], cross ? 9 : 6,
            cross ? 1.1 : 0.8, pitch * 0.52, delay / 1000);
          if (Math.random() < 0.35) FX.burst(cx, cy, "mustard", 2, 0.9);
        });
        /* Patlama merkezine (kesişim varsa oraya) geniş şok dalgası. */
        if (last.rows && last.rows.length && last.cols && last.cols.length) {
          var hitX = rect.left + (last.cols[0] + 0.5) * pitch;
          var hitY = rect.top + (last.rows[0] + 0.5) * pitch;
          FX.shockwave(hitX, hitY, "mustard", pitch * 0.4, pitch * 3.2, 0.55);
          FX.shockwave(hitX, hitY, "coral", pitch * 0.2, pitch * 2.2, 0.42);
        } else if (cells.length) {
          var first = cells[0];
          FX.shockwave(rect.left + (first[1] + 0.5) * pitch,
            rect.top + (first[0] + 0.5) * pitch, "paper", pitch * 0.5, pitch * 2.4, 0.45);
        }
        FX.floatText(rect.left + rect.width / 2, rect.top + rect.height * 0.28,
          grade, gradeClass);
        FX.floatText(rect.left + rect.width / 2, rect.top + rect.height * 0.42,
          "+" + last.points, "points");
        if (last.timeBonus) {
          FX.floatText(rect.left + rect.width / 2, rect.top + rect.height * 0.55,
            "+" + last.timeBonus + " sn", "time");
        }
        if (last.combo > 1) {
          FX.floatText(rect.left + rect.width / 2, rect.top + rect.height * 0.67,
            "COMBO ×" + last.combo, "combo");
        }
        if (last.lines >= 2) FX.shake(boardEl);
        if (cross || last.lines >= 3) FX.confetti();
      }
      toast(grade + " +" + last.points + " · " + last.lines + " çizgi" +
        (cross ? " · satır + sütun" : "") +
        (last.combo > 1 ? " · combo ×" + last.combo : ""));
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

  function openOverlay(innerHTML, closable, variant) {
    var overlay = $("#overlay");
    var sheet = $(".sheet", overlay);
    sheet.className = "sheet" + (variant ? " " + variant : "");
    sheet.innerHTML = innerHTML;
    /* iletişim kutusu başlığı aria-labelledby ile eşleşsin */
    var heading = sheet.querySelector("h2");
    if (heading) {
      if (!heading.id) heading.id = "overlay-title";
      sheet.setAttribute("aria-labelledby", heading.id);
    } else {
      sheet.removeAttribute("aria-labelledby");
      sheet.setAttribute("aria-label", "Oyun penceresi");
    }
    overlay.hidden = false;
    app.overlayClosable = closable !== false;
    app.overlayReturnFocus = document.activeElement;
    document.body.style.overflow = "hidden";
    hideToast();
    syncBannerVisibility();
    var first = sheet.querySelector("[data-autofocus]") || sheet.querySelector("button");
    if (first) setTimeout(function () { first.focus(); }, 30);
  }

  function closeOverlay() {
    var overlay = $("#overlay");
    overlay.hidden = true;
    $(".sheet", overlay).innerHTML = "";
    document.body.style.overflow = "";
    /* Pencereyi açan öğeye odağı geri ver: klavye kullanıcısı kaybolmasın. */
    var back = app.overlayReturnFocus;
    app.overlayReturnFocus = null;
    if (back && back.focus && document.contains(back)) {
      try { back.focus(); } catch (error) { /* yoksay */ }
    }
    resumeLocal();
    flushPendingInterstitial();
    syncBannerVisibility();
  }

  function showHelp() {
    openOverlay(
      '<span class="result-badge">Kurallar</span>' +
      '<h2>Blok oyunu</h2>' +
      '<p class="sheet-sub">Her turda üç blok gelir. Blokları 8×8 tahtaya sürükle; satır ya da sütun tamamlanınca patlar. Üç blok bitmeden yenisi gelmez.</p>' +
      '<ul class="help-list">' +
        '<li><b>Tek kişilik</b><span>Kendi tahtanda oynarsın. Tahta tıkanana kadar dayan ve rekorunu yükselt.</span></li>' +
        '<li><b>Ortak tahta</b><span>Tek tahta, tek skor. Sırayla oynarsınız; herkesin katkısı ayrı sayılır. Tahta tıkanınca tur biter.</span></li>' +
        '<li><b>Rakip</b><span>Herkesin kendi tahtası, aynı blok sırası. Tahtası dolan oyuncu kaybeder. İki satır birden patlatırsan rakibin tahtasına çöp satır itersin.</span></li>' +
        '<li><b>Süre</b><span>Ortak sayaçta süre bitince yüksek skor kazanır. Sıra sayacında süre dolarsa −15 puan ceza alır ve sıra geçer. Satır patlatmak süre kazandırır.</span></li>' +
        '<li><b>Combo</b><span>Üst üste satır patlatırsan puan çarpanı yükselir; üçlü patlatma daha çok süre verir.</span></li>' +
        '<li><b>Arkadaşınla</b><span>Oda kurup 5 haneli kodu paylaş ya da <b>Rastgele eşleş</b> ile aynı anda bekleyen biriyle hemen oyna.</span></li>' +
        '<li><b>Klavye</b><span><b>Enter</b> ya da <b>Boşluk</b> ile blok seç; <b>ok tuşlarıyla</b> tahtada gez ve <b>Enter</b> ile bırak. <b>Esc</b> seçimi iptal eder.</span></li>' +
      '</ul>' +
      '<div class="sheet-actions"><button class="btn btn-ink" type="button" data-close data-autofocus>Anladım</button></div>'
    );
  }

  /* Dil seçici: cihaz dili otomatik seçilir; buradaki seçim kalıcıdır. */
  function showLanguageSheet() {
    var i18n = window.BlokI18n;
    if (!i18n) {
      toast("Dil desteği yüklenemedi.");
      return;
    }
    var current = i18n.getLang();
    var manual = false;
    try { manual = !!localStorage.getItem("blokara.lang.manual") && !!localStorage.getItem("blokara.lang"); } catch (error) { manual = false; }
    var html = '<span class="result-badge">Dil</span>' +
      '<h2>Dil seç</h2>' +
      '<p class="sheet-sub">Oyun cihazının dilini otomatik kullanır. Buradan istediğin dili seçebilirsin.</p>' +
      '<div class="lang-grid" role="listbox" aria-label="Diller">' +
      '<button class="lang-pick' + (manual ? "" : " is-active") + '" type="button" role="option"' +
      ' aria-selected="' + (manual ? "false" : "true") + '" data-lang-auto data-autofocus>Otomatik (cihaz dili)</button>';
    i18n.LANGS.forEach(function (item) {
      var active = manual && item.code === current;
      html += '<button class="lang-pick' + (active ? " is-active" : "") + '" type="button" role="option"' +
        ' aria-selected="' + (active ? "true" : "false") + '" data-lang="' + item.code + '"' +
        ' lang="' + item.code + '">' + esc(item.native) + '</button>';
    });
    html += '</div>' +
      '<div class="sheet-actions"><button class="btn btn-ink" type="button" data-close data-autofocus>Kapat</button></div>';
    openOverlay(html, true, "langs");
    var autoBtn = $("[data-lang-auto]", $("#overlay"));
    if (autoBtn) autoBtn.addEventListener("click", function () {
      i18n.auto();
      finishLanguageChange();
    });
    $$("[data-lang]", $("#overlay")).forEach(function (button) {
      button.addEventListener("click", function () {
        i18n.setLang(button.dataset.lang);
        finishLanguageChange();
      });
    });
  }

  /* Dil değişince üretilen dinamik metinleri tazele. */
  function finishLanguageChange() {
    closeOverlay();
    renderHomeMeta();
    updateSoundButton();
    if (app.state && app.screen === "game") renderGame();
  }

  function timeModeLabel(mode) {
    if (mode === "none") return "Süresiz";
    if (mode === "turn") return "Sıra süresi";
    return "Ortak süre";
  }

  function showResult(reward) {
    var s = app.state;
    if (!s) return;
    refreshAdsState();
    var coop = s.mode === "coop";
    var solo = s.mode === "solo";
    var daily = !!app.daily;
    var localVersus = !app.online && !coop && !solo;
    var winner = s.winner;
    var human = app.online ? app.me : 0;
    var won = !solo && winner === human;
    var badge;
    var title;
    if (coop) {
      badge = "ortak tur";
      title = "Tur bitti";
    } else if (daily) {
      badge = "günün tahtası";
      title = reward && reward.newRecord ? "Yeni rekor!" : "Günün tahtası bitti";
    } else if (solo) {
      badge = "tek kişilik";
      title = reward && reward.newRecord ? "Yeni rekor!" : "Tur bitti";
    } else if (winner != null && s.players[winner]) {
      /* Aynı cihazda iki insan oynarken kazanan her zaman "sen" değildir;
         o yüzden "kaybettin" yerine kazananın adı gösterilir. */
      badge = localVersus ? (won ? "kazandın" : "tur bitti") : (won ? "kazandın" : "kaybettin");
      title = won ? "Kazandın!" : s.players[winner].name + " kazandı";
    } else {
      badge = "tur bitti";
      title = "Berabere";
    }

    var rows = s.players.map(function (player, index) {
      var isWinner = !coop && !solo && winner === index;
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
    } else if (daily) {
      var today = s.players[0] || { lines: 0, moves: 0 };
      meta += '<span>' + today.lines + ' satır</span>';
      meta += '<span>' + (today.moves || 0) + ' hamle</span>';
      if (app.profile) {
        meta += '<span>' + (app.profile.dailyStreak || 0) + ' günlük seri</span>';
        meta += '<span>En iyi ' + fmt(app.profile.dailyBest || 0) + '</span>';
      }
    } else if (solo) {
      var only = s.players[0] || { lines: 0, moves: 0 };
      meta += '<span>' + only.lines + ' satır</span>';
      meta += '<span>' + (only.moves || 0) + ' hamle</span>';
      meta += '<span>Tek kişilik</span>';
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
      if (reward.unlocked && reward.unlocked.length) {
        rewardHTML += '<div class="reward-unlock"><span class="tiny">Yeni başarım</span>' +
          reward.unlocked.map(function (item) {
            return '<span class="unlock-chip">' + item.title + '</span>';
          }).join("") + '</div>';
      }
    }

    var canRematch = !app.online || app.me === s.host;
    var action = canRematch
      ? '<button class="btn btn-coral" type="button" data-rematch data-autofocus>Yeniden oyna</button>'
      : '<p class="result-note">Yeniden başlatmayı oda sahibi yapar.</p>';
    var doubleCoins = "";
    if (ads.rewarded && reward && reward.coins > 0) {
      doubleCoins = '<button class="btn btn-outline" type="button" data-double-coins>' +
        'Reklam izle, 2× coin</button>';
    }

    var rejoinNote = app.online && s.players.some(function (p) { return !p.connected; })
      ? '<p class="result-note">Bir oyuncunun bağlantısı yok. Yeniden başlatmak için iki oyuncu da bağlı olmalı.</p>'
      : "";

    var tie = !coop && !solo && (winner == null || !s.players[winner]);
    var sub = coop
      ? '<p class="sheet-sub">Birlikte ' + fmt(s.shared.score) + ' puana ulaştınız.</p>'
      : (solo
        ? (daily
          ? '<p class="sheet-sub"><span>Günün tahtasında ' + fmt(s.players[0] ? s.players[0].score : 0) + ' puan topladın.</span> ' +
            (reward && reward.daily && reward.daily.newDay
              ? '<span>Serin ' + reward.daily.streak + ' gün oldu.</span>'
              : '<span>Yarın yeni tahta seni bekliyor.</span>') + '</p>'
          : '<p class="sheet-sub"><span>' + fmt(s.players[0] ? s.players[0].score : 0) + ' puan topladın.</span> ' +
            (reward && reward.newRecord ? '<span>Bu senin yeni rekorun.</span>' : '<span>Tekrar dene, daha yükseğe çık.</span>') + '</p>')
        : '<p class="sheet-sub">' + (tie
          ? "Skorlar eşit; tur berabere bitti."
          : (localVersus
            ? (won ? "Rakibinin tahtası doldu." : s.players[winner].name + " tahtası daha uzun dayandı.")
            : (won ? "Rakibinin tahtası doldu." : "Tahtan doldu."))) + '</p>');

    var isWin = coop || (solo
      ? !!(reward && reward.newRecord)
      : (winner != null && won));
    var isLose = !isWin && !tie && !localVersus && (solo || winner != null);
    var variant = isWin ? "win" : (isLose ? "lose" : "");

    openOverlay(
      (isWin ? '<span class="result-rays" aria-hidden="true"></span>' : "") +
      '<span class="result-badge' + ((coop || solo || localVersus) ? "" : (won ? "" : " lost")) + '">' + badge + '</span>' +
      '<h2>' + esc(title) + '</h2>' +
      sub +
      '<div class="result-scores">' + rows + '</div>' +
      '<div class="result-meta">' + meta + '</div>' +
      rewardHTML +
      (s.reason ? '<p class="result-note">' + esc(s.reason) + '</p>' : "") +
      rejoinNote +
      '<div class="sheet-actions">' +
        doubleCoins +
        action +
        '<button class="btn btn-outline" type="button" data-close>Tahtaya bak</button>' +
        '<button class="btn btn-ghost" type="button" data-home>Ana menü</button>' +
      '</div>',
      true,
      variant
    );
    app.interstitialPending = true;
    if (s.phase === "over") {
      if (isWin) {
        if (FX) FX.victory();
        sfxWin();
        if (app.vibrate && FX) FX.vibrate([0, 28, 40, 32, 70]);
        setTimeout(function () { if (app.sound && isWin) sfxReward(); }, 620);
      } else if (isLose) {
        if (FX) FX.defeat();
        sfxLose();
        if (app.vibrate && FX) FX.vibrate([0, 45, 70, 45]);
      }
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
      '<p class="sheet-sub">' + (online
        ? 'Oda <b>' + esc(app.room || "") + '</b> · <span>' + modeName(s.mode) + '</span> · <span>Arkadaşınla</span>'
        : '<span>' + modeName(s.mode) + '</span> · <span>Aynı cihaz</span>') + '</p>' +
      (info ? '<p class="result-note">Seviye ' + info.level + ' · ' + fmt(app.profile.coins) + ' coin · ' + fmt(app.profile.bestAny || 0) + ' rekor</p>' : '') +
      (online && s.timeMode && s.timeMode !== "none"
        ? '<p class="result-note">Oda oyununda süre menü açıkken de işler.</p>'
        : '') +
      '<div class="sheet-actions">' +
        (canRestart ? '<button class="btn btn-coral" type="button" data-restart>' + restartLabel + '</button>' : '') +
        '<button class="btn btn-outline" type="button" data-lang-sheet>Dil değiştir</button>' +
        '<button class="btn btn-outline" type="button" data-help>Nasıl oynanır?</button>' +
        '<button class="btn btn-outline" type="button" data-rename>Adı değiştir</button>' +
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

  /* Açık pencerede Tab odağını pencerenin içinde tutar. */
  function trapOverlayFocus(event) {
    var sheet = $(".sheet", $("#overlay"));
    if (!sheet) return;
    var items = $$("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])", sheet)
      .filter(function (el) {
        return !el.disabled && el.offsetParent !== null && el.getAttribute("aria-hidden") !== "true";
      });
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    var active = document.activeElement;
    if (event.shiftKey && (active === first || !sheet.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !sheet.contains(active))) {
      event.preventDefault();
      first.focus();
    }
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
    /* Hesap bağlıysa ad alanı gizli olabilir; hesap adına düş. */
    if (!value && googleAccount.profile) value = googleAccount.profile.name.slice(0, 16);
    if (value) save(LS_NAME, value);
    return value;
  }

  /* ------------------------------------------------------------------ */
  /* Google hesabı                                                       */
  /* ------------------------------------------------------------------ */

  var googleAccount = {
    clientId: "",
    ready: false,
    configured: false,
    attempted: false,
    profile: null,
    native: false
  };

  /* Android yerel köprüleri (Play Games + AdMob). Web'de boş kalır. */
  var playGames = { available: false, player: null };
  var ads = {
    available: false,
    rewarded: false,
    banner: false,
    shown: 0,
    pendingCoins: 0,
    pendingKey: null,
    grantedKey: null,
    free: read(LS_ADS_FREE) === "1",
    billing: false,
    bannerShown: false
  };

  /* Sunucu adresini (APK'da gömülü adres, webde aynı köken) koruyarak yol üretir. */
  function apiUrl(pathname) {
    var base = serverBase();
    return (base || "") + pathname;
  }

  /* Yalnızca çevrimdışı yedek için: jetonun okunabilir alanları.
     Asıl doğrulama sunucuda imza kontrolüyle yapılır. */
  function decodeIdToken(token) {
    try {
      var part = String(token).split(".")[1] || "";
      var binary = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
      var escaped = "";
      for (var i = 0; i < binary.length; i++) {
        escaped += "%" + ("00" + binary.charCodeAt(i).toString(16)).slice(-2);
      }
      return JSON.parse(decodeURIComponent(escaped));
    } catch (error) {
      return null;
    }
  }

  function loadSavedAccount() {
    var raw = read(LS_GOOGLE);
    if (!raw) return null;
    try {
      var data = JSON.parse(raw);
      if (data && data.name) return data;
    } catch (error) { /* bozuk kayıt: yoksay */ }
    return null;
  }

  function accountInitial(name) {
    var text = String(name || "").trim();
    return text ? text.charAt(0).toUpperCase() : "?";
  }

  /* Ad alanı hesap şeridinde durur: giriş gerekmez, her zaman yazılabilir.
     Avatar yazılan adın ilk harfini gösterir. */
  function accountName() {
    var input = $("#player-name");
    var typed = input ? input.value.trim() : "";
    if (typed) return typed;
    return googleAccount.profile ? googleAccount.profile.name : "";
  }

  function focusNameField() {
    var input = $("#player-name");
    if (!input) return;
    var card = $("#account-strip");
    if (card && card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(function () {
      try { input.focus(); input.select(); } catch (error) { /* yoksay */ }
    }, 120);
  }

  /* Adı her yerden (oyun içi menü dâhil) düzenlemek için pencere. */
  function showNameEditor() {
    var current = playerName() || "Misafir oyuncu";
    openOverlay(
      '<span class="result-badge">Ad</span>' +
      '<h2>Adın</h2>' +
      '<p class="sheet-sub">Oda oyunlarında ve skor tablosunda bu ad görünür. En fazla 16 karakter.</p>' +
      '<div class="field"><label for="name-edit-input">Adın</label>' +
        '<input id="name-edit-input" type="text" maxlength="16" autocomplete="nickname" ' +
        'value="' + esc(current) + '" data-autofocus></div>' +
      '<div class="sheet-actions">' +
        '<button class="btn btn-coral" type="button" data-save-name>Kaydet</button>' +
        '<button class="btn btn-outline" type="button" data-close>Vazgeç</button>' +
      '</div>',
      true
    );
    var input = $("#name-edit-input");
    if (input) {
      input.addEventListener("keydown", function (event) {
        if (event.key !== "Enter") return;
        event.preventDefault();
        saveNameFromEditor();
      });
    }
  }

  function saveNameFromEditor() {
    var input = $("#name-edit-input");
    var value = input ? input.value.trim().slice(0, 16) : "";
    if (!value) {
      toast("Bir ad yaz.");
      if (input) input.focus();
      return;
    }
    save(LS_NAME, value);
    var field = $("#player-name");
    if (field) field.value = value;
    closeOverlay();
    toast("Adın güncellendi.");
  }

  function renderAccount() {
    var profile = googleAccount.profile;
    var avatar = $("#account-avatar");
    var signout = $("#google-signout");
    var slot = $("#google-slot");
    var nativeBtn = $("#google-native");
    if (!avatar) return;
    var name = accountName();
    avatar.style.backgroundImage = "";
    avatar.textContent = accountInitial(name);
    if (profile && profile.picture) {
      avatar.textContent = "";
      avatar.style.backgroundImage = 'url("' + String(profile.picture).replace(/["\\]/g, "") + '")';
    }
    if (signout) signout.hidden = !profile;
    if (slot) slot.hidden = !!profile || googleAccount.native || !googleAccount.ready;
    if (nativeBtn) nativeBtn.hidden = !!profile || !googleAccount.native;
  }

  function applyGoogleProfile(profile, options) {
    if (!profile || !profile.name) return false;
    var previous = googleAccount.profile;
    var clean = {
      sub: String(profile.sub || ""),
      name: String(profile.name).slice(0, 40),
      picture: String(profile.picture || ""),
      source: profile.source === "playgames" ? "playgames" : "google"
    };
    googleAccount.profile = clean;
    save(LS_GOOGLE, JSON.stringify(clean));
    var input = $("#player-name");
    var forceName = !!(options && options.forceName);
    if (input) {
      var current = input.value.trim();
      /* Kullanıcı kendi adını yazdıysa hesap adı onu ezmesin. Yalnızca alan
         boşsa ya da hâlâ önceki hesap adını gösteriyorsa güncelle. */
      var custom = current && previous && current !== String(previous.name || "").slice(0, 16);
      if (!custom && (forceName || !current)) input.value = clean.name.slice(0, 16);
    }
    save(LS_NAME, input ? input.value.trim() : clean.name);
    renderAccount();
    if (!options || !options.silent) toast("Giriş yapıldı: " + clean.name);
    return true;
  }

  function signOutGoogle() {
    googleAccount.profile = null;
    remove(LS_GOOGLE);
    try {
      if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
    } catch (error) { /* yoksay */ }
    try {
      if (playGames.available && window.BlokIkiPlayGames) window.BlokIkiPlayGames.signOut();
    } catch (error) { /* yoksay */ }
    renderAccount();
    toast("Hesabından çıkış yapıldı.");
  }

  function verifyGoogleCredential(credential) {
    return fetch(apiUrl("/api/auth/google"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: credential })
    }).then(function (response) {
      return response.text().then(function (text) {
        var body = {};
        try { body = JSON.parse(text) || {}; } catch (error) { body = {}; }
        if (!response.ok) {
          var failure = new Error(body.message || "Google oturumu doğrulanamadı.");
          failure.status = response.status;
          throw failure;
        }
        return body;
      });
    });
  }

  function handleGoogleCredential(credential) {
    if (!credential) {
      toast("Google oturumu alınamadı.");
      return;
    }
    verifyGoogleCredential(credential).then(function (profile) {
      applyGoogleProfile(profile, { forceName: true });
    }).catch(function (error) {
      if (error && error.status === 401) {
        toast(error.message || "Google oturumu doğrulanamadı.");
        return;
      }
      /* Sunucuya ulaşılamıyorsa jetonun adını kullan; jeton doğrudan
         Google'dan geldiği için yalnızca görünen ad için yeterli. */
      var claims = decodeIdToken(credential);
      if (claims && claims.name) {
        applyGoogleProfile({ sub: claims.sub, name: claims.name, picture: claims.picture }, { forceName: true });
      } else {
        toast(error && error.message ? error.message : "Google oturumu doğrulanamadı.");
      }
    });
  }

  function loadScriptOnce(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-src="' + src + '"]');
      if (existing) {
        if (existing.dataset.loaded === "1") resolve();
        else existing.addEventListener("load", function () { resolve(); });
        return;
      }
      var script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.defer = true;
      script.dataset.src = src;
      script.addEventListener("load", function () {
        script.dataset.loaded = "1";
        resolve();
      });
      script.addEventListener("error", function () {
        reject(new Error("Google betiği yüklenemedi."));
      });
      document.head.appendChild(script);
    });
  }

  /* Web: Google Identity Services düğmesi. */
  function startWebGoogle(clientId) {
    if (!clientId || location.protocol === "file:") return;
    loadScriptOnce("https://accounts.google.com/gsi/client").then(function () {
      if (!window.google || !google.accounts || !google.accounts.id) {
        throw new Error("Google betiği hazır değil.");
      }
      google.accounts.id.initialize({
        client_id: clientId,
        ux_mode: "popup",
        auto_select: false,
        cancel_on_tap_outside: true,
        callback: function (response) {
          handleGoogleCredential(response && response.credential);
        }
      });
      var slot = $("#google-slot");
      if (slot) {
        slot.hidden = false;
        slot.innerHTML = "";
        google.accounts.id.renderButton(slot, {
          type: "standard",
          theme: "outline",
          size: "medium",
          shape: "pill",
          text: "signin_with",
          locale: "tr",
          width: 190
        });
      }
      googleAccount.ready = true;
      renderAccount();
    }).catch(function () {
      googleAccount.ready = false;
      renderAccount();
    });
  }

  function initGoogleAccount() {
    googleAccount.profile = loadSavedAccount();

    var bridge = window.BlokIkiGoogle;
    if (bridge && typeof bridge.isAvailable === "function") {
      try { googleAccount.native = !!bridge.isAvailable(); } catch (error) { googleAccount.native = false; }
    }

    /* Play Games varsa birincil giriş odur; yoksa Google OAuth'a düşer. */
    var gamesBridge = window.BlokIkiPlayGames;
    if (gamesBridge && typeof gamesBridge.available === "function") {
      try { playGames.available = !!gamesBridge.available(); } catch (error) { playGames.available = false; }
    }
    if (playGames.available) googleAccount.native = true;

    var saved = googleAccount.profile;
    var input = $("#player-name");
    if (saved && input && !input.value.trim()) input.value = saved.name.slice(0, 16);

    renderAccount();

    var signout = $("#google-signout");
    if (signout) signout.addEventListener("click", signOutGoogle);

    var nameField = $("#player-name");
    if (nameField) {
      /* Enter'da klavyeyi kapat; ad zaten yazarken kaydediliyor. */
      nameField.addEventListener("keydown", function (event) {
        if (event.key !== "Enter") return;
        event.preventDefault();
        nameField.blur();
      });
    }

    var nativeBtn = $("#google-native");
    function startGoogleSignInFlow() {
      if (playGames.available) {
        try {
          window.BlokIkiPlayGames.signIn();
        } catch (error) {
          toast("Play Games girişi başlatılamadı.");
        }
        return;
      }
      if (googleAccount.native) {
        try {
          window.BlokIkiGoogle.signIn();
        } catch (error) {
          toast("Google girişi başlatılamadı.");
        }
        return;
      }
      if (googleAccount.ready && window.google && google.accounts && google.accounts.id) {
        /* Web: Google'ın kendi düğmesi zaten görünür; kullanıcıyı ona yönlendir. */
        var slot = $("#google-slot");
        if (slot && slot.scrollIntoView) slot.scrollIntoView({ behavior: "smooth", block: "center" });
        toast("Google ile giriş için aşağıdaki düğmeyi kullan.");
        return;
      }
      toast("Giriş bu sürümde kullanılamıyor.");
    }

    if (nativeBtn) {
      if (playGames.available) nativeBtn.textContent = "Play Games ile giriş";
      nativeBtn.addEventListener("click", startGoogleSignInFlow);
    }

    if (googleAccount.native || location.protocol === "file:") return;

    fetch(apiUrl("/api/config")).then(function (response) {
      return response.json();
    }).then(function (config) {
      googleAccount.attempted = true;
      googleAccount.clientId = config && config.googleClientId ? String(config.googleClientId) : "";
      googleAccount.configured = !!googleAccount.clientId;
      renderAccount();
      startWebGoogle(googleAccount.clientId);
    }).catch(function () {
      googleAccount.attempted = true;
      googleAccount.configured = false;
      renderAccount();
    });
  }

  /* Android yerel Google akışı sonucu buraya yazar. */
  window.BlokGoogleResult = function (payload) {
    var data = payload;
    if (typeof payload === "string") {
      try { data = JSON.parse(payload); } catch (error) { data = null; }
    }
    if (!data) {
      toast("Google oturumu alınamadı.");
      return;
    }
    if (data.error) {
      toast(String(data.error));
      return;
    }
    if (data.credential) {
      handleGoogleCredential(data.credential);
      return;
    }
    if (data.name) applyGoogleProfile(data, { forceName: true });
  };

  /* ------------------------------------------------------------------ */
  /* Play Games ve reklamlar (yalnızca Android köprüsü varsa)            */
  /* ------------------------------------------------------------------ */

  function readBridgeJson(payload) {
    if (!payload) return null;
    if (typeof payload === "object") return payload;
    try { return JSON.parse(String(payload)); } catch (error) { return null; }
  }

  function applyPlayGamesPlayer(payload) {
    var player = readBridgeJson(payload);
    if (!player || !player.name) return;
    playGames.player = player;
    /* Sessiz oturumda kullanıcının kendi yazdığı adı ezme. */
    applyGoogleProfile({
      sub: player.id,
      name: player.name,
      picture: player.icon,
      source: "playgames"
    }, { forceName: false, silent: true });
  }

  /* Yerel taraftan gelen Play Games olayları. */
  window.BlokPlayGamesEvent = function (type, payload) {
    if (type === "player") {
      applyPlayGamesPlayer(payload);
      return;
    }
    if (type === "error" && payload) toast(String(payload));
  };

  /* Reklam hazırlığını tazele (yükleme birkaç saniye sürebilir). */
  function refreshAdsState() {
    var bridge = window.BlokAds;
    if (!bridge) return;
    try {
      if (typeof bridge.available === "function") ads.available = !!bridge.available();
      if (typeof bridge.hasRewarded === "function") ads.rewarded = !!bridge.hasRewarded();
      if (typeof bridge.hasBanner === "function") ads.banner = !!bridge.hasBanner();
    } catch (error) { /* köprü yoksa yoksay */ }
  }

  /* Banner yalnızca oyun ekranında, sonuç/menü penceresi kapalıyken ve
     "Reklamları kaldır" satın alınmadıysa görünür. */
  function syncBannerVisibility() {
    var bridge = window.BlokAds;
    if (!bridge || typeof bridge.showBanner !== "function" ||
        typeof bridge.hideBanner !== "function") return;
    var overlayOpen = $("#overlay") && !$("#overlay").hidden;
    var show = !!ads.banner && !ads.free && app.screen === "game" && !overlayOpen;
    if (show === ads.bannerShown) return;
    ads.bannerShown = show;
    try {
      if (show) bridge.showBanner();
      else bridge.hideBanner();
    } catch (error) { /* yoksay */ }
  }

  function grantPendingCoins() {
    if (!ads.pendingCoins || !app.profile || !PROGRESS) return;
    var key = ads.pendingKey;
    if (key && ads.grantedKey === key) return;
    var amount = ads.pendingCoins;
    PROGRESS.addCoins(app.profile, amount);
    PROGRESS.save(app.profile);
    ads.grantedKey = key;
    ads.pendingCoins = 0;
    ads.pendingKey = null;
    renderHomeMeta();
    toast("+" + fmt(amount) + " coin eklendi (2×).");
    var button = document.querySelector("[data-double-coins]");
    if (button) {
      button.disabled = true;
      button.textContent = "Coinler eklendi";
    }
  }

  function handleAdsEvent(event) {
    var name = String(event || "");
    if (name.indexOf("banner:") === 0) {
      var height = parseInt(name.slice(7), 10);
      if (!isNaN(height) && height > 0) {
        document.documentElement.style.setProperty("--ad-b", height + "px");
      }
      return;
    }
    if (name === "banner-loaded") {
      refreshAdsState();
      syncBannerVisibility();
      return;
    }
    if (name === "banner-hidden") {
      document.documentElement.style.setProperty("--ad-b", "0px");
      return;
    }
    if (name.indexOf("rewarded:") === 0) {
      grantPendingCoins();
    } else if (name === "rewarded-closed" || name === "rewarded-failed") {
      if (ads.pendingCoins) {
        ads.pendingCoins = 0;
        ads.pendingKey = null;
        toast("Reklam tamamlanmadı; coin eklenmedi.");
      }
    }
    refreshAdsState();
  }

  window.BlokAdsEvent = function (event) {
    handleAdsEvent(event);
  };

  /* Oyun sonucu kapandıktan sonra her turda bir geçiş reklamı.
     "Reklamları kaldır" satın alındıysa hiç gösterilmez. */
  function flushPendingInterstitial() {
    if (!app.interstitialPending) return;
    app.interstitialPending = false;
    refreshAdsState();
    if (!ads.available || ads.free) return;
    ads.shown += 1;
    setTimeout(function () {
      try {
        if (window.BlokAds && typeof window.BlokAds.showInterstitial === "function") {
          window.BlokAds.showInterstitial();
        }
      } catch (error) { /* reklam gösterilemedi */ }
    }, 350);
  }

  function watchRewardedCoins(key, coins) {
    if (!ads.rewarded || !coins) {
      toast("Reklam şu an hazır değil.");
      return;
    }
    ads.pendingCoins = coins;
    ads.pendingKey = key || null;
    try {
      window.BlokAds.showRewarded();
    } catch (error) {
      ads.pendingCoins = 0;
      ads.pendingKey = null;
      toast("Reklam açılamadı.");
    }
  }

  /* ------------------------------------------------------------------ */
  /* reklamları kaldırma (Google Play Billing)                           */
  /* ------------------------------------------------------------------ */

  function refreshBillingState() {
    var bridge = window.BlokBilling;
    if (!bridge) {
      ads.billing = false;
      updatePurchaseStrip();
      return;
    }
    try {
      ads.billing = typeof bridge.available === "function" && !!bridge.available();
      if (typeof bridge.owned === "function" && bridge.owned()) setAdsFree(true, { silent: true });
    } catch (error) { ads.billing = false; }
    updatePurchaseStrip();
  }

  function setAdsFree(free, options) {
    ads.free = !!free;
    save(LS_ADS_FREE, ads.free ? "1" : "0");
    updatePurchaseStrip();
    syncBannerVisibility();
    if (ads.free && (!options || !options.silent)) toast("Reklamlar kaldırıldı. Teşekkürler!");
  }

  function updatePurchaseStrip() {
    var button = $("#buy-remove-ads");
    if (!button) return;
    button.hidden = !ads.billing || ads.free;
    button.classList.toggle("is-owned", !!ads.free);
  }

  function startRemoveAdsPurchase() {
    if (ads.free) {
      toast("Reklamlar zaten kaldırılmış.");
      return;
    }
    if (!window.BlokBilling || typeof window.BlokBilling.purchase !== "function") {
      toast("Satın alma bu sürümde kullanılamıyor.");
      return;
    }
    toast("Ödeme ekranı açılıyor…");
    try {
      window.BlokBilling.purchase();
    } catch (error) {
      toast("Ödeme başlatılamadı.");
    }
  }

  /* Yerel taraftan gelen satın alma olayları. Yerel taraf tek parametre
     gönderir: "owned", "canceled", "unavailable" ya da "error:<mesaj>". */
  window.BlokBillingEvent = function (event) {
    var text = String(event || "");
    var split = text.indexOf(":");
    var type = split < 0 ? text : text.slice(0, split);
    var payload = split < 0 ? "" : text.slice(split + 1);
    if (type === "owned") {
      setAdsFree(true);
      sfxPurchase();
      return;
    }
    if (type === "unavailable") {
      ads.billing = false;
      updatePurchaseStrip();
      return;
    }
    if (type === "error" && payload) toast(payload);
    refreshBillingState();
  };

  function initNativeIntegrations() {
    refreshAdsState();
    refreshBillingState();
    syncBannerVisibility();
    /* Sessiz Play Games oturumu yerel tarafta zaten başlatıldı; sonuç
       geldiğinde yukarıdaki olay dinleyicisi hesabı günceller. */
    if (playGames.available && window.BlokIkiPlayGames &&
        typeof window.BlokIkiPlayGames.autoSignIn === "function") {
      try { window.BlokIkiPlayGames.autoSignIn(); } catch (error) { /* yoksay */ }
    }
  }

  /* Sunucu sorununda arkadaşla oyun bölümüne kaydırır (adres gömülü). */
  function askServer(message) {
    toast(message || "Arkadaşınla oynamak için sunucu ayarlı değil.");
    var online = $("#online-card");
    if (online && online.scrollIntoView) online.scrollIntoView({ behavior: "smooth", block: "center" });
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

  /* ------------------------------------------------------------------ */
  /* rastgele eşleşme                                                    */
  /* ------------------------------------------------------------------ */

  function updateMatchButton() {
    var button = $("#quick-match");
    if (!button) return;
    button.textContent = app.matching ? "Eşleşmeyi iptal et" : "Rakip bul";
    button.setAttribute("aria-pressed", app.matching ? "true" : "false");
    var note = $("#match-note");
    if (note) {
      note.textContent = app.matching
        ? "Rakip aranıyor… Aynı anda bekleyen biriyle eşleşeceksin."
        : "Adını yaz, aynı anda bekleyen biriyle hemen eşleş.";
    }
  }

  function startMatchmaking() {
    if (app.busy) return;
    if (app.matching) {
      cancelMatchmaking();
      return;
    }
    app.busy = true;
    var name = playerName();
    ensureSocket().then(function () {
      app.matching = true;
      updateMatchButton();
      startHeartbeat();
      wsSend({ t: "quickmatch", name: name, mode: "versus" });
      toast("Rakip aranıyor…");
      setTimeout(function () { app.busy = false; }, 500);
    }).catch(function (error) {
      app.busy = false;
      app.matching = false;
      updateMatchButton();
      var message = error.message || "Sunucuya bağlanılamadı.";
      if (/sunucu/i.test(message)) askServer(message);
      else toast(message);
    });
  }

  function cancelMatchmaking() {
    if (app.ws && app.ws.readyState === WebSocket.OPEN) {
      wsSend({ t: "cancelmatch" });
    }
    app.matching = false;
    updateMatchButton();
    toast("Eşleşme iptal edildi.");
  }

  /* ------------------------------------------------------------------ */
  /* arkadaşlar                                                          */
  /* ------------------------------------------------------------------ */

  var FRIEND_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  /* Cihazda kalıcı arkadaş kodu; hesap gerekmez. Aynı tarayıcıda açılan
     sekmeler aynı kaydı paylaşsa da her oturum kendi kodunu korur. */
  function friendCode() {
    if (app.friendCode && /^[A-Z0-9]{4,10}$/.test(app.friendCode)) return app.friendCode;
    var code = read(LS_FRIEND_CODE);
    if (code && /^[A-Z0-9]{4,10}$/.test(code)) {
      app.friendCode = code;
      return code;
    }
    code = "";
    for (var i = 0; i < 6; i++) {
      code += FRIEND_CHARS.charAt(Math.floor(Math.random() * FRIEND_CHARS.length));
    }
    app.friendCode = code;
    save(LS_FRIEND_CODE, code);
    return code;
  }

  /* Test/otomasyon: bu sekmenin kodunu değiştirip sunucuya bildirir. */
  function setFriendCode(code) {
    var clean = friendKey(code);
    if (clean.length < 4) return false;
    app.friendCode = clean;
    save(LS_FRIEND_CODE, clean);
    syncPresence();
    return true;
  }

  function friendKey(code) {
    return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  }

  function loadFriends() {
    var raw = read(LS_FRIENDS);
    var list = [];
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.length) {
          list = parsed.filter(function (item) {
            return item && /^[A-Z0-9]{4,10}$/.test(item.code || "");
          }).map(function (item) {
            return { code: friendKey(item.code), name: String(item.name || "").slice(0, 16) };
          });
        }
      } catch (error) { /* bozuk kayıt */ }
    }
    var seen = {};
    app.friends = list.filter(function (item) {
      if (seen[item.code]) return false;
      seen[item.code] = true;
      return true;
    });
    return app.friends;
  }

  function saveFriends() {
    save(LS_FRIENDS, JSON.stringify(app.friends.map(function (item) {
      return { code: item.code, name: item.name };
    })));
  }

  function addFriend(code, name) {
    var key = friendKey(code);
    if (!key || key.length < 4) {
      toast("Arkadaş kodu 4-10 karakter olmalı.");
      return false;
    }
    if (key === friendCode()) {
      toast("Bu senin kendi kodun.");
      return false;
    }
    var found = app.friends.filter(function (item) { return item.code === key; })[0];
    if (found) {
      if (name) found.name = name;
      saveFriends();
      toast("Arkadaş listende zaten var.");
      return true;
    }
    app.friends.push({ code: key, name: name || "" });
    saveFriends();
    return true;
  }

  function removeFriend(code) {
    app.friends = app.friends.filter(function (item) { return item.code !== code; });
    saveFriends();
  }

  /* Bağlantı açıkken çevrimiçi durum bilgisini sunucuya bildirir. */
  function syncPresence() {
    if (!app.ws || app.ws.readyState !== WebSocket.OPEN) return;
    wsSend({ t: "presence", code: friendCode(), name: playerName() || "Oyuncu" });
  }

  function refreshFriendsOnline() {
    if (!app.ws || app.ws.readyState !== WebSocket.OPEN) {
      app.friends.forEach(function (item) { item.online = false; });
      renderFriendsSheet();
      return;
    }
    app.friends.forEach(function (item) {
      wsSend({ t: "lookup", code: item.code });
    });
    renderFriendsSheet();
  }

  /* Arkadaşın sunucudaki güncel adını ve çevrimiçi durumunu sorar.
     Bağlantı yoksa sessizce kurup tekrar dener. */
  function lookupFriend(code) {
    var key = friendKey(code);
    if (!key) return;
    if (app.ws && app.ws.readyState === WebSocket.OPEN) {
      wsSend({ t: "lookup", code: key });
      return;
    }
    ensureSocket({ quiet: true }).then(function () {
      syncPresence();
      wsSend({ t: "lookup", code: key });
    }).catch(function () { /* sunucu yoksa yerel ad yeter */ });
  }

  function findFriend(code) {
    var key = friendKey(code);
    return app.friends.filter(function (item) { return item.code === key; })[0] || null;
  }

  function showFriends() {
    if (!app.friends.length) loadFriends();
    openOverlay(friendsSheetHTML(), true);
    refreshFriendsOnline();
    if (app.friendsTimer) clearInterval(app.friendsTimer);
    app.friendsTimer = setInterval(function () {
      if ($("#overlay").hidden) {
        clearInterval(app.friendsTimer);
        app.friendsTimer = null;
        return;
      }
      refreshFriendsOnline();
    }, 15000);
    if (!app.ws || app.ws.readyState !== WebSocket.OPEN) {
      ensureSocket({ quiet: true }).then(function () {
        syncPresence();
        refreshFriendsOnline();
      }).catch(function () { /* sunucu yoksa yerel liste yeter */ });
    }
    var form = $("#friend-add-form");
    if (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        addFriendFromSheet($("#friend-code-input").value);
        var field = $("#friend-code-input");
        if (field) field.focus();
      });
    }
    var input = $("#friend-code-input");
    if (input) input.focus();
  }

  function friendsSheetHTML() {
    var list = app.friends.map(function (item) {
      var label = item.name ? esc(item.name) : esc(item.code);
      var online = item.online ? "çevrimiçi" : "çevrimdışı";
      return '<li class="friend-row' + (item.online ? " online" : "") + '">' +
        '<span class="friend-dot" aria-hidden="true"></span>' +
        '<span class="friend-meta"><b>' + label + '</b><span class="tiny">' +
          esc(item.code) + " · " + online + "</span></span>" +
        '<button class="btn btn-coral btn-sm" type="button" data-friend-invite="' +
          esc(item.code) + '">Davet et</button>' +
        '<button class="friend-remove" type="button" aria-label="Arkadaşı kaldır" data-friend-remove="' +
          esc(item.code) + '">×</button>' +
        "</li>";
    }).join("");
    return '<span class="result-badge">Arkadaşlar</span>' +
      '<h2>Arkadaşlar</h2>' +
      '<p class="sheet-sub">Kendi kodunu paylaş; arkadaşın bu kodu ekleyince onu davet edebilirsin.</p>' +
      '<div class="friend-code-box">' +
        '<span class="tiny">Arkadaş kodun</span>' +
        '<strong id="my-friend-code">' + esc(friendCode()) + "</strong>" +
        '<button class="btn btn-outline btn-sm" type="button" data-friend-copy data-autofocus>Kopyala</button>' +
      "</div>" +
      '<form class="friend-add" id="friend-add-form">' +
        '<label class="tiny" for="friend-code-input">Arkadaş kodu ekle</label>' +
        '<div class="friend-add-row">' +
          '<input id="friend-code-input" type="text" maxlength="10" autocomplete="off" ' +
            'placeholder="Örn. K7M2QX" enterkeyhint="done">' +
          '<button class="btn btn-ink btn-sm" type="submit">Ekle</button>' +
        "</div>" +
      "</form>" +
      '<ul class="friend-list" id="friend-list">' +
        (list || '<li class="friend-empty">Henüz arkadaş eklemedin.</li>') +
      "</ul>" +
      '<p class="result-note" id="friends-note">Davet göndermek için önce bir oda kur ya da odaya katıl.</p>' +
      '<div class="sheet-actions"><button class="btn btn-outline" type="button" data-close>Kapat</button></div>';
  }

  function renderFriendsSheet() {
    var list = $("#friend-list");
    if (!list) return;
    if (!app.friends.length) {
      list.innerHTML = '<li class="friend-empty">Henüz arkadaş eklemedin.</li>';
      return;
    }
    list.innerHTML = app.friends.map(function (item) {
      var label = item.name ? esc(item.name) : esc(item.code);
      var online = item.online ? "çevrimiçi" : "çevrimdışı";
      return '<li class="friend-row' + (item.online ? " online" : "") + '">' +
        '<span class="friend-dot" aria-hidden="true"></span>' +
        '<span class="friend-meta"><b>' + label + '</b><span class="tiny">' +
          esc(item.code) + " · " + online + "</span></span>" +
        '<button class="btn btn-coral btn-sm" type="button" data-friend-invite="' +
          esc(item.code) + '">Davet et</button>' +
        '<button class="friend-remove" type="button" aria-label="Arkadaşı kaldır" data-friend-remove="' +
          esc(item.code) + '">×</button>' +
        "</li>";
    }).join("");
  }

  function addFriendFromSheet(input) {
    var code = friendKey(input);
    if (code.length < 4) {
      toast("Arkadaş kodu 4-10 karakter olmalı.");
      return;
    }
    if (code === friendCode()) {
      toast("Bu senin kendi kodun.");
      return;
    }
    app.pendingFriendAdd = code;
    addFriend(code);
    renderFriendsSheet();
    lookupFriend(code);
    toast("Arkadaş eklendi. Güncel adı alınıyor…");
    var field = $("#friend-code-input");
    if (field) field.value = "";
  }

  function inviteFriend(code) {
    var key = friendKey(code);
    var friend = findFriend(key);
    var label = friend && friend.name ? friend.name : key;
    var send = function () {
      if (!app.ws || app.ws.readyState !== WebSocket.OPEN) {
        toast("Davet için bağlantı kurulamadı.");
        return;
      }
      wsSend({ t: "invite", to: key, code: app.room });
      toast(label + " davet ediliyor…");
    };
    if (app.online && app.room && app.screen === "lobby") {
      send();
      return;
    }
    /* Oda yoksa önce rakip odası kur, hoş geldin mesajında davet gönder. */
    app.inviteAfterCreate = key;
    closeOverlay();
    toast("Oda kuruluyor, davet hemen ardından gidecek…");
    createRoom("versus");
  }

  function showInviteBanner(message) {
    app.pendingInvite = {
      code: String(message.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5),
      from: String(message.from || "Arkadaşın").slice(0, 16)
    };
    if (!app.pendingInvite.code) return;
    /* Davet eden arkadaşsa adını sunucudan gelen güncel değerle tazele. */
    var fromKey = friendKey(message.fromCode || "");
    var friend = fromKey ? findFriend(fromKey) : null;
    if (friend && app.pendingInvite.from) {
      friend.name = app.pendingInvite.from;
      friend.online = true;
      saveFriends();
      renderFriendsSheet();
    }
    var banner = $("#invite-banner");
    if (!banner) return;
    $("#invite-from").textContent = app.pendingInvite.from;
    $("#invite-code").textContent = app.pendingInvite.code;
    banner.hidden = false;
  }

  function hideInviteBanner() {
    var banner = $("#invite-banner");
    if (banner) banner.hidden = true;
    app.pendingInvite = null;
  }

  function acceptInvite() {
    var invite = app.pendingInvite;
    hideInviteBanner();
    if (!invite) return;
    if (app.screen === "game" || app.screen === "lobby") {
      leaveToHome(false);
    }
    setTimeout(function () { joinRoom(invite.code); }, 220);
  }

  function leaveToHome(confirmFirst) {
    var doLeave = function () {
      if (app.matching) {
        if (app.ws && app.ws.readyState === WebSocket.OPEN) wsSend({ t: "cancelmatch" });
        app.matching = false;
        updateMatchButton();
      }
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

    var langBtn = $("#lang-btn");
    if (langBtn) langBtn.addEventListener("click", function () {
      audio();
      showLanguageSheet();
    });

    $("#friends-btn").addEventListener("click", function () {
      audio();
      showFriends();
    });

    $("#invite-accept").addEventListener("click", acceptInvite);
    $("#invite-dismiss").addEventListener("click", hideInviteBanner);

    var buyRemoveAds = $("#buy-remove-ads");
    if (buyRemoveAds) {
      buyRemoveAds.addEventListener("click", function () {
        startRemoveAdsPurchase();
      });
    }

    $("#sound-btn").addEventListener("click", function () {
      app.sound = !app.sound;
      save(LS_SOUND, app.sound ? "1" : "0");
      updateSoundButton();
      if (app.sound) { audio(); sfxPlace(); }
    });

    $$("[data-local]").forEach(function (button) {
      button.addEventListener("click", function () {
        audio();
        var value = button.dataset.local;
        var mode = value === "daily" ? "daily"
          : (value === "coop" ? "coop" : (value === "solo" ? "solo" : "versus"));
        startLocal(mode, { timeMode: mode === "solo" || mode === "daily" ? "none" : app.timeMode });
      });
    });

    $$("[data-host]").forEach(function (button) {
      button.addEventListener("click", function () {
        audio();
        createRoom(button.dataset.host === "coop" ? "coop" : "versus");
      });
    });

    var quickMatch = $("#quick-match");
    if (quickMatch) {
      quickMatch.addEventListener("click", function () {
        audio();
        startMatchmaking();
      });
    }

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
      renderAccount();
      /* Arkadaş listesindeki adın canlı kalsın: kısa bir gecikmeyle
         sunucuya yeni adı bildir. */
      if (app.presenceTimer) clearTimeout(app.presenceTimer);
      app.presenceTimer = setTimeout(function () {
        app.presenceTimer = null;
        syncPresence();
      }, 500);
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
      if (target.hasAttribute("data-lang-sheet")) {
        showLanguageSheet();
        return;
      }
      if (target.hasAttribute("data-help")) {
        showHelp();
        return;
      }
      if (target.hasAttribute("data-rename")) {
        showNameEditor();
        return;
      }
      if (target.hasAttribute("data-friend-copy")) {
        copyText(friendCode(), "Arkadaş kodu kopyalandı.");
        return;
      }
      if (target.hasAttribute("data-friend-invite")) {
        inviteFriend(target.dataset.friendInvite);
        return;
      }
      if (target.hasAttribute("data-friend-remove")) {
        removeFriend(friendKey(target.dataset.friendRemove));
        renderFriendsSheet();
        toast("Arkadaş kaldırıldı.");
        return;
      }
      if (target.hasAttribute("data-save-name")) {
        saveNameFromEditor();
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
      if (target.hasAttribute("data-double-coins")) {
        app.interstitialPending = false;
        watchRewardedCoins(app.shownResultKey, app.lastReward ? app.lastReward.coins : 0);
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
        else if (event.key === "Tab") trapOverlayFocus(event);
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
    var mode = app.daily ? "daily"
      : (app.state.mode === "coop" ? "coop" : (app.state.mode === "solo" ? "solo" : "versus"));
    startLocal(mode, { timeMode: mode === "solo" || mode === "daily" ? "none" : app.timeMode });
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
        title: "Blokara 1v1",
        text: "Blokara 1v1 oynayalım mı? Oda kodu: " + code,
        url: url
      }).catch(function () { /* kullanıcı iptal etti */ });
    } else {
      copyText(url, "Oda bağlantısı kopyalandı.");
    }
  }

  /* ------------------------------------------------------------------ */
  /* yaşam döngüsü / geri tuşu                                           */
  /* ------------------------------------------------------------------ */

  /* Yerel oyun, menü açıkken ya da uygulama arkadayken duraklar. */
  function localPaused() {
    if (app.online) return false;
    return !!app.backgrounded || !$("#overlay").hidden;
  }

  function resumeLocal() {
    if (!app.state || app.screen !== "game") return;
    app.lastClockAt = performance.now();
    if (localPaused()) return;
    if (app.state.phase === "playing") updateClock();
  }

  function setBackgrounded(value) {
    value = !!value;
    if (app.backgrounded === value) return;
    app.backgrounded = value;
    if (value) return;
    resumeLocal();
    resumeOnline();
  }

  /* Uygulama öne döndüğünde kopmuş online bağlantıyı tazele. */
  function resumeOnline() {
    if (!app.online) {
      /* Oyun ortasında uygulamadan çıkıldıysa öne dönünce oturumu geri al. */
      if (!app.reconnectTimer) attemptSessionRejoin();
      return;
    }
    if (!app.ws || app.ws.readyState !== WebSocket.OPEN) {
      if (!app.reconnectTimer) scheduleReconnect();
      return;
    }
    wsSend({ t: "ping" });
  }

  /* Android köprüsü uygulama öne/arkaya geçtiğinde çağırır. */
  window.BlokLifecycle = function (state) {
    setBackgrounded(state === "pause");
  };

  /* Android geri tuşu: true dönerse uygulama kapanmaz. */
  window.BlokBack = function () {
    if (!$("#overlay").hidden) {
      if (app.overlayClosable) closeOverlay();
      return true;
    }
    if (app.screen === "game") {
      showMenu();
      return true;
    }
    if (app.screen === "lobby") {
      leaveToHome(false);
      return true;
    }
    return false;
  };

  function bindLifecycle() {
    document.addEventListener("visibilitychange", function () {
      setBackgrounded(!!document.hidden);
    });
    window.addEventListener("pagehide", function () { setBackgrounded(true); });
    window.addEventListener("pageshow", function () { setBackgrounded(false); });
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
