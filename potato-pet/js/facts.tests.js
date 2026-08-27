window.__pushTests(function factsTests() {
  const total = App.content.facts.length;
  const world = { learn: { factsSeen: [] } };
  const seen = new Set();
  for (let i = 0; i < total; i++) {
    const f = App.facts.tellSomething(world);
    assert("fact not repeated before exhaustion", !seen.has(f.id));
    seen.add(f.id);
  }
  assertEq("all facts consumed", seen.size, total);
  // next call wraps: factsSeen cleared then one returned
  const wrap = App.facts.tellSomething(world);
  assert("wrap returns a fact", wrap && typeof wrap.id === "number");
  assertEq("factsSeen reset to just the wrapped one", world.learn.factsSeen, [wrap.id]);

  const d1 = App.facts.factOfTheDay(new Date("2026-08-27T09:00:00"));
  const d1b = App.facts.factOfTheDay(new Date("2026-08-27T22:00:00"));
  assertEq("fact of the day stable within a day", d1.id, d1b.id);
});
