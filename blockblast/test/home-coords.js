(function () {
  var ids = ["quick-match", "join-btn"];
  var out = {};
  ids.forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) { out[id] = null; return; }
    var r = el.getBoundingClientRect();
    out[id] = { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
      w: Math.round(r.width), h: Math.round(r.height) };
  });
  var cards = document.querySelectorAll("[data-local]");
  out.local = Array.prototype.map.call(cards, function (el) {
    var r = el.getBoundingClientRect();
    return { mode: el.dataset.local, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  var hosts = document.querySelectorAll("#online-card [data-host]");
  out.online = Array.prototype.map.call(hosts, function (el) { return el.dataset.host; });
  return out;
})();
