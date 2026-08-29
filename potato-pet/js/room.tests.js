window.__pushTests(function roomTests() {
  const mk = (stars) => ({ stars: stars, room: { theme: "meadow", owned: ["rug"], placed: [] } });

  assert("catalog >= 27", App.room.CATALOG.length >= 27);
  App.world.STARTERS.forEach(s =>
    assert("starter " + s + " in catalog", App.room.CATALOG.some(c => c.id === s)));

  const ids = App.room.CATALOG.map(c => c.id);
  assertEq("catalog ids unique", ids.length, new Set(ids).size);
  const SETS = new Set(["classic", "space", "beach", "garden", "gadgets"]);
  assert("every item has a known set", App.room.CATALOG.every(c => SETS.has(c.set)));
  assert("prices are non-negative numbers",
    App.room.CATALOG.every(c => typeof c.price === "number" && c.price >= 0));
  assert("has a premium item to save for", App.room.CATALOG.some(c => c.price >= 20));
  SETS.forEach(s =>
    assert("set '" + s + "' has items", App.room.CATALOG.some(c => c.set === s)));

  // interactive items: at least 3, each with a real effect string, all in "gadgets"
  const inter = App.room.CATALOG.filter(c => c.interactive === true);
  assert("has >= 3 interactive items", inter.length >= 3);
  assert("every interactive item has an effect string",
    inter.every(c => typeof c.effect === "string" && c.effect.length > 0));
  assert("interactive items live in the gadgets set",
    inter.every(c => c.set === "gadgets"));
  assert("App.room.SETS exposes gadgets",
    Array.isArray(App.room.SETS) && App.room.SETS.some(s => s.id === "gadgets"));

  // a brand-new (non-classic) item still buys and places like any other
  const themed = App.room.CATALOG.find(c => c.set !== "classic");
  let tw = mk(themed.price);
  assertEq("buy themed item", App.room.buy(tw, themed.id), { ok: true });
  assertEq("themed buy deducts stars", tw.stars, 0);
  assert("themed item now owned", tw.room.owned.includes(themed.id));

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
