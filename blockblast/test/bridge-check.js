(function () {
  var bridge = window.BlokIkiServer;
  return {
    server: bridge && bridge.serverUrl ? bridge.serverUrl() : null,
    fonts: document.fonts.check('800 16px "Bricolage Grotesque"') + "/" + document.fonts.check("16px Figtree"),
    fontResources: performance.getEntriesByType("resource")
      .filter(function (e) { return /fonts\//.test(e.name); })
      .map(function (e) { return e.name.split("/").pop(); }),
    screen: (document.querySelector(".screen:not([hidden])") || {}).id || null
  };
})();
