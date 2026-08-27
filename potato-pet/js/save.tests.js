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
