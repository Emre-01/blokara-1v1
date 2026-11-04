/* Blokara 1v1 — çok dilli arayüz motoru.
   Sözlük anahtarı Türkçe kaynak metindir (gettext msgid gibi). Böylece
   arayüzdeki metinler tek tek değiştirilmeden, DOM üzerinden çevrilir.

   - Statik ve dinamik tüm metin düğümleri çevrilir (MutationObserver).
   - {ad} yer tutuculu şablonlar sayı/isim içeren cümleleri kapsar.
   - Dil değişince özgün Türkçe metinden yeniden çevrilir.
   - Eksik anahtar İngilizceye, o da yoksa Türkçeye düşer. */
(function (root) {
  "use strict";

  var DATA = root.BLOK_I18N || {};
  var FALLBACK = "en";
  var STORAGE = "blokara.lang";
  var MANUAL = "blokara.lang.manual";

  /* Google Play'in mağaza dili olarak desteklediği diller ve yakın
     varyantlar. native: kendi dilindeki adı, dir: yazı yönü. */
  var LANGS = [
    { code: "tr", native: "Türkçe", english: "Turkish", dir: "ltr" },
    { code: "en", native: "English", english: "English", dir: "ltr" },
    { code: "de", native: "Deutsch", english: "German", dir: "ltr" },
    { code: "fr", native: "Français", english: "French", dir: "ltr" },
    { code: "es", native: "Español", english: "Spanish", dir: "ltr" },
    { code: "pt-BR", native: "Português (Brasil)", english: "Portuguese (Brazil)", dir: "ltr" },
    { code: "pt-PT", native: "Português (Portugal)", english: "Portuguese (Portugal)", dir: "ltr" },
    { code: "it", native: "Italiano", english: "Italian", dir: "ltr" },
    { code: "nl", native: "Nederlands", english: "Dutch", dir: "ltr" },
    { code: "pl", native: "Polski", english: "Polish", dir: "ltr" },
    { code: "ru", native: "Русский", english: "Russian", dir: "ltr" },
    { code: "uk", native: "Українська", english: "Ukrainian", dir: "ltr" },
    { code: "ro", native: "Română", english: "Romanian", dir: "ltr" },
    { code: "cs", native: "Čeština", english: "Czech", dir: "ltr" },
    { code: "sk", native: "Slovenčina", english: "Slovak", dir: "ltr" },
    { code: "hu", native: "Magyar", english: "Hungarian", dir: "ltr" },
    { code: "bg", native: "Български", english: "Bulgarian", dir: "ltr" },
    { code: "el", native: "Ελληνικά", english: "Greek", dir: "ltr" },
    { code: "hr", native: "Hrvatski", english: "Croatian", dir: "ltr" },
    { code: "sr", native: "Српски", english: "Serbian", dir: "ltr" },
    { code: "sl", native: "Slovenščina", english: "Slovenian", dir: "ltr" },
    { code: "bs", native: "Bosanski", english: "Bosnian", dir: "ltr" },
    { code: "mk", native: "Македонски", english: "Macedonian", dir: "ltr" },
    { code: "sq", native: "Shqip", english: "Albanian", dir: "ltr" },
    { code: "lt", native: "Lietuvių", english: "Lithuanian", dir: "ltr" },
    { code: "lv", native: "Latviešu", english: "Latvian", dir: "ltr" },
    { code: "et", native: "Eesti", english: "Estonian", dir: "ltr" },
    { code: "fi", native: "Suomi", english: "Finnish", dir: "ltr" },
    { code: "sv", native: "Svenska", english: "Swedish", dir: "ltr" },
    { code: "nb", native: "Norsk bokmål", english: "Norwegian", dir: "ltr" },
    { code: "da", native: "Dansk", english: "Danish", dir: "ltr" },
    { code: "is", native: "Íslenska", english: "Icelandic", dir: "ltr" },
    { code: "ar", native: "العربية", english: "Arabic", dir: "rtl" },
    { code: "he", native: "עברית", english: "Hebrew", dir: "rtl" },
    { code: "fa", native: "فارسی", english: "Persian", dir: "rtl" },
    { code: "ur", native: "اردو", english: "Urdu", dir: "rtl" },
    { code: "hi", native: "हिन्दी", english: "Hindi", dir: "ltr" },
    { code: "bn", native: "বাংলা", english: "Bengali", dir: "ltr" },
    { code: "gu", native: "ગુજરાતી", english: "Gujarati", dir: "ltr" },
    { code: "mr", native: "मराठी", english: "Marathi", dir: "ltr" },
    { code: "pa", native: "ਪੰਜਾਬੀ", english: "Punjabi", dir: "ltr" },
    { code: "ta", native: "தமிழ்", english: "Tamil", dir: "ltr" },
    { code: "te", native: "తెలుగు", english: "Telugu", dir: "ltr" },
    { code: "kn", native: "ಕನ್ನಡ", english: "Kannada", dir: "ltr" },
    { code: "ml", native: "മലയാളം", english: "Malayalam", dir: "ltr" },
    { code: "si", native: "සිංහල", english: "Sinhala", dir: "ltr" },
    { code: "ne", native: "नेपाली", english: "Nepali", dir: "ltr" },
    { code: "id", native: "Bahasa Indonesia", english: "Indonesian", dir: "ltr" },
    { code: "ms", native: "Bahasa Melayu", english: "Malay", dir: "ltr" },
    { code: "fil", native: "Filipino", english: "Filipino", dir: "ltr" },
    { code: "vi", native: "Tiếng Việt", english: "Vietnamese", dir: "ltr" },
    { code: "th", native: "ไทย", english: "Thai", dir: "ltr" },
    { code: "km", native: "ខ្មែរ", english: "Khmer", dir: "ltr" },
    { code: "lo", native: "ລາວ", english: "Lao", dir: "ltr" },
    { code: "my", native: "မြန်မာ", english: "Burmese", dir: "ltr" },
    { code: "ja", native: "日本語", english: "Japanese", dir: "ltr" },
    { code: "ko", native: "한국어", english: "Korean", dir: "ltr" },
    { code: "zh-CN", native: "简体中文", english: "Chinese (Simplified)", dir: "ltr" },
    { code: "zh-TW", native: "繁體中文", english: "Chinese (Traditional)", dir: "ltr" },
    { code: "az", native: "Azərbaycanca", english: "Azerbaijani", dir: "ltr" },
    { code: "kk", native: "Қазақша", english: "Kazakh", dir: "ltr" },
    { code: "ky", native: "Кыргызча", english: "Kyrgyz", dir: "ltr" },
    { code: "uz", native: "Oʻzbekcha", english: "Uzbek", dir: "ltr" },
    { code: "tg", native: "Тоҷикӣ", english: "Tajik", dir: "ltr" },
    { code: "mn", native: "Монгол", english: "Mongolian", dir: "ltr" },
    { code: "ka", native: "ქართული", english: "Georgian", dir: "ltr" },
    { code: "hy", native: "Հայերեն", english: "Armenian", dir: "ltr" },
    { code: "be", native: "Беларуская", english: "Belarusian", dir: "ltr" },
    { code: "af", native: "Afrikaans", english: "Afrikaans", dir: "ltr" },
    { code: "sw", native: "Kiswahili", english: "Swahili", dir: "ltr" },
    { code: "am", native: "አማርኛ", english: "Amharic", dir: "ltr" },
    { code: "zu", native: "isiZulu", english: "Zulu", dir: "ltr" },
    { code: "ca", native: "Català", english: "Catalan", dir: "ltr" },
    { code: "eu", native: "Euskara", english: "Basque", dir: "ltr" },
    { code: "gl", native: "Galego", english: "Galician", dir: "ltr" }
  ];

  var byCode = {};
  LANGS.forEach(function (item) { byCode[item.code] = item; });

  /* Bölge/dil etiketlerini desteklenen koda indirger. */
  function normalize(tag) {
    if (!tag) return null;
    var raw = String(tag).replace(/_/g, "-").trim();
    if (!raw) return null;
    var lower = raw.toLowerCase();
    if (lower === "no" || lower === "nb-no" || lower === "nn") return "nb";
    if (lower === "iw" || lower === "he-il") return "he";
    if (lower === "pt-br") return "pt-BR";
    if (lower === "pt-pt") return "pt-PT";
    if (lower === "pt") return "pt-BR";
    if (lower === "zh" || lower === "zh-hans" || lower === "zh-cn" || lower === "zh-sg") return "zh-CN";
    if (lower === "zh-hant" || lower === "zh-tw" || lower === "zh-hk" || lower === "zh-mo") return "zh-TW";
    if (lower === "tl" || lower === "fil-ph") return "fil";
    if (lower === "in") return "id";
    if (lower === "no" ) return "nb";
    if (byCode[lower]) return byCode[lower].code;
    var base = lower.split("-")[0];
    if (byCode[base]) return byCode[base].code;
    /* Sırpça/Hırvatça benzeri varyantlar aynı çeviriyi kullanır. */
    if (base === "sr" || base === "hr" || base === "bs") return base;
    return null;
  }

  function hasDict(code) {
    return code === "tr" || !!(DATA[code] && Object.keys(DATA[code]).length);
  }

  /* Cihaz dilini bul: kayıtlı seçim > Android köprüsü > tarayıcı. */
  function detect() {
    var manual = null;
    try { manual = localStorage.getItem(STORAGE); } catch (error) { manual = null; }
    if (manual) {
      var saved = normalize(manual);
      if (saved && hasDict(saved)) return saved;
    }
    var candidates = [];
    try {
      if (root.BlokI18nBridge && typeof root.BlokI18nBridge.locale === "function") {
        candidates.push(root.BlokI18nBridge.locale());
      }
    } catch (error) { /* köprü yoksa yoksay */ }
    if (navigator.languages && navigator.languages.length) {
      candidates = candidates.concat(navigator.languages);
    }
    candidates.push(navigator.language, navigator.userLanguage);
    for (var i = 0; i < candidates.length; i++) {
      var code = normalize(candidates[i]);
      if (code && hasDict(code)) return code;
    }
    return "en";
  }

  function dataFor(code) {
    if (code === "tr") return null;
    if (DATA[code]) return DATA[code];
    if (DATA[FALLBACK]) return DATA[FALLBACK];
    return null;
  }

  /* ---------- şablon eşleştirme ---------- */
  var PLACEHOLDER = /\{([a-zA-Z0-9_]+)\}/g;
  var templateCache = {};
  /* Kısa etiketler arayüzde bazen küçük/büyük harfle yazılır
     ("Ortak skor" / "ortak skor"). Sözlükte tek biçim yeterli olsun. */
  var lowerCache = {};

  function lowerIndex(code) {
    if (lowerCache[code]) return lowerCache[code];
    var dict = dataFor(code) || {};
    var index = {};
    Object.keys(dict).forEach(function (key) {
      var flat = key.replace(/\s+/g, " ").trim().toLowerCase();
      if (index[flat] == null) index[flat] = dict[key];
    });
    lowerCache[code] = index;
    return index;
  }

  function escapeSource(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function compileTemplates(code) {
    if (templateCache[code]) return templateCache[code];
    var list = [];
    var source = dataFor(code) || {};
    Object.keys(source).forEach(function (key) {
      if (key.indexOf("{") < 0) return;
      var names = [];
      var pattern = "";
      var last = 0;
      var match;
      PLACEHOLDER.lastIndex = 0;
      while ((match = PLACEHOLDER.exec(key))) {
        pattern += escapeSource(key.slice(last, match.index));
        names.push(match[1]);
        /* Sayısal değerler binlik ayıraçla gelebilir. */
        var numeric = /^(n|count|value|score|lines|moves|blocks|level|coins|points|best|day|days|time)$/i.test(match[1]);
        pattern += numeric ? "(-?[\\d][\\d.,\\s]*?)" : "([\\s\\S]+?)";
        last = match.index + match[0].length;
      }
      pattern += escapeSource(key.slice(last));
      list.push({
        re: new RegExp("^\\s*" + pattern.replace(/\s+/g, "\\s+") + "\\s*$"),
        names: names,
        template: source[key]
      });
    });
    /* Uzun şablonlar önce denenir: daha özgül eşleşme kazanır. */
    list.sort(function (a, b) { return b.names.length - a.names.length; });
    templateCache[code] = list;
    return list;
  }

  function fill(template, names, values) {
    return template.replace(PLACEHOLDER, function (whole, name) {
      var index = names.indexOf(name);
      return index >= 0 ? values[index] : whole;
    });
  }

  function translateText(source, code) {
    var text = source;
    if (!text) return text;
    if (code === "tr") return text;
    var dict = dataFor(code);
    if (!dict) return text;

    /* Baştaki/sondaki boşlukları koru. */
    var lead = (text.match(/^\s*/) || [""])[0];
    var trail = (text.match(/\s*$/) || [""])[0];
    var core = text.slice(lead.length, text.length - trail.length || text.length).trim();
    if (!core) return text;
    var flat = core.replace(/\s+/g, " ");

    var direct = dict[flat];
    if (direct != null) return lead + direct + trail;

    /* Harf büyüklüğü farklı kısa etiketler (CSS uppercase vb.). */
    if (flat.length <= 40) {
      var ci = lowerIndex(code)[flat.toLowerCase()];
      if (ci != null) return lead + ci + trail;
    }

    var templates = compileTemplates(code);
    for (var i = 0; i < templates.length; i++) {
      var item = templates[i];
      var match = item.re.exec(flat);
      if (match) return lead + fill(item.template, item.names, match.slice(1)) + trail;
    }
    return text;
  }

  /* ---------- DOM ---------- */
  var textState = new WeakMap();
  var attrState = new WeakMap();
  var ATTRS = ["placeholder", "aria-label", "title", "alt"];
  var current = "tr";
  var observer = null;
  var scheduled = false;

  function translateTextNode(node) {
    var state = textState.get(node);
    var value = node.nodeValue;
    if (!state || value !== state.out) state = { src: value };
    var out = translateText(state.src, current);
    state.out = out;
    textState.set(node, state);
    if (out !== value) node.nodeValue = out;
  }

  function translateAttributes(el) {
    if (!el.getAttribute) return;
    var map = attrState.get(el);
    for (var i = 0; i < ATTRS.length; i++) {
      var name = ATTRS[i];
      if (!el.hasAttribute(name)) continue;
      var value = el.getAttribute(name);
      var prev = map && map[name];
      var src = prev && value === prev.out ? prev.src : value;
      var out = translateText(src, current);
      if (!map) { map = {}; attrState.set(el, map); }
      map[name] = { src: src, out: out };
      if (out !== value) el.setAttribute(name, out);
    }
  }

  function shouldSkip(node) {
    var parent = node.parentElement;
    if (!parent) return true;
    var tag = parent.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "CODE" || tag === "PRE") return true;
    if (parent.closest("[data-i18n-skip]")) return true;
    return false;
  }

  function walk(startNode) {
    if (!startNode) return;
    if (startNode.nodeType === 3) {
      if (!shouldSkip(startNode)) translateTextNode(startNode);
      return;
    }
    if (startNode.nodeType !== 1 && startNode.nodeType !== 9) return;
    if (startNode.nodeType === 1) {
      if (startNode.hasAttribute && startNode.hasAttribute("data-i18n-skip")) return;
      translateAttributes(startNode);
    }
    var walker = document.createTreeWalker(startNode, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (node) {
        if (node.nodeType === 1) {
          var tag = node.tagName;
          if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return NodeFilter.FILTER_REJECT;
          if (node.hasAttribute("data-i18n-skip")) return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var node = walker.currentNode;
    while (node) {
      if (node.nodeType === 3) {
        if (!shouldSkip(node)) translateTextNode(node);
      } else if (node.nodeType === 1) {
        translateAttributes(node);
      }
      node = walker.nextNode();
    }
  }

  function translateDocument() {
    walk(document.body);
    translateAttributes(document.documentElement);
    var title = document.querySelector("title");
    if (title) translateTextNode(title.firstChild || title);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    var run = function () {
      scheduled = false;
      walk(document.body);
    };
    if (root.requestAnimationFrame) root.requestAnimationFrame(run);
    else setTimeout(run, 16);
  }

  function observe() {
    if (observer || !root.MutationObserver || !document.body) return;
    observer = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var record = records[i];
        if (record.type === "characterData") {
          var node = record.target;
          if (!shouldSkip(node)) translateTextNode(node);
        } else if (record.type === "attributes") {
          translateAttributes(record.target);
        } else if (record.type === "childList") {
          for (var j = 0; j < record.addedNodes.length; j++) {
            var added = record.addedNodes[j];
            if (added.nodeType === 1 && !added.closest("[data-i18n-skip]")) walk(added);
            else if (added.nodeType === 3 && !shouldSkip(added)) translateTextNode(added);
          }
        }
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS
    });
  }

  /* ---------- genel API ---------- */
  function dirOf(code) {
    return (byCode[code] && byCode[code].dir) || "ltr";
  }

  function applyDocument(code) {
    var html = document.documentElement;
    html.setAttribute("lang", code === "zh-CN" ? "zh-Hans" : (code === "zh-TW" ? "zh-Hant" : code));
    html.setAttribute("dir", dirOf(code));
    html.setAttribute("data-lang", code);
    current = code;
    templateCache = {};
    translateDocument();
    schedule();
  }

  function setLang(code, options) {
    var next = normalize(code) || "en";
    if (!hasDict(next)) next = "en";
    try {
      localStorage.setItem(STORAGE, next);
      if (!options || options.manual !== false) localStorage.setItem(MANUAL, "1");
    } catch (error) { /* yoksay */ }
    applyDocument(next);
    document.dispatchEvent(new CustomEvent("blokara:lang", { detail: { lang: next } }));
    return next;
  }

  /* Cihaz diline geri döner (kayıtlı elle seçim silinir). */
  function useAuto() {
    try {
      localStorage.removeItem(STORAGE);
      localStorage.removeItem(MANUAL);
    } catch (error) { /* yoksay */ }
    var code = detect();
    if (!hasDict(code)) code = "en";
    applyDocument(code);
    document.dispatchEvent(new CustomEvent("blokara:lang", { detail: { lang: code, auto: true } }));
    return code;
  }

  function t(key, vars) {
    if (current === "tr") return key;
    var dict = dataFor(current);
    if (!dict) return key;
    var value = dict[key];
    if (value == null && vars) {
      var templates = compileTemplates(current);
      for (var i = 0; i < templates.length; i++) {
        var item = templates[i];
        var match = key.match(item.re);
        if (match) {
          var names = item.names;
          var map = match.slice(1);
          return fill(item.template, names, map);
        }
      }
    }
    if (value == null) return key;
    if (vars) {
      value = value.replace(PLACEHOLDER, function (whole, name) {
        return vars[name] != null ? String(vars[name]) : whole;
      });
    }
    return value;
  }

  function start() {
    var code = detect();
    if (!hasDict(code)) code = "en";
    applyDocument(code);
    observe();
  }

  root.BlokI18n = {
    LANGS: LANGS,
    normalize: normalize,
    detect: detect,
    hasDict: hasDict,
    setLang: setLang,
    auto: useAuto,
    getLang: function () { return current; },
    dir: dirOf,
    t: t,
    apply: function () { translateDocument(); schedule(); },
    refresh: schedule,
    start: start,
    missing: function () { return Object.keys(DATA); }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})(typeof window !== "undefined" ? window : this);
