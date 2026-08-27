window.__pushTests(function stateTests() {
  const mk = over => ({ pet: {
    needs: Object.assign({ hunger: 100, energy: 100, fun: 100 }, over || {}),
    lastTick: 0
  }});

  // one full day drops each need by ~10
  let w = mk(); App.state.tickNeeds(w, 86400000);
  assert("~10/day hunger", Math.abs(w.pet.needs.hunger - 90) < 0.001);
  assertEq("lastTick advanced", w.pet.lastTick, 86400000);

  // floor at 25 even after a long absence
  w = mk({ hunger: 30 }); App.state.tickNeeds(w, 86400000 * 30);
  assertEq("hunger floored at 25", w.pet.needs.hunger, 25);
  assert("energy floored at 25", w.pet.needs.energy === 25);

  // negative / zero elapsed -> no change
  w = mk({ hunger: 50 }); w.pet.lastTick = 1000;
  App.state.tickNeeds(w, 500);
  assertEq("clock-back = no decay", w.pet.needs.hunger, 50);
  assertEq("lastTick still moves to now", w.pet.lastTick, 500);

  // mood derivation
  assertEq("all high -> happy", App.state.deriveMood(mk()), "happy");
  assertEq("low hunger -> hungry", App.state.deriveMood(mk({ hunger: 30 })), "hungry");
  assertEq("low energy -> sleepy", App.state.deriveMood(mk({ energy: 26 })), "sleepy");
  assertEq("low fun -> bored", App.state.deriveMood(mk({ fun: 40 })), "bored");
  assertEq("tie hunger vs energy -> hungry",
    App.state.deriveMood(mk({ hunger: 30, energy: 30 })), "hungry");
});
