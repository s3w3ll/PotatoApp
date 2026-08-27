window.App = window.App || {};
App.save = (function () {
  const module = { CURRENT_VERSION: 1 };
  const INDEX_KEY = "potato-pet:index";
  const worldKey = code => "potato-pet:world:" + code;
  const backupKey = code => "potato-pet:backup:" + code;
  const PENDING_KEY = "potato-pet:pending";
  const migrations = {}; // migrations[n] : (world@vN) -> world@v(N+1)

  // ---- sync state (module-level, session) ----
  let pushTimer = null;
  let pendingSet = new Set(readPendingRaw());
  let lastPushedSerial = {};   // code -> JSON string of last world sent OK

  function readPendingRaw() {
    try { return JSON.parse(localStorage.getItem(PENDING_KEY)) || []; }
    catch (_) { return []; }
  }
  function writePending() {
    localStorage.setItem(PENDING_KEY, JSON.stringify(Array.from(pendingSet)));
  }
  function markDirty(code) { pendingSet.add(code); writePending(); }
  function clearDirty(code) { pendingSet.delete(code); writePending(); }

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
  function localTimestamp(w) {
    return w && typeof w.savedAt === "number" ? w.savedAt : 0;
  }
  function writeLocalRaw(world) {
    localStorage.setItem(worldKey(world.code), JSON.stringify(world));
    upsertIndex(world);
  }
  function readLocal(code) {
    const raw = localStorage.getItem(worldKey(code));
    if (raw == null) return null;
    let world;
    try { world = JSON.parse(raw); } catch (_) { throw new Error("SAVE_CORRUPT"); }
    if (!validShape(world)) throw new Error("SAVE_CORRUPT");
    return world;
  }

  async function list() { return readIndex(); }

  async function load(code) {
    let local = readLocal(code);          // may throw SAVE_CORRUPT (Phase 1 contract)
    if (local && local.version < module.CURRENT_VERSION) {
      local = migrate(local);
      await set(local);                   // persists + schedules a push (Phase 1 + Task 4)
    }

    if (!App.remote || !App.remote.available()) return local;

    let server;
    try { server = await App.remote.getWorld(code); }
    catch (_) { return local; }           // offline/timeout/http/bad-response -> local wins

    if (!server) {                        // no row yet
      if (local) markDirty(code);
      return local;
    }
    const lt = localTimestamp(local);
    if (server.updatedAt > lt) {          // server wins
      if (local) {
        localStorage.setItem(backupKey(code),
          JSON.stringify({ world: local, replacedAt: Date.now() }));
      }
      const adopted = server.data;
      adopted.savedAt = server.updatedAt; // normalize so next compare is a tie
      writeLocalRaw(adopted);
      lastPushedSerial[code] = serial(adopted);
      clearDirty(code);
      return adopted;
    }
    if (lt > server.updatedAt) {          // local wins
      markDirty(code);
      return local;
    }
    return local;                         // tie -> in sync
  }

  async function set(world) {
    world.savedAt = Date.now();
    localStorage.setItem(worldKey(world.code), JSON.stringify(world));
    upsertIndex(world);
    schedulePush(world);                  // Task 4
    return world;
  }

  async function create(world) {          // Task 5 adds checkCode + result object
    await set(world);
    return { ok: true };
  }

  async function remove(code) {
    localStorage.removeItem(worldKey(code));
    localStorage.removeItem(backupKey(code));
    clearDirty(code);
    delete lastPushedSerial[code];
    writeIndex(readIndex().filter(e => e.code !== code));
  }

  // ---- push scheduling ----
  const PUSH_INTERVAL_MS = 30000;
  let hideHooked = false;

  function serial(world) { return JSON.stringify(Object.assign({}, world, { savedAt: 0 })); }

  function schedulePush(world) {
    if (lastPushedSerial[world.code] === serial(world)) return;
    markDirty(world.code);
    hookHide();
    if (!pushTimer) {
      pushTimer = setTimeout(function () { pushTimer = null; doPush(); }, PUSH_INTERVAL_MS);
    }
  }

  function hookHide() {
    if (hideHooked || typeof document === "undefined") return;
    hideHooked = true;
    const flush = function () { doPush(); };
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) flush();
    });
    if (typeof window !== "undefined") window.addEventListener("pagehide", flush);
  }

  async function doPush() {
    if (!App.remote || !App.remote.available()) return;
    const codes = Array.from(pendingSet);
    for (const code of codes) {
      const local = safeReadLocal(code);
      if (!local) { clearDirty(code); continue; }
      let result;
      try {
        result = await App.remote.putWorld(code, local);
      } catch (err) {
        if (err && err.kind === "http" && err.status !== 429 && err.status < 500) {
          console.error("potato-pet sync: push rejected", err.status, err);
          clearDirty(code);
        } else if (err && err.kind === "bad-response") {
          console.error("potato-pet sync: bad push response", err);
          clearDirty(code);
        } // offline / timeout / 429 / 5xx: leave dirty, retry later
        continue;
      }
      local.savedAt = result.updatedAt;
      writeLocalRaw(local);
      lastPushedSerial[code] = serial(local);
      clearDirty(code);
    }
  }

  function safeReadLocal(code) {
    try { return readLocal(code); } catch (_) { return null; }
  }

  async function flushPush() {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    await doPush();
  }

  function resetSync() {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    pendingSet = new Set();
    lastPushedSerial = {};
    writePending();
  }

  return Object.assign(module, {
    list, load, set, create, remove,
    _migrate: migrate, _migrations: migrations,
    _readBackup: code => {
      try { return JSON.parse(localStorage.getItem(backupKey(code))); }
      catch (_) { return null; }
    },
    _pending: () => Array.from(pendingSet),
    _resetSync: resetSync,
    _flushPush: flushPush,
    _PUSH_INTERVAL_MS: PUSH_INTERVAL_MS,
  });
})();
