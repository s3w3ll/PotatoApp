window.App = window.App || {};
App.save = (function () {
  const module = { CURRENT_VERSION: 1 };
  const INDEX_KEY = "potato-pet:index";
  const worldKey = code => "potato-pet:world:" + code;
  const migrations = {}; // migrations[n] : (world@vN) -> world@v(N+1)

  function migrate(world) {
    while (world.version < module.CURRENT_VERSION) {
      const step = migrations[world.version];
      if (!step) throw new Error("SAVE_NO_MIGRATION_" + world.version);
      world = step(world);
    }
    return world;
  }
  function readIndex() {
    try { return JSON.parse(localStorage.getItem(INDEX_KEY)) || []; }
    catch (_) { return []; }
  }
  function writeIndex(list) { localStorage.setItem(INDEX_KEY, JSON.stringify(list)); }
  function upsertIndex(world) {
    const list = readIndex().filter(e => e.code !== world.code);
    list.push({ code: world.code, name: world.pet.name, species: world.pet.species });
    writeIndex(list);
  }
  function validShape(w) {
    return w && typeof w === "object" && w.pet && w.room && w.learn;
  }

  async function list() { return readIndex(); }

  async function load(code) {
    const raw = localStorage.getItem(worldKey(code));
    if (raw == null) return null;
    let world;
    try { world = JSON.parse(raw); } catch (_) { throw new Error("SAVE_CORRUPT"); }
    if (!validShape(world)) throw new Error("SAVE_CORRUPT");
    if (world.version < module.CURRENT_VERSION) {
      world = migrate(world);
      await set(world);
    }
    return world;
  }

  async function set(world) {
    world.savedAt = Date.now();
    localStorage.setItem(worldKey(world.code), JSON.stringify(world));
    upsertIndex(world);
    return world;
  }

  async function create(world) { return set(world); }

  async function remove(code) {
    localStorage.removeItem(worldKey(code));
    writeIndex(readIndex().filter(e => e.code !== code));
  }

  return Object.assign(module, {
    list, load, set, create, remove,
    _migrate: migrate, _migrations: migrations
  });
})();
