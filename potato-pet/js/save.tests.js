window.__pushTests(async function saveTests() {
  const CODE = "TST-001";
  await App.save.remove(CODE);

  // round-trip
  const w = {
    version: App.save.CURRENT_VERSION, code: CODE, savedAt: 0,
    pet: { species: "turtle", name: "T", adoptedAt: 1, tint: 0,
           needs: { hunger: 100, energy: 100, fun: 100 }, lastTick: 1 },
    stars: 0, room: { theme: "meadow", owned: [], placed: [] },
    learn: { factsSeen: [], game: { mathLevel: 1, spellingLevel: 1, bestStreak: 0 } }
  };
  const saved = await App.save.set(w);
  assert("set stamps savedAt", saved.savedAt > 0);
  const loaded = await App.save.load(CODE);
  assertEq("round-trips pet name", loaded.pet.name, "T");

  // index reflects the save
  const idx = await App.save.list();
  assert("index contains code", idx.some(e => e.code === CODE && e.species === "turtle"));

  // absent code -> null
  assertEq("missing code returns null", await App.save.load("NO-PE1"), null);

  // corrupt -> throws SAVE_CORRUPT (write junk through the raw key)
  localStorage.setItem("potato-pet:world:" + CODE, "{not json");
  await assertThrowsAsync("corrupt parse throws SAVE_CORRUPT",
    () => App.save.load(CODE), "SAVE_CORRUPT");
  localStorage.setItem("potato-pet:world:" + CODE, JSON.stringify({ nope: true }));
  await assertThrowsAsync("bad shape throws SAVE_CORRUPT",
    () => App.save.load(CODE), "SAVE_CORRUPT");

  // migration: register a temporary 1->2 step, bump CURRENT_VERSION locally
  const realCurrent = App.save.CURRENT_VERSION;
  App.save._migrations[1] = world => { world.learn.game.newField = 42; world.version = 2; return world; };
  Object.defineProperty(App.save, "CURRENT_VERSION", { value: 2, configurable: true });
  const v1 = Object.assign({}, w, { version: 1, code: "MIG-001" });
  v1.learn = { factsSeen: [], game: { mathLevel: 1, spellingLevel: 1, bestStreak: 0 } };
  localStorage.setItem("potato-pet:world:MIG-001", JSON.stringify(v1));
  const migrated = await App.save.load("MIG-001");
  assertEq("migration ran", migrated.learn.game.newField, 42);
  assertEq("migration bumped version", migrated.version, 2);
  // restore
  delete App.save._migrations[1];
  Object.defineProperty(App.save, "CURRENT_VERSION", { value: realCurrent, configurable: true });
  await App.save.remove("MIG-001");
  await App.save.remove(CODE);
});

window.__pushTests(async function saveSyncLoadTests() {
  const CODE = "SYN-C01";
  const mk = (savedAt, name) => ({
    version: App.save.CURRENT_VERSION, code: CODE, savedAt: savedAt,
    pet: { species: "cat", name: name, adoptedAt: 1, tint: 0,
           needs: { hunger: 50, energy: 50, fun: 50 }, lastTick: 1 },
    stars: 0, room: { theme: "meadow", owned: [], placed: [] },
    learn: { factsSeen: [], game: { mathLevel: 1, spellingLevel: 1, bestStreak: 0 } },
  });

  // fake remote
  const realRemote = App.remote;
  function fakeRemote(over) {
    return Object.assign({
      available: () => true,
      getWorld: async () => null,
      putWorld: async () => ({ updatedAt: Date.now() }),
      probe: async () => false,
      RemoteError: realRemote.RemoteError,
    }, over);
  }

  // --- server newer -> local backed up, server world adopted ---
  App.save._resetSync && App.save._resetSync();
  await App.save.remove(CODE);
  localStorage.removeItem("potato-pet:backup:" + CODE);
  App.remote = fakeRemote({
    getWorld: async () => ({ data: mk(500, "Server"), version: 1, updatedAt: 900 }),
  });
  await App.save.set(mk(100, "Local"));          // local savedAt gets stamped to now...
  // force local to look older than the server:
  const older = mk(1, "Local"); older.savedAt = 1;
  localStorage.setItem("potato-pet:world:" + CODE, JSON.stringify(older));
  const got = await App.save.load(CODE);
  assertEq("server-newer: adopts server world", got.pet.name, "Server");
  assertEq("server-newer: savedAt normalized to server updatedAt", got.savedAt, 900);
  const bk = App.save._readBackup(CODE);
  assert("server-newer: backup slot holds old local", bk && bk.world.pet.name === "Local");
  assert("server-newer: backup has replacedAt", bk && typeof bk.replacedAt === "number");

  // --- local newer -> server untouched, code marked pending ---
  App.save._resetSync();
  await App.save.remove(CODE);
  let putCalls = 0;
  App.remote = fakeRemote({
    getWorld: async () => ({ data: mk(10, "Server"), version: 1, updatedAt: 10 }),
    putWorld: async () => { putCalls++; return { updatedAt: 12345 }; },
  });
  const localNew = mk(1, "LocalNew"); localNew.savedAt = 99999;
  localStorage.setItem("potato-pet:world:" + CODE, JSON.stringify(localNew));
  const got2 = await App.save.load(CODE);
  assertEq("local-newer: keeps local", got2.pet.name, "LocalNew");
  assert("local-newer: code is pending", App.save._pending().indexOf(CODE) !== -1);

  // --- remote unavailable -> Phase 1 behaviour exactly ---
  App.save._resetSync();
  App.remote = fakeRemote({ available: () => false });
  await App.save.remove(CODE);
  assertEq("unavailable: missing code still returns null", await App.save.load(CODE), null);
  localStorage.setItem("potato-pet:world:" + CODE, JSON.stringify(mk(5, "Solo")));
  assertEq("unavailable: returns local unchanged", (await App.save.load(CODE)).pet.name, "Solo");

  // --- getWorld throws -> local returned, no throw escapes ---
  App.save._resetSync();
  App.remote = fakeRemote({
    getWorld: async () => { throw realRemote.RemoteError("offline"); },
  });
  localStorage.setItem("potato-pet:world:" + CODE, JSON.stringify(mk(7, "Offline")));
  assertEq("getWorld throws: returns local", (await App.save.load(CODE)).pet.name, "Offline");

  App.remote = realRemote;
  App.save._resetSync();
  await App.save.remove(CODE);
  localStorage.removeItem("potato-pet:backup:" + CODE);
});

window.__pushTests(async function saveSyncPushTests() {
  const CODE = "PSH-001";
  const realRemote = App.remote;
  const base = () => ({
    version: App.save.CURRENT_VERSION, code: CODE, savedAt: 0,
    pet: { species: "frog", name: "P", adoptedAt: 1, tint: 0,
           needs: { hunger: 50, energy: 50, fun: 50 }, lastTick: 1 },
    stars: 0, room: { theme: "meadow", owned: [], placed: [] },
    learn: { factsSeen: [], game: { mathLevel: 1, spellingLevel: 1, bestStreak: 0 } },
  });
  const fake = (over) => Object.assign({
    available: () => true,
    getWorld: async () => null,
    putWorld: async () => ({ updatedAt: 777 }),
    probe: async () => false,
    RemoteError: realRemote.RemoteError,
  }, over);

  // debounce: N rapid sets -> at most one putWorld
  App.save._resetSync();
  await App.save.remove(CODE);
  let puts = [];
  App.remote = fake({ putWorld: async (c, w) => { puts.push(JSON.parse(JSON.stringify(w))); return { updatedAt: 777 }; } });
  const w = base();
  await App.save.set(w); w.stars = 1;
  await App.save.set(w); w.stars = 2;
  await App.save.set(w);
  await App.save._flushPush();
  assertEq("debounce collapses to one push", puts.length, 1);
  assertEq("push sends the latest world", puts[0].stars, 2);
  assert("push clears pending", App.save._pending().indexOf(CODE) === -1);
  assertEq("push normalizes savedAt to server updatedAt",
    JSON.parse(localStorage.getItem("potato-pet:world:" + CODE)).savedAt, 777);

  // unchanged world -> zero pushes
  App.save._resetSync();
  puts = [];
  await App.save.set(w);            // stars still 2, but _resetSync cleared lastPushedSerial
  await App.save._flushPush();      // this one pushes (serial unknown after reset)
  puts = [];
  await App.save.set(w);            // identical world now
  await App.save._flushPush();
  assertEq("identical world -> no push", puts.length, 0);

  // 5xx -> stays dirty
  App.save._resetSync();
  await App.save.remove(CODE);
  App.remote = fake({ putWorld: async () => { throw realRemote.RemoteError("http", 503); } });
  await App.save.set(base());
  await App.save._flushPush();
  assert("5xx keeps code pending", App.save._pending().indexOf(CODE) !== -1);

  // 422 -> logged + dirty cleared
  App.save._resetSync();
  await App.save.remove(CODE);
  let errs = 0; const origErr = console.error; console.error = () => { errs++; };
  App.remote = fake({ putWorld: async () => { throw realRemote.RemoteError("http", 422); } });
  await App.save.set(base());
  await App.save._flushPush();
  console.error = origErr;
  assert("422 was logged", errs > 0);
  assert("422 clears pending (no doomed retry)", App.save._pending().indexOf(CODE) === -1);

  App.remote = realRemote;
  App.save._resetSync();
  await App.save.remove(CODE);
});
