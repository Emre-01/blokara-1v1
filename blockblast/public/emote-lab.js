(function () {
  "use strict";
  var E = window.BlokEmotes;
  var LABELS = { laugh: "Gülme", clap: "Alkış", cry: "Ağlama", angry: "Kızma", love: "Sevgi", cool: "Havalı" };
  var NOTES = {
    laugh: "Gövde zıplar, ağız kahkahayla açılıp kapanır, yanaklar şişer.",
    clap: "İki eldiven el ortada buluşur; temas anında kıvılcım ve yüzde ufak sarsıntı.",
    cry: "İri gözler, yanaktan akan damlalar ve hıçkırıkla titreyen ağız.",
    angry: "Çatık kaş, kısık göz, kenetlenmiş dişler; buhar tüter, damar atar.",
    love: "Kalp gözler, uçuşan kalpler ve kalp atışıyla büyüyen yüz.",
    cool: "Kalın güneş gözlüğü, yan gülüş; baş sallanırken camda ışık gezer."
  };

  var stage = document.getElementById("stage");
  var picker = document.getElementById("picker");
  var tiles = document.getElementById("tiles");
  var title = document.getElementById("stage-title");
  var note = document.getElementById("stage-note");
  var animList = document.getElementById("anim-list");
  var playBtn = document.getElementById("play");
  var restartBtn = document.getElementById("restart");
  var speed = document.getElementById("speed");
  var speedOut = document.getElementById("speed-out");
  var scrub = document.getElementById("scrub");
  var scrubOut = document.getElementById("scrub-out");
  var size = document.getElementById("size");
  var sizeOut = document.getElementById("size-out");
  var bgBtn = document.getElementById("bg");
  var checkerBtn = document.getElementById("checker");
  var quietBtn = document.getElementById("quiet");

  var current = "clap";
  var playing = true;
  var rate = 1;
  var BASE = 1700;

  function animations() {
    return stage.getAnimations({ subtree: true });
  }

  function tileHTML(kind) {
    return '<button class="lab-pick" type="button" data-kind="' + kind + '" aria-pressed="false">' +
      '<span class="lab-pick-art" aria-hidden="true">' + E.art(kind) + "</span>" +
      LABELS[kind] + "</button>";
  }

  picker.innerHTML = E.kinds.map(tileHTML).join("");
  tiles.innerHTML = E.kinds.map(function (kind) {
    return '<button class="lab-tile" type="button" data-kind="' + kind + '" aria-pressed="false">' +
      E.art(kind) + "<b>" + LABELS[kind] + "</b><small>" + kind + "</small></button>";
  }).join("");

  function markPressed() {
    [].forEach.call(document.querySelectorAll("[data-kind]"), function (el) {
      el.setAttribute("aria-pressed", el.dataset.kind === current ? "true" : "false");
    });
  }

  function describe() {
    title.textContent = LABELS[current];
    note.textContent = NOTES[current];
    var list = animations().map(function (anim) {
      var timing = anim.effect && anim.effect.getTiming ? anim.effect.getTiming() : {};
      return { name: anim.animationName || "?", duration: Math.round(timing.duration || 0) };
    });
    animList.innerHTML = list.map(function (a) {
      return "<li>" + a.name.replace(/^em-/, "") + " <b>" + a.duration + "ms</b></li>";
    }).join("");
  }

  function applyPlayback() {
    animations().forEach(function (anim) {
      anim.playbackRate = rate;
      if (playing) {
        if (anim.playState === "paused") anim.play();
      } else {
        anim.pause();
      }
    });
    playBtn.textContent = playing ? "Duraklat" : "Oynat";
    playBtn.setAttribute("aria-pressed", playing ? "false" : "true");
  }

  function select(kind) {
    current = kind;
    stage.innerHTML = '<span class="lab-stage-art" aria-hidden="true">' + E.art(kind) + "</span>";
    markPressed();
    describe();
    applyPlayback();
    if (!playing) scrub.dispatchEvent(new Event("input"));
  }

  picker.addEventListener("click", function (event) {
    var btn = event.target.closest("[data-kind]");
    if (btn) select(btn.dataset.kind);
  });
  tiles.addEventListener("click", function (event) {
    var btn = event.target.closest("[data-kind]");
    if (btn) select(btn.dataset.kind);
  });

  playBtn.addEventListener("click", function () {
    playing = !playing;
    applyPlayback();
    if (playing) scrub.value = 0;
  });
  restartBtn.addEventListener("click", function () {
    animations().forEach(function (anim) { anim.currentTime = 0; });
    playing = true;
    applyPlayback();
    scrub.value = 0;
    scrubOut.textContent = "0 ms";
  });
  speed.addEventListener("input", function () {
    rate = Number(speed.value) / 100;
    speedOut.textContent = rate.toFixed(2) + "×";
    applyPlayback();
  });
  scrub.addEventListener("input", function () {
    var t = Number(scrub.value);
    scrubOut.textContent = t + " ms";
    playing = false;
    playBtn.textContent = "Oynat";
    playBtn.setAttribute("aria-pressed", "true");
    animations().forEach(function (anim) {
      anim.pause();
      anim.currentTime = t;
    });
  });
  size.addEventListener("input", function () {
    var px = Number(size.value);
    sizeOut.textContent = px + " px";
    stage.style.setProperty("--stage-size", px + "px");
  });
  bgBtn.addEventListener("click", function () {
    document.body.classList.toggle("lab-dark");
    bgBtn.setAttribute("aria-pressed", document.body.classList.contains("lab-dark") ? "true" : "false");
  });
  checkerBtn.addEventListener("click", function () {
    document.body.classList.toggle("lab-checker");
    checkerBtn.setAttribute("aria-pressed", document.body.classList.contains("lab-checker") ? "true" : "false");
  });
  quietBtn.addEventListener("click", function () {
    document.body.classList.toggle("lab-quiet");
    quietBtn.setAttribute("aria-pressed", document.body.classList.contains("lab-quiet") ? "true" : "false");
  });

  select(current);
  setTimeout(describe, 60);
})();
