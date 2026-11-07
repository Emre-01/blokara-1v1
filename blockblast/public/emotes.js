/* Blokara 1v1 — emote çizimleri ve animasyon tarifleri.
 *
 * Tek kaynak: hem oyun içi balonlar, hem tepsi, hem profil menüsü, hem de
 * emote-lab.html animasyon aracı bu dosyadan beslenir. Çizimler 64×64
 * kutuya oturur; kalın mürekkep konturu oyunun çizgi dilini korur.
 *
 * Animasyonlar CSS tarafında yalnızca iki kapsamda çalışır:
 *   .emote-bubble-art   → oyun içi balon
 *   .emote-lab-stage    → animasyon laboratuvarı
 * Böylece tepsideki altı küçük simge boşta animasyon harcamaz.
 */
(function (root) {
  "use strict";

  var KINDS = ["laugh", "clap", "cry", "angry", "love", "cool"];

  /* Ortak yüz: yuvarlatılmış kare, sıcak sarı, üstte yumuşak parlama. */
  var FACE =
    '<rect class="em-face" x="6.4" y="3.6" width="51.2" height="50.4" rx="17"/>' +
    '<path class="em-gloss" d="M13.2 16.2c2.6-6.2 8.4-10.6 15.6-11.4"/>';

  /* El: bilek yerel (0,0) noktasında, parmaklar yukarı (–y). Küçük boyutta
     okunması için üç kalın parmak ve belirgin bir başparmak kullanılır;
     ince parmaklar 96 px balonda birbirine yapışıyordu. */
  var HAND =
    '<rect class="em-palm" x="-8.4" y="-13.2" width="16.8" height="16" rx="6.8"/>' +
    '<rect class="em-finger" x="-7.8" y="-21.2" width="4.7" height="10" rx="2.35"/>' +
    '<rect class="em-finger" x="-2.35" y="-23.4" width="4.7" height="12.2" rx="2.35"/>' +
    '<rect class="em-finger" x="3.1" y="-20.6" width="4.7" height="9.4" rx="2.35"/>' +
    '<rect class="em-thumb" x="-12.4" y="-11.6" width="5.4" height="12" rx="2.7" transform="rotate(-18 -9.7 -5.6)"/>' +
    '<path class="em-hand-line" d="M-5.2-6.6h10.4M-2.6-1.6h5.6"/>';

  /* Sağ el, sol elin aynasıdır: aynı çizim, x ekseninde çevrilir. */
  function hand(side, x, y, angle, scale) {
    var mirror = side === "r" ? " scale(-1 1)" : "";
    var size = scale ? " scale(" + scale + ")" : "";
    return '<g transform="translate(' + x + " " + y + ') rotate(' + angle + ')">' +
      '<g class="em-hand em-hand-' + side + '">' +
        '<g transform="' + (mirror + size).trim() + '">' + HAND + "</g>" +
      "</g></g>";
  }

  /* ---------------- ifadeler ---------------- */

  var ART = {
    /* Kahkaha: kısılmış mutlu gözler, kocaman açık ağız, zıplayan gövde. */
    laugh: function () {
      return FACE +
        '<g class="em-laugh-body">' +
          '<path class="em-brow-thin" d="M14.6 19.4q6.2-4.6 12.2-1.2M37.2 18.2q6-3.4 12.2 1.2"/>' +
          '<path class="em-line" d="M15.8 28.6q6-7.6 11.8 0M36.4 28.6q6-7.6 11.8 0"/>' +
          '<ellipse class="em-cheek" cx="14.2" cy="37" rx="5" ry="3.5"/>' +
          '<ellipse class="em-cheek" cx="49.8" cy="37" rx="5" ry="3.5"/>' +
          '<g class="em-laugh-mouth">' +
            '<path class="em-mouth-open" d="M17.3 33.4h29.4c1.5 0 2.5 1.3 2.1 2.7C46.6 44.9 40.1 50.6 32 50.6s-14.6-5.7-16.8-14.5c-.4-1.4.6-2.7 2.1-2.7z"/>' +
            '<rect class="em-teeth-band" x="20.6" y="34.5" width="22.8" height="4.2" rx="1.7"/>' +
            '<path class="em-tongue" d="M24.4 44.2q7.6-4 15.2 0-2.5 6.1-7.6 6.1t-7.6-6.1z"/>' +
          "</g>" +
        "</g>";
    },

    /* Alkış: iki el çenenin önünde buluşur, temas anında kıvılcım patlar.
       Ağız kapalı bir gülümseme: iri açık ağız kahkahayla aynı okunuyordu. */
    clap: function () {
      return FACE +
        '<g class="em-clap-face">' +
          '<path class="em-brow-thin" d="M15.2 19.4q6.2-4.2 12-1M36.8 18.4q5.8-3.2 12 1"/>' +
          '<path class="em-line" d="M16.2 28.2q5.8-7 11.4 0M36.4 28.2q5.6-7 11.4 0"/>' +
          '<ellipse class="em-cheek" cx="14.4" cy="35.4" rx="4.8" ry="3.3"/>' +
          '<ellipse class="em-cheek" cx="49.6" cy="35.4" rx="4.8" ry="3.3"/>' +
          '<g class="em-clap-mouth">' +
            '<path class="em-clap-smile" d="M22 37.8q10 2.8 20 0-3.2 7.8-10 7.8t-10-7.8z"/>' +
          "</g>" +
        "</g>" +
        hand("l", 26.4, 61.4, 4, 0.56) +
        hand("r", 37.6, 61.4, -4, 0.56) +
        /* Hareket izleri: yalnızca animasyon sırasında görünür. */
        '<g class="em-clap-impact">' +
          '<path class="em-impact-line" d="M13.4 56.4l-3.8 1.2M12.6 61.2l-4.2 0.4M50.6 56.4l3.8 1.2M51.4 61.2l4.2 0.4"/>' +
        "</g>";
    },

    /* Ağlama: iri parlak gözler, yanaklardan akan damlalar, hıçkıran ağız. */
    cry: function () {
      return FACE +
        '<path class="em-brow-thin" d="M15.4 20.8q5.4-4.8 11.2-1.8M37.4 19q5.8-3 11.2 1.8"/>' +
        '<ellipse class="em-eye" cx="21.4" cy="29.2" rx="4.4" ry="5.2"/>' +
        '<ellipse class="em-eye" cx="42.6" cy="29.2" rx="4.4" ry="5.2"/>' +
        '<circle class="em-eye-shine" cx="19.7" cy="27" r="1.55"/>' +
        '<circle class="em-eye-shine" cx="41" cy="27" r="1.55"/>' +
        /* Gözün altında biriken damla: yanakta durur, şişip taşar. */
        '<path class="em-tear em-tear-a" d="M18.2 34.8c-.8 3.1-3 5.3-3 7.8a3 3 0 0 0 6 0c0-2.5-2.2-4.7-3-7.8z"/>' +
        '<path class="em-tear em-tear-b" d="M45.8 34.8c-.8 3.1-3 5.3-3 7.8a3 3 0 0 0 6 0c0-2.5-2.2-4.7-3-7.8z"/>' +
        /* Kopup düşen damlalar: ayrı şekil, ayrı zamanlama. */
        '<g transform="translate(18.2 51)"><path class="em-drop em-drop-a" d="M0-3.6c.9 1.9 2.5 3.2 2.5 5.1a2.5 2.5 0 1 1-5 0c0-1.9 1.6-3.2 2.5-5.1z"/></g>' +
        '<g transform="translate(45.8 51)"><path class="em-drop em-drop-b" d="M0-3.6c.9 1.9 2.5 3.2 2.5 5.1a2.5 2.5 0 1 1-5 0c0-1.9 1.6-3.2 2.5-5.1z"/></g>' +
        '<ellipse class="em-cheek" cx="13.6" cy="37.6" rx="4.2" ry="2.9"/>' +
        '<ellipse class="em-cheek" cx="50.4" cy="37.6" rx="4.2" ry="2.9"/>' +
        '<path class="em-mouth-open em-mouth-sob" d="M25.8 41.4h12.4c1.3 0 2.2 1.1 1.9 2.3C39.4 48.4 36.2 51 32 51s-7.4-2.6-8.1-7.3c-.3-1.2.6-2.3 1.9-2.3z"/>' +
        '<path class="em-lip" d="M27.6 48.4q4.4 1.8 8.8 0"/>';
    },

    /* Kızma: çatık kalın kaşlar, kısık gözler, kenetlenmiş dişler, damar. */
    angry: function () {
      return FACE +
        '<path class="em-brow-heavy" d="M12.8 20.2l13.8 5.4-1.2 3.6-13.8-4z"/>' +
        '<path class="em-brow-heavy" d="M51.2 20.2L37.4 25.6l1.2 3.6 13.8-4z"/>' +
        /* Öfkeli bakış: içe doğru eğik iri gözler. Kısık çizgi göz,
           kapalı gibi okunuyordu; eğik dolgu göz en net okunan hâli. */
        '<ellipse class="em-eye" cx="21.4" cy="31" rx="6" ry="3.4" transform="rotate(16 21.4 31)"/>' +
        '<ellipse class="em-eye" cx="42.6" cy="31" rx="6" ry="3.4" transform="rotate(-16 42.6 31)"/>' +
        '<ellipse class="em-cheek em-cheek-hot" cx="13.4" cy="38.6" rx="4.2" ry="2.9"/>' +
        '<ellipse class="em-cheek em-cheek-hot" cx="50.6" cy="38.6" rx="4.2" ry="2.9"/>' +
        /* Kenetlenmiş dişler: koyu ağız, içinde beyaz diş sırası ve ayırıcılar. */
        '<rect class="em-grit-mouth" x="20.6" y="40.2" width="22.8" height="9.8" rx="4.4"/>' +
        '<rect class="em-grit-teeth" x="22.4" y="41.7" width="19.2" height="6.8" rx="2.2"/>' +
        '<path class="em-grit-line" d="M27.2 41.7v6.8M32 41.7v6.8M36.8 41.7v6.8"/>' +
        '<g transform="translate(48.6 15.2) scale(0.58)"><g class="em-vein">' +
          '<path d="M-4.2-5 2 1.2M4.2-5-2 1.2M-4.2 5 2-1.2M4.2 5-2-1.2"/>' +
        "</g></g>";
    },

    /* Sevgi: kalp gözler, uçuşan kalpler, ışıl ışıl bir gülümseme. */
    love: function () {
      return FACE +
        '<g class="em-float em-float-a">' +
          '<path class="em-heart-float" d="M12.2 12.8c-2.1-2.6-5.4-.8-4.1 1.7.8 1.6 4.1 3.6 4.1 3.6s3.3-2 4.1-3.6c1.3-2.5-2-4.3-4.1-1.7z"/>' +
        "</g>" +
        '<g class="em-float em-float-b">' +
          '<path class="em-heart-float" d="M52.4 8.6c-1.8-2.2-4.6-.7-3.5 1.5.7 1.4 3.5 3.1 3.5 3.1s2.8-1.7 3.5-3.1c1.1-2.2-1.7-3.7-3.5-1.5z"/>' +
        "</g>" +
        '<path class="em-heart-eye" d="M19.4 31c-3.2-4-8.3-1.3-6.4 2.5 1.3 2.6 6.4 5.6 6.4 5.6s5.1-3 6.4-5.6c1.9-3.8-3.2-6.5-6.4-2.5z"/>' +
        '<path class="em-heart-eye" d="M44.6 31c-3.2-4-8.3-1.3-6.4 2.5 1.3 2.6 6.4 5.6 6.4 5.6s5.1-3 6.4-5.6c1.9-3.8-3.2-6.5-6.4-2.5z"/>' +
        '<path class="em-heart-shine" d="M16.6 29.4l1.7 1.6M41.8 29.4l1.7 1.6"/>' +
        '<ellipse class="em-cheek" cx="13.4" cy="38.4" rx="4.2" ry="2.9"/>' +
        '<ellipse class="em-cheek" cx="50.6" cy="38.4" rx="4.2" ry="2.9"/>' +
        '<g class="em-love-mouth">' +
          '<path class="em-mouth-open" d="M22.6 38.8h18.8c1.4 0 2.4 1.2 2 2.6-1.4 5.4-5.7 8.4-11.4 8.4s-10-3-11.4-8.4c-.4-1.4.6-2.6 2-2.6z"/>' +
          '<rect class="em-teeth-band" x="24.6" y="39.7" width="14.8" height="3.1" rx="1.3"/>' +
        "</g>";
    },

    /* Havalı: kalın güneş gözlüğü, yan gülüş, tek ışıltı. */
    cool: function () {
      return FACE +
        '<rect class="em-shades" x="9.8" y="22.2" width="20" height="12.8" rx="5.6"/>' +
        '<rect class="em-shades" x="34.2" y="22.2" width="20" height="12.8" rx="5.6"/>' +
        '<path class="em-shades-bridge" d="M29.8 25.8h4.4"/>' +
        '<path class="em-shades" d="M9.8 24.6H6.2v2.8h3.6zM54.2 24.6h3.6v2.8h-3.6z"/>' +
        '<path class="em-shine" d="M13.6 32.4l3.8-7h3.6l-3.8 7z"/>' +
        '<path class="em-shine" d="M38 32.4l3.8-7h3.6l-3.8 7z"/>' +
        '<path class="em-smirk" d="M21.8 44.2q10.6 7 21.4-2.6"/>' +
        '<ellipse class="em-cheek" cx="13.6" cy="39.8" rx="3.8" ry="2.6"/>' +
        '<ellipse class="em-cheek" cx="50.4" cy="39.8" rx="3.8" ry="2.6"/>' +
        '<g transform="translate(49.4 12.6)"><g class="em-cool-spark">' +
          '<path class="em-spark" d="M0-6.4l1.7 4.2 4.2 1.7-4.2 1.7L0 5.4l-1.7-4.2-4.2-1.7 4.2-1.7z"/>' +
        "</g></g>";
    }
  };

  function art(kind) {
    var draw = ART[kind];
    if (!draw) return "";
    return '<svg class="emote-art emote-art-' + kind + '" viewBox="0 0 64 64" ' +
      'aria-hidden="true" focusable="false" role="presentation">' + draw() + "</svg>";
  }

  root.BlokEmotes = {
    kinds: KINDS,
    art: art
  };
})(typeof self !== "undefined" ? self : this);
