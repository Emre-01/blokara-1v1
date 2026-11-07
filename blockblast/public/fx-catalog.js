/* Blokara 1v1 — efekt kataloğu.
   Bu dosya yalnızca VERİ içerir: hangi efektler var, nasıl görünür, hangi
   sesi çalar ve hangi reklam anahtarıyla açılır. Görsel motor (fx.js) bu
   tarifleri yorumlar; seçim ekranı (app.js) listeyi buradan üretir.

   Yeni efekt eklemek için tek yapılacak: aşağıdaki listeye bir kayıt eklemek.
   Motor parçacık havuzu, çizim sınırı ve kare bütçesini kendi yönetir;
   bu yüzden efekt sayısı artsa da oyun kasmaz.

   Tarif alanları
   --------------
   shape   : "spark" | "rect" | "streak" | "bubble" | "star" | "leaf" | "ring"
   count   : [normal, güçlü] parçacık sayısı
   from    : "point" (varsayılan) | "top" | "bottom"
   area    : [x0, x1, y0, y1] — ekran oranı (0-1); top/bottom için
   spots   : [[x, y], ...] — ekran oranı; her noktada ayrı patlama
   stagger : noktalar/tekrarlar arası saniye
   repeat  : emitter kaç dalga hâlinde çalışsın
   gap     : dalgalar arası saniye
   speed   : [en az, en çok] piksel/saniye
   angle   : "radial" | "up" | "down" | "tangent"
   size    : [en az, en çok] piksel
   life    : [en az, en çok] saniye
   gravity : piksel/saniye²
   drag    : 0-1 arası hava sürtünmesi
   spin    : [en az, en çok] radyan/saniye
   wobble  : [en az, en çok] yatay salınım
   glow    : parlak hâle
   colors  : dizi | "theme" | "palette"
   delay   : ek gecikme (saniye)
   delayJitter : rastgele ek gecikme
*/
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
    paper: "#f3ead8",
    ink: "#1c1b2e",
    cream: "#fff3c4",
    gold: "#f4b72a",
    white: "#ffffff"
  };

  var PARTY = [
    COLORS.coral, COLORS.cobalt, COLORS.mustard, COLORS.mint, COLORS.grape,
    COLORS.sky, COLORS.lime, COLORS.rose, COLORS.teal
  ];

  /* Not: seçim ikonları burada tutulmaz; emoji yerine oyunun çizgi
     diline uyan SVG'ler app.js içindeki FX_ICONS sözlüğünde tanımlıdır. */
  var BURST = [
    {
      id: "classic",
      name: "Klasik",
      group: "burst",
      free: true,
      sound: "classic",
      recipe: {
        themeExtras: true,
        emitters: [
          { shape: "spark", count: [14, 22], speed: [90, 330], size: [4, 9], gravity: 520, drag: 0.98, life: [0.55, 1.1], colors: "theme", glow: true },
          { shape: "star", count: [3, 6], speed: [50, 180], size: [8, 15], gravity: 220, drag: 0.97, life: [0.6, 1.1], colors: ["cream", "paper", "mustard"], glow: true, spin: [-1.6, 1.6] }
        ],
        rings: [
          { color: "mustard", radius: 8, grow: 92, life: 0.34 },
          { color: "paper", radius: 4, grow: 56, life: 0.26 }
        ]
      }
    },
    {
      id: "pixel",
      name: "Piksel",
      group: "burst",
      free: true,
      sound: "pixel",
      recipe: {
        emitters: [
          { shape: "rect", count: [14, 24], speed: [100, 360], size: [4, 11], gravity: 920, drag: 0.986, life: [0.55, 1.15], colors: "themeInk", spin: [7, 20] },
          { shape: "rect", count: [4, 7], speed: [60, 170], size: [3, 6], gravity: 700, drag: 0.99, life: [0.4, 0.7], colors: ["paper", "mustard"], spin: [10, 26], delay: 0.03 },
          { shape: "star", count: [2, 4], speed: [50, 160], size: [6, 11], gravity: 260, drag: 0.97, life: [0.5, 0.95], colors: ["cream", "paper"], glow: true, spin: [-1.8, 1.8] }
        ],
        rings: [
          { color: "mustard", radius: 8, grow: 84, life: 0.32 },
          { color: "paper", radius: 4, grow: 52, life: 0.24 }
        ]
      }
    },
    {
      id: "bubble",
      name: "Balon",
      group: "burst",
      free: true,
      sound: "bubble",
      recipe: {
        themeExtras: true,
        emitters: [
          {
            shape: "bubble", count: [14, 24], spread: [54, 40], angle: "up",
            speed: [40, 300], size: [12, 34], gravity: -30, drag: 0.988,
            life: [0.95, 1.9], colors: ["#8fd0ff", "#bfe4ff", "#f7a8d4", "#a7e8c4", "#ffe3a3", "paper"],
            wobble: [1.2, 3.6], delayJitter: 0.1
          },
          { shape: "spark", count: [4, 8], speed: [60, 200], size: [2, 4.5], gravity: 300, drag: 0.97, life: [0.35, 0.75], colors: ["white", "#bfe4ff", "cream"], glow: true }
        ],
        rings: [
          { color: "#bfe4ff", radius: 6, grow: 76, life: 0.36 },
          { color: "#f7a8d4", radius: 4, grow: 48, life: 0.28 }
        ]
      }
    },
    {
      id: "spark",
      name: "Kıvılcım",
      group: "burst",
      free: true,
      sound: "spark",
      recipe: {
        emitters: [
          { shape: "streak", count: [16, 28], speed: [240, 660], size: [1.6, 3.8], gravity: 160, drag: 0.94, life: [0.3, 0.62], colors: ["mustard", "cream", "paper", "coral", "sky"], glow: true },
          { shape: "star", count: [3, 6], speed: [80, 240], size: [5, 10], gravity: 260, drag: 0.96, life: [0.4, 0.85], colors: ["cream", "white", "mustard"], glow: true, spin: [-2, 2] }
        ],
        rings: [
          { color: "mustard", radius: 6, grow: 120, life: 0.4 },
          { color: "paper", radius: 3, grow: 70, life: 0.34 },
          { color: "sky", radius: 2, grow: 150, life: 0.3 }
        ]
      }
    },
    {
      id: "leaf",
      name: "Yaprak",
      group: "burst",
      free: false,
      unlock: "fx:burst:leaf",
      sound: "leaf",
      recipe: {
        emitters: [
          { shape: "leaf", count: [12, 20], speed: [60, 300], size: [8, 15], gravity: 260, drag: 0.985, life: [0.9, 1.8], colors: ["#c9662f", "#e0a13a", "#7c4a2d", "#a8442a", "#d9b46a"], spin: [-5, 5], wobble: [0.6, 1.8] },
          { shape: "spark", count: [5, 8], speed: [60, 180], size: [2, 4], gravity: 300, drag: 0.98, life: [0.4, 0.8], colors: ["paper", "mustard"], glow: true },
          { shape: "star", count: [2, 4], speed: [40, 140], size: [6, 11], gravity: 240, drag: 0.97, life: [0.5, 0.95], colors: ["cream", "#d9b46a", "mustard"], glow: true, spin: [-1.6, 1.6] }
        ],
        rings: [
          { color: "#c9662f", radius: 6, grow: 64, life: 0.3 },
          { color: "#e0a13a", radius: 3, grow: 96, life: 0.34 }
        ]
      }
    }
  ];

  var WIN = [
    {
      id: "confetti",
      name: "Konfeti",
      group: "win",
      free: true,
      sound: "confetti",
      recipe: {
        flash: true,
        rays: true,
        emitters: [
          { shape: "rect", from: "top", count: [26, 40], repeat: 4, gap: 0.26, speed: [120, 340], size: [4, 9], gravity: 340, drag: 0.995, life: [1.5, 2.9], colors: "party", spin: [5, 14] },
          { shape: "spark", from: "bottom", area: [0.02, 0.28, 0.8, 1], count: [8, 12], speed: [140, 340], angle: "up", size: [2, 4], gravity: 220, drag: 0.97, life: [0.6, 1.2], colors: ["gold", "cream", "paper"], glow: true },
          { shape: "spark", from: "bottom", area: [0.72, 0.98, 0.8, 1], count: [8, 12], speed: [140, 340], angle: "up", size: [2, 4], gravity: 220, drag: 0.97, life: [0.6, 1.2], colors: ["gold", "cream", "paper"], glow: true },
          { shape: "star", from: "top", count: [6, 10], repeat: 2, gap: 0.4, speed: [80, 220], size: [7, 13], gravity: 200, drag: 0.99, life: [1.2, 2.2], colors: ["gold", "cream", "paper"], glow: true, spin: [-2, 2], delayJitter: 0.6 }
        ],
        rings: [
          { color: "gold", radius: 10, grow: 150, life: 0.7 },
          { color: "paper", radius: 6, grow: 100, life: 0.55 }
        ]
      }
    },
    {
      id: "fireworks",
      name: "Havai fişek",
      group: "win",
      free: true,
      sound: "fireworks",
      recipe: {
        flash: true,
        emitters: [
          {
            shape: "streak", count: [22, 32],
            spots: [[0.22, 0.24], [0.66, 0.18], [0.44, 0.42], [0.82, 0.36], [0.16, 0.48], [0.56, 0.28]],
            stagger: 0.22, speed: [110, 360], size: [2, 4.6], gravity: 130, drag: 0.952,
            life: [0.85, 1.6], colors: "party", glow: true, spotRing: { radius: 6, grow: 90, life: 0.6 }
          },
          { shape: "streak", from: "bottom", area: [0.15, 0.85, 0.9, 0.98], count: [4, 6], speed: [420, 700], angle: "up", size: [2, 3], gravity: 220, drag: 0.99, life: [0.5, 0.8], colors: ["paper", "cream"], glow: true, delayJitter: 0.3 },
          { shape: "star", count: [3, 5], spots: [[0.3, 0.3], [0.7, 0.26], [0.5, 0.5]], stagger: 0.18, speed: [40, 140], size: [7, 13], gravity: 120, drag: 0.97, life: [0.5, 1], colors: "party", glow: true, spin: [-2, 2] }
        ]
      }
    },
    {
      id: "stars",
      name: "Yıldız",
      group: "win",
      free: true,
      sound: "stars",
      recipe: {
        flash: true,
        rays: true,
        emitters: [
          { shape: "star", count: [26, 34], spread: [0, 0], area: [0.06, 0.94, 0.08, 0.7], from: "top", speed: [20, 60], angle: "down", size: [10, 26], gravity: -14, drag: 0.994, life: [1.2, 2.3], colors: ["mustard", "cream", "paper", "sky", "rose"], glow: true, spin: [-1.4, 1.4], delayJitter: 0.5 },
          { shape: "star", count: [1, 1], size: [70, 90], speed: [0, 0], gravity: 0, drag: 1, life: [1.05, 1.05], colors: ["mustard"], glow: true, spin: [-0.8, 0.8], centerY: 0.36 },
          { shape: "streak", count: [8, 12], angle: "radial", speed: [160, 380], size: [1.2, 2.6], gravity: 40, drag: 0.94, life: [0.35, 0.7], colors: ["cream", "white", "gold"], glow: true, centerY: 0.36 }
        ],
        rings: [
          { color: "mustard", radius: 18, grow: 190, life: 0.8, centerY: 0.36 },
          { color: "paper", radius: 8, grow: 130, life: 0.66, centerY: 0.36 }
        ]
      }
    },
    {
      id: "bubbles",
      name: "Baloncuk",
      group: "win",
      free: true,
      sound: "bubbles",
      recipe: {
        flash: true,
        emitters: [
          {
            shape: "bubble", from: "bottom", area: [0.05, 0.95, 0.85, 1.02], count: [18, 28],
            speed: [90, 240], angle: "up", size: [12, 44], gravity: -26, drag: 0.996,
            life: [1.4, 2.8], colors: ["#8fd0ff", "#bfe4ff", "#f7a8d4", "#a7e8c4", "#ffe3a3", "#d7c4ff"],
            wobble: [1.2, 3.4], delayJitter: 0.9
          },
          {
            shape: "spark", count: [12, 12], spots: [[0.28, 0.36], [0.52, 0.42], [0.74, 0.34]], stagger: 0.34,
            speed: [60, 220], size: [2.5, 5.5], gravity: 260, drag: 0.96, life: [0.4, 0.8],
            colors: ["white", "#bfe4ff"], glow: true, spotRing: { color: "#bfe4ff", radius: 4, grow: 70, life: 0.42 }
          }
        ],
        rings: [
          { color: "#8fd0ff", radius: 12, grow: 140, life: 0.6 },
          { color: "#f7a8d4", radius: 6, grow: 100, life: 0.5 }
        ]
      }
    },
    {
      id: "galaxy",
      name: "Galaksi",
      group: "win",
      free: false,
      unlock: "fx:win:galaxy",
      sound: "galaxy",
      recipe: {
        flash: true,
        rays: true,
        emitters: [
          {
            shape: "star", count: [34, 52], angle: "tangent", radius: [0.05, 0.42],
            speed: [40, 130], size: [6, 20], gravity: 0, drag: 0.997,
            life: [1.1, 2.2], colors: ["#8a5bd6", "#b48cff", "#4aa3d8", "#8fd0ff", "#fff3c4"],
            glow: true, spin: [-1.6, 1.6], centerY: 0.4
          },
          {
            shape: "streak", count: [14, 22], angle: "radial", speed: [180, 420], size: [1.4, 2.8],
            gravity: 0, drag: 0.94, life: [0.4, 0.8], colors: ["#b48cff", "#8fd0ff", "white"],
            glow: true, centerY: 0.4
          },
          {
            shape: "star", count: [4, 7], angle: "radial", speed: [90, 240], size: [8, 16],
            gravity: 0, drag: 0.96, life: [0.7, 1.3], colors: ["cream", "gold", "#b48cff"],
            glow: true, spin: [-2, 2], centerY: 0.4
          }
        ],
        rings: [
          { color: "#8a5bd6", radius: 14, grow: 210, life: 0.9, centerY: 0.4 },
          { color: "#4aa3d8", radius: 8, grow: 150, life: 0.7, centerY: 0.4 },
          { color: "cream", radius: 4, grow: 90, life: 0.5, centerY: 0.4 }
        ]
      }
    }
  ];

  var byId = {};
  BURST.concat(WIN).forEach(function (item) { byId[item.id] = item; });

  root.BLOK_FX_CATALOG = {
    burst: BURST,
    win: WIN,
    colors: COLORS,
    party: PARTY,
    byId: byId,
    groups: { burst: BURST, win: WIN }
  };
})(typeof self !== "undefined" ? self : this);
