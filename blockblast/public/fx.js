/* Blokara 1v1 — görsel efektler: parçacık, uçan puan, sarsıntı, konfeti.
   Tek canvas üzerinde çalışır; efekt yokken döngü durur. */
(function (root) {
  "use strict";

  var COLORS = {
    coral: "#ef6a5b",
    cobalt: "#3f5bd6",
    mustard: "#e8b53a",
    mint: "#4fae8b",
    grape: "#8a5bd6",
    sky: "#4aa3d8",
    lime: "#8fc93a",
    rose: "#e8488f",
    teal: "#23c3b0",
    stone: "#8c8677",
    ink: "#1c1b2e",
    paper: "#f3ead8"
  };

  var canvas = null;
  var ctx = null;
  var particles = [];
  var raf = 0;
  var dpr = 1;
  var texts = [];
  var theme = "workshop";
  var unlocks = {};
  var fxPack = { burst: "classic", win: "confetti" };
  var motionQuery = typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

  /* Tema efekt renkleri: sonbaharda yaprak tonları, pamuk şekerde pastel
     pembe/mavi, diğer temalarda kendi vurgu renkleri. */
  var THEME_COLORS = {
    workshop: ["#f2553d", "#f4b72a", "#2da98d"],
    mint: ["#2da98d", "#7fd6b8", "#f4b72a"],
    ocean: ["#2f55e8", "#23c3b0", "#8fd6f2"],
    sunset: ["#e8485b", "#f4a12a", "#8c5bff"],
    autumn: ["#c9662f", "#e0a13a", "#7c4a2d", "#a8442a", "#d9b46a"],
    cotton: ["#ef79b9", "#f7a8d4", "#8fd6f2", "#fbe4f1", "#c9a6f2"]
  };

  /* Hareket duyarlılığı olan kullanıcılar için parçacık sayısını kıs. */
  function reducedMotion() {
    return !!(motionQuery && motionQuery.matches);
  }

  function color(name) {
    return COLORS[name] || name || COLORS.ink;
  }

  function setTheme(id) {
    theme = THEME_COLORS[id] ? id : "workshop";
  }

  function setUnlocks(map) {
    unlocks = map && typeof map === "object" ? map : {};
  }

  function setFxPack(map) {
    if (!map) return;
    if (map.burst) fxPack.burst = String(map.burst);
    if (map.win) fxPack.win = String(map.win);
  }

  function hasUnlock(key) {
    return !!(key && unlocks[key]);
  }

  function themePalette() {
    return THEME_COLORS[theme] || THEME_COLORS.workshop;
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  /* Temaya özel parçacıklar: sonbahar yaprakları, pamuk şeker bulutları.
     Diğer temalarda renkli kıvılcım ekler. */
  function themeExtras(x, y, power, delay) {
    if (theme !== "autumn" && theme !== "cotton") {
      var palette = themePalette();
      var total = reducedMotion() ? 1 : 4;
      for (var i = 0; i < total; i++) {
        var life = 0.6 + Math.random() * 0.5;
        spawn({
          x: x, y: y,
          vx: (Math.random() - 0.5) * 150 * power,
          vy: -(40 + Math.random() * 140) * power,
          gravity: 520,
          size: 2 + Math.random() * 3,
          color: pick(palette),
          life: life, maxLife: life,
          round: true,
          glow: true,
          drag: 0.97,
          delay: delay || 0
        });
      }
      return;
    }
    var count = reducedMotion() ? 1 : (theme === "autumn" ? 7 : 8);
    for (var j = 0; j < count; j++) {
      var life2 = 0.9 + Math.random() * 0.9;
      if (theme === "autumn") {
        var angle = Math.random() * Math.PI * 2;
        var speed = (40 + Math.random() * 130) * power;
        spawn({
          x: x, y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 70,
          gravity: 190,
          size: 6 + Math.random() * 7,
          color: pick(THEME_COLORS.autumn),
          life: life2, maxLife: life2,
          leaf: true,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 5,
          drag: 0.985,
          delay: (delay || 0) + Math.random() * 0.12
        });
      } else {
        spawn({
          x: x + (Math.random() - 0.5) * 34,
          y: y + (Math.random() - 0.5) * 20,
          vx: (Math.random() - 0.5) * 60,
          vy: -(30 + Math.random() * 90),
          gravity: -18,
          size: 7 + Math.random() * 9,
          color: pick(THEME_COLORS.cotton),
          life: life2, maxLife: life2,
          round: true,
          glow: true,
          wobble: 1 + Math.random() * 2,
          phase: Math.random() * Math.PI * 2,
          drag: 0.995,
          delay: (delay || 0) + Math.random() * 0.1
        });
      }
    }
  }

  function init() {
    if (canvas) return;
    canvas = document.createElement("canvas");
    canvas.id = "fx-canvas";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
  }

  function resize() {
    if (!canvas) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function spawn(particle) {
    particles.push(particle);
    start();
  }

  function burst(x, y, name, count, spread) {
    init();
    var total = count || 14;
    var power = spread || 1;
    if (reducedMotion()) total = Math.min(total, 3);
    for (var i = 0; i < total; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = (90 + Math.random() * 220) * power;
      var life = 0.45 + Math.random() * 0.45;
      spawn({
        x: x, y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        gravity: 620,
        size: 2.5 + Math.random() * 4.5,
        color: color(name),
        life: life, maxLife: life,
        round: true,
        drag: 0.985
      });
    }
  }

  /* Bir hücrenin renkli kırıntıları: satır/sütun patlamasında blokların
     dağılan parçalarını gösterir. Kare parçacıklar döner ve yerçekimiyle düşer. */
  function debris(x, y, name, count, power, cellSize, delay) {
    init();
    var names = Array.isArray(name) ? name : [name];
    var total = count || 10;
    var strength = power || 1;
    var base = Math.max(6, cellSize || 12);
    var wait = Math.max(0, Number(delay) || 0);
    if (reducedMotion()) total = Math.min(total, 2);
    for (var i = 0; i < total; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = (70 + Math.random() * 240) * strength;
      var life = 0.5 + Math.random() * 0.6;
      var shade = names[Math.floor(Math.random() * names.length)];
      spawn({
        x: x, y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 80,
        gravity: 780,
        size: Math.max(3, base * (0.14 + Math.random() * 0.3)),
        color: color(shade),
        life: life, maxLife: life,
        round: false,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 16,
        drag: 0.992,
        delay: wait + Math.random() * 0.08
      });
    }
  }

  /* Halka şeklinde şok dalgası; patlama merkezinden dışa yayılır. */
  function shockwave(x, y, name, radius, grow, duration) {
    init();
    if (reducedMotion()) return;
    var life = duration || 0.48;
    spawn({
      x: x, y: y,
      ring: true,
      size: Math.max(2, radius || 6),
      grow: grow || 90,
      color: color(name),
      life: life, maxLife: life,
      delay: 0
    });
  }

  /* Patlayan hücrenin kendisini kısa süre gösterip parçalar: tahtada silinen
     renkli blok "yerinde patlıyormuş" gibi görünür. */
  function ghostCell(x, y, size, name, delay) {
    if (!document.body) return;
    var wait = Math.max(0, Number(delay) || 0);
    var el = document.createElement("div");
    el.className = "fx-ghost";
    el.setAttribute("aria-hidden", "true");
    el.style.left = (x - size / 2) + "px";
    el.style.top = (y - size / 2) + "px";
    el.style.width = Math.max(2, size * 0.92) + "px";
    el.style.height = Math.max(2, size * 0.92) + "px";
    el.style.background = color(name);
    el.style.animationDelay = wait + "ms";
    document.body.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, wait + 720);
  }

  function confetti() {
    init();
    if (reducedMotion()) return;
    var palette = [
      COLORS.coral, COLORS.cobalt, COLORS.mustard, COLORS.mint, COLORS.grape, COLORS.sky,
      COLORS.lime, COLORS.rose, COLORS.teal
    ];
    var width = window.innerWidth;
    for (var i = 0; i < 90; i++) {
      var life = 1.1 + Math.random() * 1.1;
      spawn({
        x: width * (0.15 + Math.random() * 0.7),
        y: -20 - Math.random() * 120,
        vx: (Math.random() - 0.5) * 160,
        vy: 120 + Math.random() * 220,
        gravity: 340,
        size: 4 + Math.random() * 5,
        color: palette[Math.floor(Math.random() * palette.length)],
        life: life, maxLife: life,
        round: false,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 10,
        drag: 0.995
      });
    }
  }

  /* Piksel patlaması: 8-bit hissi veren iri, dönen kare parçalar. */
  function burstPixels(x, y, strong) {
    init();
    var total = reducedMotion() ? 3 : (strong ? 30 : 18);
    var palette = themePalette().concat(["paper", "ink", "mustard"]);
    for (var i = 0; i < total; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = (100 + Math.random() * 260) * (strong ? 1.25 : 1);
      var life = 0.55 + Math.random() * 0.6;
      spawn({
        x: x, y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 90,
        gravity: 920,
        size: 4 + Math.random() * 8,
        color: color(pick(palette)),
        life: life, maxLife: life,
        round: false,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 22,
        drag: 0.986
      });
    }
    if (!reducedMotion()) {
      shockwave(x, y, "mustard", 8, 84, 0.32);
      shockwave(x, y, "paper", 4, 52, 0.24);
    }
  }

  /* Balon patlaması: yumuşak renkli kabarcıklar yükselir ve söner. */
  function burstBubbles(x, y, strong) {
    init();
    var total = reducedMotion() ? 2 : (strong ? 26 : 16);
    var palette = ["#8fd0ff", "#bfe4ff", "#f7a8d4", "#a7e8c4", "#ffe3a3", "paper"];
    for (var i = 0; i < total; i++) {
      var life = 0.95 + Math.random() * 1;
      spawn({
        x: x + (Math.random() - 0.5) * 54,
        y: y + (Math.random() - 0.5) * 40,
        vx: (Math.random() - 0.5) * 300,
        vy: -(70 + Math.random() * 220),
        gravity: -30,
        size: 12 + Math.random() * 26,
        color: pick(palette),
        life: life, maxLife: life,
        bubble: true,
        wobble: 1.2 + Math.random() * 2.4,
        phase: Math.random() * Math.PI * 2,
        drag: 0.988,
        delay: Math.random() * 0.1
      });
    }
    if (!reducedMotion()) {
      shockwave(x, y, "#bfe4ff", 6, 76, 0.36);
      themeExtras(x, y, 0.7);
    }
  }

  /* Kıvılcım patlaması: ışık hızında dağılan ince çizgiler. */
  function burstSparks(x, y, strong) {
    init();
    var total = reducedMotion() ? 3 : (strong ? 30 : 18);
    var palette = ["mustard", "#fff3c4", "paper", "coral", "sky"];
    for (var i = 0; i < total; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = (240 + Math.random() * 420) * (strong ? 1.2 : 1);
      var life = 0.3 + Math.random() * 0.32;
      spawn({
        x: x, y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 160,
        size: 1.6 + Math.random() * 2.2,
        color: pick(palette),
        life: life, maxLife: life,
        streak: true,
        glow: true,
        drag: 0.94
      });
    }
    if (!reducedMotion()) {
      shockwave(x, y, "mustard", 6, 120, 0.4);
      shockwave(x, y, "paper", 3, 70, 0.34);
      if (strong) shockwave(x, y, "coral", 3, 150, 0.5);
    }
  }

  /* Klasik patlama: tema renkli kıvılcımlar, süsler ve altın unlock. */
  function burstClassic(x, y, strong) {
    init();
    var power = strong ? 1.35 : 1;
    var palette = themePalette();
    if (!reducedMotion()) {
      for (var i = 0; i < (strong ? 16 : 9); i++) {
        var angle = Math.random() * Math.PI * 2;
        var speed = (70 + Math.random() * 210) * power;
        var life = 0.5 + Math.random() * 0.5;
        spawn({
          x: x, y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 40,
          gravity: 520,
          size: 3 + Math.random() * 4,
          color: pick(palette),
          life: life, maxLife: life,
          round: true,
          glow: true,
          drag: 0.98
        });
      }
    }
    themeExtras(x, y, power);
    if (hasUnlock("fx:gold")) {
      var goldCount = reducedMotion() ? 2 : (strong ? 22 : 12);
      for (var g = 0; g < goldCount; g++) {
        var ga = Math.random() * Math.PI * 2;
        var gs = 90 + Math.random() * 300;
        var gl = 0.7 + Math.random() * 0.7;
        spawn({
          x: x, y: y,
          vx: Math.cos(ga) * gs,
          vy: Math.sin(ga) * gs - 80,
          gravity: 520,
          size: 3 + Math.random() * 4,
          color: Math.random() < 0.7 ? "#f4b72a" : "#fff3c4",
          life: gl, maxLife: gl,
          round: true,
          glow: true,
          drag: 0.96
        });
      }
    }
    if (hasUnlock("fx:confetti") && strong) confetti();
  }

  /* Patlama anında seçilen efekti çalıştırır. */
  function clearBurst(x, y, strong) {
    init();
    var style = fxPack.burst;
    if (style === "pixel") { burstPixels(x, y, strong); return; }
    if (style === "bubble") { burstBubbles(x, y, strong); return; }
    if (style === "spark") { burstSparks(x, y, strong); return; }
    burstClassic(x, y, strong);
  }

  /* Merkezden yayılan altın ışık huzmeleri (DOM katmanı). Zafer anında
     sonuç kartının arkasında döner; bir buçuk saniyede söner. */
  function rays(x, y) {
    if (!document.body || reducedMotion()) return;
    var el = document.createElement("div");
    el.className = "fx-rays";
    el.setAttribute("aria-hidden", "true");
    el.style.left = (x == null ? window.innerWidth / 2 : x) + "px";
    el.style.top = (y == null ? window.innerHeight * 0.42 : y) + "px";
    document.body.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 1900);
  }

  /* Zafer şöleni: seçilen kazanma efektine yönlendirir. */
  function victory() {
    init();
    if (reducedMotion()) {
      flash("cross");
      return;
    }
    if (fxPack.win === "fireworks") { victoryFireworks(); return; }
    if (fxPack.win === "stars") { victoryStars(); return; }
    if (fxPack.win === "bubbles") { victoryBubbles(); return; }
    victoryConfetti();
  }

  /* Konfeti: dört dalga konfeti, alt köşelerden altın kıvılcımlar,
     merkezden yayılan halkalar, ışık huzmeleri ve yıldız parıltıları. */
  function victoryConfetti() {
    var width = window.innerWidth;
    var height = window.innerHeight;
    var palette = [
      COLORS.coral, COLORS.cobalt, COLORS.mustard, COLORS.mint, COLORS.grape, COLORS.sky,
      COLORS.lime, COLORS.rose, COLORS.teal
    ];
    [0, 240, 520, 820].forEach(function (delay, wave) {
      setTimeout(function () {
        var count = wave === 3 ? 46 : 70;
        for (var i = 0; i < count; i++) {
          var life = 1.4 + Math.random() * 1.4;
          spawn({
            x: width * (0.03 + Math.random() * 0.94),
            y: -30 - Math.random() * 160,
            vx: (Math.random() - 0.5) * (150 + wave * 55),
            vy: 90 + Math.random() * 250,
            gravity: 300,
            size: 4 + Math.random() * 6,
            color: palette[Math.floor(Math.random() * palette.length)],
            life: life, maxLife: life,
            round: Math.random() < 0.35,
            rot: Math.random() * Math.PI,
            vr: (Math.random() - 0.5) * 12,
            drag: 0.995
          });
        }
      }, delay);
    });
    /* Alt köşelerden yukarı fışkıran altın kıvılcımlar. */
    [[0.04, 0.98], [0.96, 0.98]].forEach(function (corner, index) {
      setTimeout(function () {
        for (var i = 0; i < 30; i++) {
          var life = 0.9 + Math.random() * 0.7;
          spawn({
            x: width * corner[0],
            y: height * corner[1],
            vx: (corner[0] < 0.5 ? 1 : -1) * (60 + Math.random() * 250),
            vy: -(260 + Math.random() * 380),
            gravity: 700,
            size: 3 + Math.random() * 4,
            color: Math.random() < 0.5 ? COLORS.mustard : COLORS.paper,
            life: life, maxLife: life,
            round: true,
            glow: true,
            drag: 0.99
          });
        }
      }, 120 + index * 90);
    });
    /* Merkezde patlayan yıldız parıltısı: iki tur, hafif gecikmeli. */
    [0, 300].forEach(function (delay, round) {
      setTimeout(function () {
        var cx = width * (round ? 0.5 : 0.5);
        var cy = height * (round ? 0.34 : 0.4);
        for (var i = 0; i < 26; i++) {
          var angle = (Math.PI * 2 * i) / 26 + Math.random() * 0.16;
          var speed = 120 + Math.random() * 260;
          var life = 0.7 + Math.random() * 0.6;
          spawn({
            x: cx, y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            gravity: 180,
            size: 4 + Math.random() * 5,
            color: Math.random() < 0.65 ? COLORS.mustard : COLORS.paper,
            life: life, maxLife: life,
            round: true,
            glow: true,
            drag: 0.96
          });
        }
      }, delay);
    });
    shockwave(width / 2, height * 0.38, "mustard", 24, Math.min(width, height) * 0.7, 0.85);
    shockwave(width / 2, height * 0.38, "coral", 10, Math.min(width, height) * 0.5, 0.7);
    setTimeout(function () {
      shockwave(width / 2, height * 0.36, "paper", 8, Math.min(width, height) * 0.55, 0.75);
    }, 260);
    rays(width / 2, height * 0.4);
    flash("cross");
  }

  /* Havai fişek: gökyüzünde sırayla patlayan renkli halkalar ve ışık
     çizgileri; her patlamada kısa bir şok dalgası yayılır. */
  function victoryFireworks() {
    var width = window.innerWidth;
    var height = window.innerHeight;
    var palette = [
      COLORS.coral, COLORS.mustard, COLORS.mint, COLORS.sky, COLORS.grape,
      COLORS.rose, COLORS.lime, COLORS.teal, COLORS.paper
    ];
    var spots = [
      [0.22, 0.24, 0], [0.66, 0.18, 230], [0.42, 0.42, 470],
      [0.82, 0.36, 700], [0.16, 0.48, 930], [0.56, 0.28, 1160]
    ];
    spots.forEach(function (spot) {
      setTimeout(function () {
        var cx = width * spot[0];
        var cy = height * spot[1];
        var hue = palette[Math.floor(Math.random() * palette.length)];
        var sparks = 26 + Math.floor(Math.random() * 14);
        for (var i = 0; i < sparks; i++) {
          var angle = (Math.PI * 2 * i) / sparks + Math.random() * 0.12;
          var speed = 110 + Math.random() * 240;
          var life = 0.85 + Math.random() * 0.75;
          spawn({
            x: cx, y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            gravity: 130,
            size: 2.2 + Math.random() * 2.4,
            color: Math.random() < 0.78 ? hue : COLORS.paper,
            life: life, maxLife: life,
            streak: true,
            glow: true,
            drag: 0.952
          });
        }
        shockwave(cx, cy, hue, 6, Math.min(width, height) * 0.24, 0.62);
        flash("cross");
      }, spot[2]);
    });
    /* Gökyüzüne yükselen roket izleri. */
    for (var r = 0; r < 5; r++) {
      var life = 0.7 + Math.random() * 0.4;
      spawn({
        x: width * (0.15 + Math.random() * 0.7),
        y: height * 0.9,
        vx: (Math.random() - 0.5) * 60,
        vy: -(520 + Math.random() * 260),
        gravity: 220,
        size: 2.4,
        color: COLORS.paper,
        life: life, maxLife: life,
        streak: true,
        glow: true,
        drag: 0.99,
        delay: r * 0.12
      });
    }
  }

  /* Yıldız: ekranın dört bir yanında parıldayan yıldızlar ve merkezden
     yayılan altın ışık. */
  function victoryStars() {
    var width = window.innerWidth;
    var height = window.innerHeight;
    var palette = [COLORS.mustard, "#fff3c4", COLORS.paper, COLORS.sky, COLORS.rose];
    for (var i = 0; i < 34; i++) {
      var life = 1.2 + Math.random() * 1.1;
      spawn({
        x: width * (0.06 + Math.random() * 0.88),
        y: height * (0.08 + Math.random() * 0.62),
        vx: (Math.random() - 0.5) * 34,
        vy: -(8 + Math.random() * 46),
        gravity: -14,
        size: 9 + Math.random() * 16,
        color: palette[Math.floor(Math.random() * palette.length)],
        life: life, maxLife: life,
        star: true,
        glow: true,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 1.8,
        drag: 0.994,
        delay: Math.random() * 0.55
      });
    }
    /* Merkezde büyüyen altın yıldız ve halkalar. */
    spawn({
      x: width / 2, y: height * 0.36,
      vx: 0, vy: 0,
      gravity: 0,
      size: Math.min(width, height) * 0.3,
      color: COLORS.mustard,
      life: 1.05, maxLife: 1.05,
      star: true,
      glow: true,
      rot: 0,
      vr: 0.7,
      drag: 1
    });
    shockwave(width / 2, height * 0.36, "mustard", 18, Math.min(width, height) * 0.62, 0.8);
    shockwave(width / 2, height * 0.36, "paper", 8, Math.min(width, height) * 0.45, 0.66);
    rays(width / 2, height * 0.38);
    flash("cross");
  }

  /* Baloncuk: alttan yükselen renkli kabarcıklar; bir kısmı havada
     patlayarak küçük damlalar bırakır. */
  function victoryBubbles() {
    var width = window.innerWidth;
    var height = window.innerHeight;
    var palette = ["#8fd0ff", "#bfe4ff", "#f7a8d4", "#a7e8c4", "#ffe3a3", "#d7c4ff"];
    for (var i = 0; i < 40; i++) {
      var life = 1.4 + Math.random() * 1.4;
      var size = 12 + Math.random() * 34;
      spawn({
        x: width * (0.05 + Math.random() * 0.9),
        y: height * (0.85 + Math.random() * 0.2),
        vx: (Math.random() - 0.5) * 50,
        vy: -(90 + Math.random() * 150),
        gravity: -26,
        size: size,
        color: palette[Math.floor(Math.random() * palette.length)],
        life: life, maxLife: life,
        bubble: true,
        wobble: 1.2 + Math.random() * 2.2,
        phase: Math.random() * Math.PI * 2,
        drag: 0.996,
        delay: Math.random() * 0.9
      });
    }
    /* Havada patlayan birkaç baloncuk: çevresine küçük damlalar saçılır. */
    [0.28, 0.52, 0.74].forEach(function (at, index) {
      setTimeout(function () {
        var bx = width * at;
        var by = height * (0.3 + Math.random() * 0.2);
        for (var d = 0; d < 12; d++) {
          var angle = Math.random() * Math.PI * 2;
          var speed = 60 + Math.random() * 160;
          var life = 0.4 + Math.random() * 0.4;
          spawn({
            x: bx, y: by,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            gravity: 260,
            size: 2.5 + Math.random() * 3,
            color: "#ffffff",
            life: life, maxLife: life,
            round: true,
            glow: true,
            drag: 0.96
          });
        }
        shockwave(bx, by, "#bfe4ff", 4, 70, 0.42);
      }, 420 + index * 340);
    });
    flash("cross");
  }

  /* Yenilgi: kararan kenarlar, ağırlaşan gri kırıntılar ve kısa sarsıntı. */
  function defeat() {
    if (!document.body) return;
    if (!reducedMotion()) {
      var dark = document.createElement("div");
      dark.className = "fx-vignette";
      dark.setAttribute("aria-hidden", "true");
      document.body.appendChild(dark);
      setTimeout(function () {
        if (dark.parentNode) dark.parentNode.removeChild(dark);
      }, 1500);
      var width = window.innerWidth;
      var height = window.innerHeight;
      for (var i = 0; i < 26; i++) {
        var life = 1 + Math.random() * 0.7;
        spawn({
          x: width * (0.2 + Math.random() * 0.6),
          y: height * 0.55 + Math.random() * 40,
          vx: (Math.random() - 0.5) * 90,
          vy: -(40 + Math.random() * 150),
          gravity: 420,
          size: 3 + Math.random() * 5,
          color: Math.random() < 0.5 ? COLORS.stone : "#4a4458",
          life: life, maxLife: life,
          round: Math.random() < 0.4,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 8,
          drag: 0.99
        });
      }
      screenShake(2);
    }
    flash("lose");
  }

  function start() {
    if (raf) return;
    var last = performance.now();
    raf = requestAnimationFrame(function frame(now) {
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(dt);
      if (particles.length || texts.length) {
        raf = requestAnimationFrame(frame);
      } else {
        raf = 0;
        if (ctx) ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }
    });
  }

  function step(dt) {
    if (!ctx) return;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      /* Gecikmeli parçacıklar satır/sütun boyunca sırayla patlar. */
      if (p.delay > 0) {
        p.delay -= dt;
        if (p.delay > 0) continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.vx *= p.drag == null ? 0.99 : p.drag;
      p.vy += (p.gravity || 0) * dt;
      if (p.wobble) {
        p.phase += dt * 2.2;
        p.x += Math.sin(p.phase) * p.wobble * dt * 22;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.rot != null) p.rot += (p.vr || 0) * dt;

      var fade = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.globalAlpha = fade;
      if (p.ring) {
        var progress = 1 - fade;
        var radius = p.size + (p.grow || 70) * progress;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1.5, 7 * (1 - progress));
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = fade * 0.55;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * 0.68, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      if (p.bubble) {
        var radius = p.size * 0.5;
        ctx.save();
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.6;
        ctx.globalAlpha = fade * 0.85;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = fade * 0.18;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * 0.94, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = fade * 0.7;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(p.x - radius * 0.34, p.y - radius * 0.36, Math.max(1, radius * 0.22), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
      if (p.star) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot || 0);
        ctx.fillStyle = p.color;
        if (p.glow) {
          ctx.shadowColor = p.color;
          ctx.shadowBlur = Math.min(30, p.size * 1.6);
        }
        var outer = p.size * 0.5;
        var inner = outer * 0.44;
        ctx.beginPath();
        for (var s = 0; s < 10; s++) {
          var rad = s % 2 ? inner : outer;
          var ang = (Math.PI * 2 * s) / 10 - Math.PI / 2;
          if (s === 0) ctx.moveTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
          else ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        continue;
      }
      if (p.streak) {
        var speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        var len = Math.max(p.size, Math.min(30, speed * 0.045));
        var ux = speed > 0.01 ? p.vx / speed : 0;
        var uy = speed > 0.01 ? p.vy / speed : 0;
        ctx.save();
        ctx.strokeStyle = p.color;
        ctx.lineCap = "round";
        ctx.lineWidth = p.size;
        if (p.glow) {
          ctx.shadowColor = p.color;
          ctx.shadowBlur = Math.min(22, p.size * 3);
        }
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - ux * len, p.y - uy * len);
        ctx.stroke();
        ctx.restore();
        continue;
      }
      ctx.fillStyle = p.color;
      if (p.leaf) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot || 0);
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size * 0.5, p.size * 0.26, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(28, 27, 46, 0.22)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-p.size * 0.46, 0);
        ctx.lineTo(p.size * 0.46, 0);
        ctx.stroke();
        ctx.restore();
      } else if (p.round) {
        if (p.glow) {
          ctx.save();
          ctx.shadowColor = p.color;
          ctx.shadowBlur = Math.min(26, p.size * 2.6);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot || 0);
        ctx.fillRect(-p.size * 0.5, -p.size * 0.5, p.size, p.size * 0.6);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  function floatText(x, y, message, variant) {
    init();
    var el = document.createElement("span");
    el.className = "fx-text" + (variant ? " " + variant : "");
    el.textContent = message;
    el.style.left = x + "px";
    el.style.top = y + "px";
    document.body.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 1100);
  }

  /* Patlama anında ekranın tamamına kısa bir renk parlaması verir. */
  function flash(variant) {
    if (!document.body) return;
    var el = document.createElement("div");
    el.className = "fx-flash" + (variant ? " " + variant : "");
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 460);
  }

  function shake(element) {
    if (!element) return;
    element.classList.remove("fx-shake");
    void element.offsetWidth;
    element.classList.add("fx-shake");
    setTimeout(function () { element.classList.remove("fx-shake"); }, 420);
  }

  function pulse(element) {
    if (!element) return;
    element.classList.remove("fx-pulse");
    void element.offsetWidth;
    element.classList.add("fx-pulse");
    setTimeout(function () { element.classList.remove("fx-pulse"); }, 360);
  }

  /* Hafif ekran sarsıntısı: güç 1-3 arası. Tahtayı sarsan shake'ten farklı
     olarak tüm sayfayı bir an titretir; satır/sütun patlamasını hissettirir. */
  function screenShake(power) {
    var rootEl = document.documentElement;
    if (!rootEl) return;
    power = Math.max(1, Math.min(3, Number(power) || 1));
    rootEl.style.setProperty("--shake-power", (power * 2.5) + "px");
    rootEl.classList.remove("screen-shake");
    void rootEl.offsetWidth;
    rootEl.classList.add("screen-shake");
    setTimeout(function () { rootEl.classList.remove("screen-shake"); }, 480);
  }

  function vibrate(ms) {
    try {
      if (Array.isArray(ms)) {
        if (navigator.vibrate) { navigator.vibrate(ms); return; }
        ms = ms[0];
      }
      if (root.BlokIkiServer && typeof root.BlokIkiServer.vibrate === "function") {
        root.BlokIkiServer.vibrate(ms);
        return;
      }
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch (error) { /* yoksay */ }
  }

  root.BlokFx = {
    init: init,
    burst: burst,
    debris: debris,
    shockwave: shockwave,
    ghostCell: ghostCell,
    confetti: confetti,
    clearBurst: clearBurst,
    setTheme: setTheme,
    setUnlocks: setUnlocks,
    setFxPack: setFxPack,
    victory: victory,
    rays: rays,
    defeat: defeat,
    floatText: floatText,
    flash: flash,
    shake: shake,
    pulse: pulse,
    screenShake: screenShake,
    vibrate: vibrate,
    color: color
  };
})(typeof self !== "undefined" ? self : this);
