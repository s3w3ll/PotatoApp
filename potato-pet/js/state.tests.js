window.__pushTests(function stateTests() {
  const mk = over => ({ pet: {
    needs: Object.assign({ hunger: 100, energy: 100, fun: 100 }, over || {}),
    lastTick: 0
  }});

  // live decay (open, foreground tab): a need empties in ~2 hours
  let w = mk(); App.state.tickNeeds(w, 7200000);
  assert("live: hunger ~0 after 2h", w.pet.needs.hunger < 0.001);
  assertEq("live: lastTick advanced", w.pet.lastTick, 7200000);
  w = mk(); App.state.tickNeeds(w, 3600000);
  assert("live: ~50 lost in one hour", Math.abs(w.pet.needs.energy - 50) < 0.001);

  // live decay bottoms out at 0, never negative
  w = mk({ fun: 10 }); App.state.tickNeeds(w, 7200000);
  assertEq("live: floors at 0", w.pet.needs.fun, 0);

  // offline catch-up (away / hidden tab): gentler, empties in ~24 hours
  w = mk(); App.state.tickNeeds(w, 3600000, { offline: true });
  assert("offline: ~4.17 lost in one hour",
    Math.abs(w.pet.needs.hunger - (100 - 100 / 24)) < 0.01);

  // offline catch-up never drags a need below the 20 floor
  w = mk(); App.state.tickNeeds(w, 86400000 * 7, { offline: true });
  assertEq("offline: floored at 20 after a week away", w.pet.needs.hunger, 20);

  // a need already below the floor (from live neglect) is left where it is
  w = mk({ energy: 5 }); App.state.tickNeeds(w, 86400000 * 7, { offline: true });
  assertEq("offline: won't raise a sub-floor need", w.pet.needs.energy, 5);

  // negative / zero elapsed -> no change
  w = mk({ hunger: 50 }); w.pet.lastTick = 1000;
  App.state.tickNeeds(w, 500);
  assertEq("clock-back = no decay", w.pet.needs.hunger, 50);
  assertEq("lastTick still moves to now", w.pet.lastTick, 500);

  // criticalNeeds: which needs have bottomed out at 0
  assertEq("nothing critical when full", App.state.criticalNeeds(mk()), []);
  assertEq("hunger at 0 is critical",
    App.state.criticalNeeds(mk({ hunger: 0 })), ["hunger"]);
  assertEq("criticals listed in need order",
    App.state.criticalNeeds(mk({ hunger: 0, fun: 0 })), ["hunger", "fun"]);

  // mood derivation
  assertEq("all high -> happy", App.state.deriveMood(mk()), "happy");
  assertEq("low hunger -> hungry", App.state.deriveMood(mk({ hunger: 30 })), "hungry");
  assertEq("low energy -> sleepy", App.state.deriveMood(mk({ energy: 26 })), "sleepy");
  assertEq("low fun -> bored", App.state.deriveMood(mk({ fun: 40 })), "bored");
  assertEq("tie hunger vs energy -> hungry",
    App.state.deriveMood(mk({ hunger: 30, energy: 30 })), "hungry");

  // needStatus: "low" once a need is below LOW_NEED (40), "ok" at or above
  assertEq("all healthy -> all ok",
    App.state.needStatus(mk()), { hunger: "ok", energy: "ok", fun: "ok" });
  assertEq("hunger 39 -> low",
    App.state.needStatus(mk({ hunger: 39 })).hunger, "low");
  assertEq("energy exactly at threshold -> ok",
    App.state.needStatus(mk({ energy: App.state.LOW_NEED })).energy, "ok");
  assertEq("two needs low -> both flagged",
    App.state.needStatus(mk({ energy: 10, fun: 20 })),
    { hunger: "ok", energy: "low", fun: "low" });
});
