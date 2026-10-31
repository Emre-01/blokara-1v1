(function () {
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  return (async function () {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await wait(600);
    var loaded = [];
    document.fonts.forEach(function (f) {
      loaded.push(f.family + " " + f.weight + " " + f.status + " [" + (f.unicodeRange || "") + "]");
    });
    var resources = performance.getEntriesByType("resource")
      .filter(function (e) { return /fonts\//.test(e.name); })
      .map(function (e) { return e.name.split("/").pop() + ":" + Math.round(e.transferSize || e.encodedBodySize || 0); });
    var h1 = document.querySelector("h1");
    var cs = h1 ? getComputedStyle(h1) : null;
    return {
      faces: loaded,
      resources: resources,
      h1Font: cs ? cs.fontFamily : null,
      h1Width: h1 ? Math.round(h1.getBoundingClientRect().width) : null,
      figtree: document.fonts.check('16px Figtree'),
      bricolage: document.fonts.check('800 16px "Bricolage Grotesque"')
    };
  })();
})();
