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
  var motionQuery = typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

  /* Hareket duyarlılığı olan kullanıcılar için parçacık sayısını kıs. */
  function reducedMotion() {
    return !!(motionQuery && motionQuery.matches);
  }

  function color(name) {
    return COLORS[name] || name || COLORS.ink;
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

  /* Zafer şöleni: dört dalga konfeti, alt köşelerden altın kıvılcımlar,
     merkezden yayılan halkalar, ışık huzmeleri ve yıldız parıltıları.
     Sonuç ekranı açılırken çalışır. */
  function victory() {
    init();
    if (reducedMotion()) {
      flash("cross");
      return;
    }
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
      ctx.fillStyle = p.color;
      if (p.round) {
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
