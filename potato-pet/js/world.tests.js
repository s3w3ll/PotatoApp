window.__pushTests(function worldTests() {
  const a = App.world.generateWorld("K7F-9Q2");
  const b = App.world.generateWorld("K7F-9Q2");
  assertEq("same code -> same species", a.pet.species, b.pet.species);
  assertEq("same code -> same theme", a.room.theme, b.room.theme);
  assertEq("same code -> same tint", a.pet.tint, b.pet.tint);
  assertEq("same code -> same starter", a.room.owned, b.room.owned);

  assert("species is valid", App.world.SPECIES.includes(a.pet.species));
  assert("theme is valid", App.world.THEMES.includes(a.room.theme));
  assert("tint in 0..359", a.pet.tint >= 0 && a.pet.tint <= 359);
  assert("starts with one owned decoration", a.room.owned.length === 1);
  assert("placed starts empty", a.room.placed.length === 0);
  assertEq("needs full", a.pet.needs, { hunger: 100, energy: 100, fun: 100 });
  assertEq("stars zero", a.stars, 0);
  assertEq("name empty", a.pet.name, "");
  assertEq("version matches save", a.version, App.save.CURRENT_VERSION);
  assertEq("factsSeen empty", a.learn.factsSeen, []);
  assertEq("game defaults", a.learn.game, { mathLevel: 1, spellingLevel: 1, bestStreak: 0 });

  // different codes generally differ across a sample
  const species = new Set();
  ["AAA-AAA","BBB-BBB","CCC-CCC","DDD-DDD","EEE-EEE","FFF-FFF"].forEach(
    c => species.add(App.world.generateWorld(c).pet.species));
  assert("codes spread across species", species.size >= 3);
});
