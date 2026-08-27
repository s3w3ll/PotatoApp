window.__pushTests(function roomTests() {
  const mk = (stars) => ({ stars: stars, room: { theme: "meadow", owned: ["rug"], placed: [] } });

  assert("catalog >= 10", App.room.CATALOG.length >= 10);
  App.world.STARTERS.forEach(s =>
    assert("starter " + s + " in catalog", App.room.CATALOG.some(c => c.id === s)));

  const cheap = App.room.CATALOG.find(c => !App.world.STARTERS.includes(c.id));
  let w = mk(cheap.price);
  assertEq("canBuy with enough stars", App.room.canBuy(w, cheap.id), true);
  assertEq("buy succeeds", App.room.buy(w, cheap.id), { ok: true });
  assertEq("stars deducted", w.stars, 0);
  assert("now owned", w.room.owned.includes(cheap.id));
  assertEq("cannot rebuy", App.room.canBuy(w, cheap.id), false);
  assertEq("buy fails when broke", App.room.buy(w, cheap.id), { ok: false });

  w = mk(0);
  assertEq("place needs ownership",
    App.room.place(w, "lamp", 0, 0), { ok: false, reason: "not-owned" });
  assertEq("place in bounds ok", App.room.place(w, "rug", 3, 3), { ok: true });
  assertEq("cell now occupied", App.room.cellOccupied(w, 3, 3), true);
  assertEq("out of bounds rejected",
    App.room.place(w, "rug", 12, 0), { ok: false, reason: "out-of-bounds" });
  // moving the same item: only one placement exists
  App.room.place(w, "rug", 5, 5);
  assertEq("item placed once", w.room.placed.filter(p => p.item === "rug").length, 1);
  assertEq("old cell freed", App.room.cellOccupied(w, 3, 3), false);
  // occupied by a different item
  w.room.owned.push("lamp");
  App.room.place(w, "lamp", 6, 6);
  assertEq("occupied cell rejected",
    App.room.place(w, "rug", 6, 6), { ok: false, reason: "occupied" });
  App.room.pickUp(w, "rug");
  assertEq("pickUp removes placement", w.room.placed.some(p => p.item === "rug"), false);
});
