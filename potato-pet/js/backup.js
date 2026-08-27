window.App = window.App || {};
App.backup = (function () {
  function exportString(world) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(world))));
  }
  function importString(text) {
    let json;
    try { json = decodeURIComponent(escape(atob(String(text).trim()))); }
    catch (_) { return { ok: false, reason: "decode" }; }
    let world;
    try { world = JSON.parse(json); } catch (_) { return { ok: false, reason: "decode" }; }
    if (!world || typeof world !== "object" ||
        world.version == null || !world.pet || !world.room || !world.learn) {
      return { ok: false, reason: "shape" };
    }
    return { ok: true, world: world };
  }
  return { exportString, importString };
})();
