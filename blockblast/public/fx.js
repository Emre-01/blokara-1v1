/* Blokara 1v1 — görsel efekt motoru.
   Tek canvas, tek kare döngüsü. Efektler public/fx-catalog.js dosyasındaki
   tariflerden üretilir; burada yalnızca yorumlayıcı ve çizim vardır.

   Akıcılık için:
   - Parçacıklar havuzdan yeniden kullanılır (çöp toplama baskısı yok).
   - Aynı karede önce hâleler (tek geçiş, "lighter"), sonra gövdeler çizilir.
   - Hâle için canvas gölgesi (shadowBlur) yerine önceden üretilmiş sprite
     kullanılır; mobilde en pahalı çizim yolu böylece devre dışı kalır.
   - Ekran dışına çıkan parçacık çizilmez, kare bütçesi aşılırsa yenisi eklenmez.
   - Efekt bitince döngü tamamen durur. */
(function (root) {
  "use strict";

  var CAT = root.BLOK_FX_CATALOG || { burst: [], win: [], byId: {}, groups: {}, party: [] };

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
    paper: "#f3ead8",
    cream: "#fff3c4",
    gold: "#f4b72a",
    white: "#ffffff"
  };

  /* Tema paletleri: "theme" renk listesi ve tema blok renkleri aynı
     kaynaktan gelir; böylece parçacıklar da temayla değişir. */
  var THEME_BLOCKS = {
    workshop: { coral: "#f2553d", cobalt: "#2f55e8", mustard: "#f4b72a", mint: "#2da98d", grape: "#8c5bff", sky: "#3aa6d8", lime: "#8fc93a", rose: "#e8488f", teal: "#23c3b0" },
    mint: { coral: "#12b886", cobalt: "#2f8fe8", mustard: "#fcc419", mint: "#63e6be", grape: "#5f7bd6", sky: "#4dabf7", lime: "#a9e34b", rose: "#ff8cc8", teal: "#38d9a9" },
    ocean: { coral: "#1c7ed6", cobalt: "#5c7cfa", mustard: "#fcc419", mint: "#22b8cf", grape: "#748ffc", sky: "#4dabf7", lime: "#66d9e8", rose: "#e599f7", teal: "#38d9a9" },
    sunset: { coral: "#f03e3e", cobalt: "#9775fa", mustard: "#ffd43b", mint: "#ff922b", grape: "#c77dff", sky: "#ff6b6b", lime: "#ffc078", rose: "#f06595", teal: "#ffa94d" },
    autumn: { coral: "#d9480f", cobalt: "#8b6b4a", mustard: "#f08c00", mint: "#6b8e23", grape: "#8b4513", sky: "#a0522d", lime: "#cd853f", rose: "#b8860b", teal: "#9c6b30" },
    cotton: { coral: "#f0489e", cobalt: "#b197fc", mustard: "#ffd43b", mint: "#63e6be", grape: "#d0bfff", sky: "#74c0fc", lime: "#b2f2bb", rose: "#ffa8c8", teal: "#96f2d7" }
  };

  var THEME_COLORS = {
    workshop: ["#f2553d", "#2f55e8", "#f4b72a", "#2da98d", "#8c5bff", "#3aa6d8"],
    mint: ["#12b886", "#2f8fe8", "#fcc419", "#63e6be", "#5f7bd6", "#4dabf7"],
    ocean: ["#1c7ed6", "#5c7cfa", "#fcc419", "#22b8cf", "#748ffc", "#4dabf7"],
    sunset: ["#f03e3e", "#9775fa", "#ffd43b", "#ff922b", "#c77dff", "#ff6b6b"],
    autumn: ["#d9480f", "#8b6b4a", "#f08c00", "#6b8e23", "#8b4513", "#a0522d"],
    cotton: ["#f0489e", "#b197fc", "#ffd43b", "#63e6be", "#d0bfff", "#74c0fc"]
  };

  var canvas = null;
  var ctx = null;
  var dpr = 1;
  var raf = 0;
  var theme = "workshop";
  var unlocks = {};
  var fxPack = { burst: "classic", win: "confetti" };
  var particles = [];
  var pool = [];
  var maxParticles = 300;
  var glowCache = Object.create(null);
  var motionQuery = typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

  function reducedMotion() {
    return !!(motionQuery && motionQuery.matches);
  }

  function color(name) {
    if (!name) return COLORS.ink;
    /* Blok adları (coral, mint…) temanın kendi paletinden çözülür ki
       kırıntılar ve hâleler tahtadaki kutularla aynı rengi kullansın. */
    var blocks = THEME_BLOCKS[theme];
    if (blocks && blocks[name]) return blocks[name];
    return COLORS[name] || name;
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function range(value, fallback) {
    if (Array.isArray(value)) return rand(value[0], value[1]);
    if (typeof value === "number") return value;
    return fallback;
  }

  function rawRange(value, fallback) {
    if (Array.isArray(value)) return value;
    if (typeof value === "number") return [value, value];
    return fallback;
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

  /* ---------------- canvas ---------------- */

  function init() {
    if (canvas) return;
    canvas = document.createElement("canvas");
    canvas.id = "fx-canvas";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
    resize();
    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) clear();
    });
  }

  function resize() {
    if (!canvas) return;
    /* Yüksek DPR ekranlarda tam çözünürlük, parçacık çiziminde gereksiz
       maliyet demek; 1.5 ile keskinlik ve hız dengelenir. Zayıf cihazlarda
       çözünürlük ve parçacık bütçesi daha da düşürülür. */
    var memory = Number(navigator.deviceMemory || 0);
    var cores = Number(navigator.hardwareConcurrency || 0);
    var weak = (memory && memory <= 4) || (cores && cores <= 4);
    dpr = Math.min(weak ? 1.25 : 1.5, window.devicePixelRatio || 1);
    var w = window.innerWidth;
    var h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (weak) maxParticles = 170;
    else maxParticles = w * h > 520000 ? 380 : 280;
  }

  function clear() {
    particles.length = 0;
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    if (ctx) ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    if (canvas) canvas.classList.remove("is-live");
  }

  /* ---------------- parçacık havuzu ---------------- */

  function take() {
    return pool.length ? pool.pop() : {};
  }

  function release(index) {
    var p = particles[index];
    var last = particles.pop();
    if (index < particles.length) particles[index] = last;
    if (p && pool.length < 420) pool.push(p);
  }

  function spawn(particle) {
    init();
    if (particles.length >= maxParticles) return null;
    var p = take();
    for (var key in particle) {
      if (Object.prototype.hasOwnProperty.call(particle, key)) p[key] = particle[key];
    }
    p.fade = 1;
    p.delay = p.delay || 0;
    particles.push(p);
    start();
    return p;
  }

  /* ---------------- tarif yorumlayıcısı ---------------- */

  function paletteFor(spec) {
    if (Array.isArray(spec.colors)) return spec.colors.map(color);
    if (spec.colors === "theme") return themePalette();
    if (spec.colors === "themeInk") return themePalette().concat([COLORS.paper, COLORS.ink, COLORS.mustard]);
    if (spec.colors === "party") return (CAT.party && CAT.party.length ? CAT.party : Object.keys(COLORS).map(function (k) { return COLORS[k]; }));
    return [COLORS.paper];
  }

  function countFor(count, strong) {
    if (Array.isArray(count)) return Math.round(strong ? count[1] : count[0]);
    return Math.round(typeof count === "number" ? count : 10);
  }

  function spawnPiece(spec, x, y, colorValue, delay, orbit) {
    var angle;
    if (spec.angle === "up") angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
    else if (spec.angle === "down") angle = Math.PI / 2 + (Math.random() - 0.5) * 0.8;
    else angle = Math.random() * Math.PI * 2;
    if (spec.angle === "tangent" && orbit != null) angle = orbit + Math.PI / 2;

    var speed = range(spec.speed, 160);
    var life = range(spec.life, 0.7);
    var spinSpeed = range(spec.spin, 0);
    var wobble = range(spec.wobble, 0);
    var size = range(spec.size, 4);
    var gravity = spec.gravity == null ? 520 : spec.gravity;
    var drag = spec.drag == null ? 0.99 : spec.drag;

    spawn({
      shape: spec.shape || "spark",
      x: x, y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (spec.lift == null ? 0 : spec.lift),
      gravity: gravity,
      drag: drag,
      size: size,
      color: colorValue,
      life: life, maxLife: life,
      glow: !!spec.glow,
      rot: Math.random() * Math.PI,
      spin: spinSpeed,
      wobble: wobble,
      phase: Math.random() * Math.PI * 2,
      delay: delay
    });
  }

  function emit(spec, px, py, strong, rec) {
    var total = countFor(spec.count, strong);
    if (reducedMotion()) total = Math.min(total, 2);
    if (total <= 0) return;

    var palette = paletteFor(spec);
    var waves = Math.max(1, spec.repeat || 1);
    var gap = spec.gap || 0;
    var perWave = Math.max(1, Math.round(total / waves));

    var batches;
    if (spec.spots && spec.spots.length) {
      var stagger = spec.stagger || 0;
      batches = spec.spots.map(function (spot, index) {
        return {
          x: window.innerWidth * spot[0],
          y: window.innerHeight * spot[1],
          delay: index * stagger,
          color: pick(palette)
        };
      });
    } else {
      batches = [{
        x: spec.centerX != null ? window.innerWidth / 2 : px,
        y: spec.centerY != null ? window.innerHeight * spec.centerY : py,
        delay: 0,
        color: null
      }];
    }

    batches.forEach(function (batch) {
      if (batch.color && spec.spotRing) {
        ring({
          color: batch.color,
          radius: spec.spotRing.radius,
          grow: spec.spotRing.grow,
          life: spec.spotRing.life,
          delay: batch.delay
        }, batch.x, batch.y);
      }
      for (var w = 0; w < waves; w++) {
        var waveDelay = batch.delay + w * gap;
        for (var i = 0; i < perWave; i++) {
          var ox = batch.x;
          var oy = batch.y;
          var orbit = null;

          if (spec.from === "top") {
            var tx0 = spec.area ? spec.area[0] : 0.05;
            var tx1 = spec.area ? spec.area[1] : 0.95;
            ox = window.innerWidth * rand(tx0, tx1);
            oy = -24 - Math.random() * window.innerHeight * 0.12;
          } else if (spec.from === "bottom") {
            var bx0 = spec.area ? spec.area[0] : 0.05;
            var bx1 = spec.area ? spec.area[1] : 0.95;
            var by0 = spec.area ? spec.area[2] : 0.85;
            var by1 = spec.area ? spec.area[3] : 1.02;
            ox = window.innerWidth * rand(bx0, bx1);
            oy = window.innerHeight * rand(by0, by1);
          } else if (spec.radius) {
            orbit = Math.random() * Math.PI * 2;
            var distance = Math.min(window.innerWidth, window.innerHeight) * rand(spec.radius[0], spec.radius[1]);
            ox += Math.cos(orbit) * distance;
            oy += Math.sin(orbit) * distance;
          } else {
            var sx = spec.spread ? spec.spread[0] : 0;
            var sy = spec.spread ? spec.spread[1] : 0;
            if (sx) ox += (Math.random() - 0.5) * sx;
            if (sy) oy += (Math.random() - 0.5) * sy;
          }

          var wait = waveDelay + (spec.delay || 0) + (spec.delayJitter ? Math.random() * spec.delayJitter : 0);
          spawnPiece(spec, ox, oy, batch.color || pick(palette), wait, orbit);
        }
      }
    });

    /* Önceki sürümlerdeki altın/konfeti ekleri reklamla açılan süslerdi. */
    if (rec && rec.bonusUnlock && strong && hasUnlock(rec.bonusUnlock)) {
      bonusBurst(px, py);
    }
  }

  function ring(spec, x, y) {
    if (reducedMotion()) return;
    var life = spec.life || 0.45;
    spawn({
      shape: "ring",
      x: x, y: y,
      size: Math.max(2, spec.radius || 6),
      grow: spec.grow || 90,
      color: color(spec.color),
      life: life, maxLife: life,
      delay: spec.delay || 0
    });
  }

  function bonusBurst(x, y) {
    var total = reducedMotion() ? 2 : 14;
    for (var i = 0; i < total; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 90 + Math.random() * 300;
      var life = 0.7 + Math.random() * 0.7;
      spawn({
        shape: "spark",
        x: x, y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 80,
        gravity: 520,
        drag: 0.96,
        size: 3 + Math.random() * 4,
        color: Math.random() < 0.7 ? COLORS.gold : COLORS.cream,
        life: life, maxLife: life,
        glow: true
      });
    }
  }

  /* Temaya özel ek parçacıklar: sonbaharda yaprak, pamuk şekerde bulut. */
  function themeExtras(x, y, power) {
    if (reducedMotion()) return;
    if (theme === "autumn") {
      emit({ shape: "leaf", count: 7, speed: [40, 170], size: [7, 14], gravity: 190, drag: 0.985, life: [0.9, 1.8], colors: THEME_COLORS.autumn, spin: [-4, 4], wobble: [0.8, 2], lift: 60 }, x, y, !!power);
      return;
    }
    if (theme === "cotton") {
      emit({ shape: "spark", count: 8, spread: [34, 20], speed: [20, 90], size: [7, 16], gravity: -18, drag: 0.995, life: [0.9, 1.8], colors: THEME_COLORS.cotton, glow: true, wobble: [1, 3], angle: "up" }, x, y, !!power);
      return;
    }
    emit({ shape: "spark", count: 4, speed: [40, 190], size: [2, 5], gravity: 520, drag: 0.97, life: [0.5, 1], colors: themePalette(), glow: true, lift: 40 }, x, y, !!power);
  }

  /* ---------------- genel giriş noktası ---------------- */

  function resolve(group, id) {
    var list = CAT.groups && CAT.groups[group];
    if (!list || !list.length) return null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return list[0];
  }

  /* Katalogdaki efekti çalıştırır. group: "burst" | "win" */
  function playEffect(group, id, options) {
    var rec = resolve(group, id);
    if (!rec || !rec.recipe) return false;
    init();
    var opts = options || {};
    var x = opts.x == null ? window.innerWidth / 2 : opts.x;
    var y = opts.y == null ? window.innerHeight / 2 : opts.y;
    var strong = !!opts.strong;
    var recipe = rec.recipe;

    if (!reducedMotion()) {
      (recipe.emitters || []).forEach(function (spec) { emit(spec, x, y, strong, rec); });
      (recipe.rings || []).forEach(function (spec) {
        ring(spec,
          spec.centerY != null ? window.innerWidth / 2 : x,
          spec.centerY != null ? window.innerHeight * spec.centerY : y);
      });
      if (recipe.themeExtras) themeExtras(x, y, strong);
      if (recipe.rays) rays(x, recipe.raysY != null ? window.innerHeight * recipe.raysY : y);
      if (recipe.flash) flash(group === "win" ? "cross" : "burst");
    } else {
      /* Hareket duyarlılığı: yalnızca iki parçacık ve kısa bir parlama. */
      var first = (recipe.emitters || [])[0];
      if (first) emit(first, x, y, false, rec);
      if (group === "win") flash("cross");
    }
    return true;
  }

  /* ---------------- eski API (tahta geri bildirimi) ---------------- */

  function burst(x, y, name, count, spread) {
    emit({
      shape: "spark",
      count: count || 14,
      speed: [90, 310],
      size: [2.5, 7],
      gravity: 620,
      drag: 0.985,
      life: [0.45, 0.9],
      colors: [color(name)],
      lift: 60
    }, x, y, false, null);
    void spread;
  }

  /* Bir hücrenin renkli kırıntıları: satır/sütun patlamasında blokların
     dağılan parçalarını gösterir. */
  function debris(x, y, name, count, power, cellSize, delay) {
    var names = Array.isArray(name) ? name.map(color) : [color(name)];
    var base = Math.max(6, cellSize || 12);
    emit({
      shape: "rect",
      count: count || 10,
      speed: [70, 310],
      size: [Math.max(3, base * 0.14), Math.max(4, base * 0.44)],
      gravity: 780,
      drag: 0.992,
      life: [0.5, 1.1],
      colors: names,
      spin: [8, 16],
      delay: Math.max(0, Number(delay) || 0),
      delayJitter: 0.08,
      lift: 80
    }, x, y, !!power, null);
  }

  /* Halka şeklinde şok dalgası; patlama merkezinden dışa yayılır. */
  function shockwave(x, y, name, radius, grow, duration) {
    ring({ color: color(name), radius: radius, grow: grow, life: duration || 0.48 }, x, y);
  }

  /* Patlayan hücrenin kendisini kısa süre gösterip parçalar. */
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
    emit({
      shape: "rect",
      count: 90,
      from: "top",
      area: [0.15, 0.85, 0, 0.1],
      speed: [120, 340],
      size: [4, 9],
      gravity: 340,
      drag: 0.995,
      life: [1.1, 2.2],
      colors: "party",
      spin: [5, 14]
    }, 0, 0, false, null);
  }

  /* Patlama anında seçilen efekti çalıştırır. */
  function clearBurst(x, y, strong) {
    return playEffect("burst", fxPack.burst, { x: x, y: y, strong: !!strong });
  }

  function victory() {
    return playEffect("win", fxPack.win, {
      x: window.innerWidth / 2,
      y: window.innerHeight * 0.36
    });
  }

  /* Merkezden yayılan altın ışık huzmeleri (DOM katmanı). */
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
      emit({
        shape: "spark",
        count: 26,
        from: "bottom",
        area: [0.2, 0.8, 0.55, 0.62],
        speed: [40, 160],
        size: [3, 8],
        gravity: 420,
        drag: 0.99,
        life: [1, 1.7],
        colors: [COLORS.stone, "#4a4458"],
        angle: "up",
        lift: 40
      }, 0, 0, false, null);
      screenShake(2);
    }
    flash("lose");
  }

  /* ---------------- çizim ---------------- */

  function glowSprite(colorValue) {
    var cached = glowCache[colorValue];
    if (cached) return cached;
    var size = 64;
    var sprite = document.createElement("canvas");
    sprite.width = size;
    sprite.height = size;
    var sctx = sprite.getContext("2d");
    var gradient = sctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, colorValue);
    gradient.addColorStop(0.45, colorValue);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    sctx.globalAlpha = 0.85;
    sctx.fillStyle = gradient;
    sctx.fillRect(0, 0, size, size);
    glowCache[colorValue] = sprite;
    return sprite;
  }

  function start() {
    if (raf) return;
    if (canvas) canvas.classList.add("is-live");
    var last = performance.now();
    raf = requestAnimationFrame(function frame(now) {
      var dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      step(dt);
      if (particles.length) {
        raf = requestAnimationFrame(frame);
      } else {
        raf = 0;
        if (ctx) ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        if (canvas) canvas.classList.remove("is-live");
      }
    });
  }

  function step(dt) {
    if (!ctx) return;
    var w = window.innerWidth;
    var h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);

    /* 1) Güncelle ve ölüleri havuzdan geri al. */
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      if (p.delay > 0) {
        p.delay -= dt;
        if (p.delay > 0) continue;
        p.delay = 0;
      }
      p.life -= dt;
      if (p.life <= 0) {
        release(i);
        continue;
      }
      var drag = p.drag == null ? 0.99 : p.drag;
      p.vx *= drag;
      p.vy = p.vy * drag + (p.gravity || 0) * dt;
      if (p.wobble) {
        p.phase += dt * 2.2;
        p.x += Math.sin(p.phase) * p.wobble * dt * 22;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.spin) p.rot += p.spin * dt;
      p.fade = Math.max(0, Math.min(1, p.life / p.maxLife));
    }

    /* 2) Hâleler: tek geçiş, toplamalı karışım. */
    ctx.globalCompositeOperation = "lighter";
    for (var g = 0; g < particles.length; g++) {
      var q = particles[g];
      if (!q.glow || q.delay > 0) continue;
      if (q.x < -60 || q.x > w + 60 || q.y < -60 || q.y > h + 60) continue;
      var gr = q.size * (q.shape === "star" ? 0.95 : 1.15);
      ctx.globalAlpha = q.fade * 0.5;
      ctx.drawImage(glowSprite(q.color), q.x - gr, q.y - gr, gr * 2, gr * 2);
    }
    ctx.globalCompositeOperation = "source-over";

    /* 3) Gövdeler. */
    for (var d = 0; d < particles.length; d++) {
      var p2 = particles[d];
      if (p2.delay > 0) continue;
      if (p2.x < -60 || p2.x > w + 60 || p2.y < -60 || p2.y > h + 60) continue;
      ctx.globalAlpha = p2.fade;
      drawBody(p2);
    }
    ctx.globalAlpha = 1;
  }

  function drawBody(p) {
    if (p.shape === "ring") {
      var progress = 1 - p.fade;
      var radius = p.size + (p.grow || 90) * progress;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(1.5, 7 * (1 - progress));
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      /* İkinci ve üçüncü halka dalgaya derinlik verir. */
      ctx.globalAlpha *= 0.5;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius * 0.68, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha *= 0.55;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius * 1.2, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }

    if (p.shape === "bubble") {
      var br = p.size * 0.5;
      /* Yarı saydam gövde, parlak kenar ve iki ışık noktası. */
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.fade * 0.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, br * 0.96, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = p.fade * 0.9;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(1.4, br * 0.09);
      ctx.beginPath();
      ctx.arc(p.x, p.y, br, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = p.fade * 0.8;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(1, br * 0.07);
      ctx.beginPath();
      ctx.arc(p.x, p.y, br * 0.8, -2.5, -1.15);
      ctx.stroke();
      ctx.globalAlpha = p.fade * 0.88;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(p.x - br * 0.34, p.y - br * 0.36, Math.max(1, br * 0.2), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = p.fade * 0.55;
      ctx.beginPath();
      ctx.arc(p.x + br * 0.3, p.y + br * 0.34, Math.max(0.8, br * 0.1), 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (p.shape === "star") {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot || 0);
      ctx.fillStyle = p.color;
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
      /* Kontur ve iç ışıltı yıldızı düz bir lekeden ayırır. */
      ctx.strokeStyle = "rgba(28, 27, 46, 0.42)";
      ctx.lineWidth = Math.max(1, outer * 0.08);
      ctx.stroke();
      ctx.globalAlpha = p.fade * 0.55;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1, inner * 0.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    if (p.shape === "streak") {
      var speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      var len = Math.max(p.size, Math.min(30, speed * 0.045));
      var ux = speed > 0.01 ? p.vx / speed : 0;
      var uy = speed > 0.01 ? p.vy / speed : 0;
      ctx.strokeStyle = p.color;
      ctx.lineCap = "round";
      ctx.lineWidth = p.size;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - ux * len, p.y - uy * len);
      ctx.stroke();
      /* Beyaz çekirdek, izi ışık gibi parlatır. */
      ctx.globalAlpha = p.fade * 0.72;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(0.8, p.size * 0.42);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - ux * len * 0.62, p.y - uy * len * 0.62);
      ctx.stroke();
      return;
    }

    if (p.shape === "leaf") {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot || 0);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size * 0.5, p.size * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(28, 27, 46, 0.32)";
      ctx.lineWidth = Math.max(0.8, p.size * 0.05);
      ctx.stroke();
      /* Üst yarıya düşen ışık ve orta damar. */
      ctx.globalAlpha = p.fade * 0.3;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(-p.size * 0.08, -p.size * 0.07, p.size * 0.3, p.size * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = p.fade * 0.7;
      ctx.strokeStyle = "rgba(28, 27, 46, 0.42)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-p.size * 0.46, 0);
      ctx.lineTo(p.size * 0.46, 0);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (p.shape === "rect") {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot || 0);
      ctx.fillStyle = p.color;
      var rw = p.size;
      var rh = p.size * 0.62;
      ctx.fillRect(-rw * 0.5, -rh * 0.5, rw, rh);
      ctx.strokeStyle = "rgba(28, 27, 46, 0.26)";
      ctx.lineWidth = Math.max(0.7, p.size * 0.07);
      ctx.strokeRect(-rw * 0.5, -rh * 0.5, rw, rh);
      ctx.fillStyle = "rgba(255, 255, 255, 0.34)";
      ctx.fillRect(-rw * 0.5, -rh * 0.5, rw, Math.max(0.8, rh * 0.18));
      ctx.restore();
      return;
    }

    /* Kıvılcım: renkli gövde + beyaz çekirdek. */
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
    ctx.fill();
    if (p.size >= 4) {
      ctx.globalAlpha = p.fade * 0.6;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ---------------- DOM yardımcıları ---------------- */

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

  function screenShake(power) {
    if (reducedMotion()) return;
    var rootEl = document.getElementById("screen-game") || document.documentElement;
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
    playEffect: playEffect,
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
    color: color,
    clear: clear
  };
})(typeof self !== "undefined" ? self : this);
