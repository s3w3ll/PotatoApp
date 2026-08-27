window.__pushTests(function backupTests() {
  const world = {
    version: 1, code: "BAK-001", savedAt: 0,
    pet: { species: "cat", name: "Nyan", adoptedAt: 1, tint: 10,
           needs: { hunger: 100, energy: 100, fun: 100 }, lastTick: 1 },
    stars: 3, room: { theme: "space", owned: ["rug"], placed: [] },
    learn: { factsSeen: [1], game: { mathLevel: 1, spellingLevel: 1, bestStreak: 0 } }
  };
  const str = App.backup.exportString(world);
  assert("export is a non-empty string", typeof str === "string" && str.length > 0);
  const back = App.backup.importString(str);
  assertEq("round-trips", back.ok && back.world.pet.name, "Nyan");

  assertEq("garbage rejected",
    App.backup.importString("!!!not base64!!!").reason, "decode");
  const badShape = btoa(JSON.stringify({ hello: 1 }));
  assertEq("bad shape rejected", App.backup.importString(badShape).reason, "shape");
});
