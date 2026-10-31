/* Blok İki — görsel efektler: parçacık, uçan puan, sarsıntı, konfeti.
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

  function confetti() {
    init();
    var palette = [COLORS.coral, COLORS.cobalt, COLORS.mustard, COLORS.mint, COLORS.grape, COLORS.sky];
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

      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.fillStyle = p.color;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
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
    confetti: confetti,
    floatText: floatText,
    shake: shake,
    pulse: pulse,
    vibrate: vibrate,
    color: color
  };
})(typeof self !== "undefined" ? self : this);
