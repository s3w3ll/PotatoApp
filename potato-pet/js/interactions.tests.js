window.__pushTests(function interactionsTests() {
  const mk = () => ({ pet: { species: "turtle", needs: { hunger: 50, energy: 50, fun: 50 } }, stars: 0 });

  let w = mk();
  const r1 = App.interactions.feed(w, "apple");
  assertEq("feed +30 hunger", w.pet.needs.hunger, 80);
  assertEq("feed +1 star", w.stars, 1);
  assertEq("feed result", r1, { starsGained: 1 });
  w.pet.needs.hunger = 90; App.interactions.feed(w, "cake");
  assertEq("feed caps at 100", w.pet.needs.hunger, 100);

  // feeding is hunger recovery only — it must not cost energy
  w = mk();
  App.interactions.feed(w, "apple");
  assertEq("feed leaves energy untouched", w.pet.needs.energy, 50);

  // playing tires the pet out: spendEnergy drains energy, clamped to [0,100]
  w = mk();
  App.interactions.spendEnergy(w, App.interactions.HIDE_ENERGY_COST);
  assertEq("Hide & Seek round costs energy",
    w.pet.needs.energy, 50 - App.interactions.HIDE_ENERGY_COST);
  App.interactions.spendEnergy(w, App.interactions.LEARN_ENERGY_COST);
  assertEq("Learn round costs energy too",
    w.pet.needs.energy, 50 - App.interactions.HIDE_ENERGY_COST - App.interactions.LEARN_ENERGY_COST);
  assert("Hide & Learn costs are positive",
    App.interactions.HIDE_ENERGY_COST > 0 && App.interactions.LEARN_ENERGY_COST > 0);
  w.pet.needs.energy = 5; App.interactions.spendEnergy(w, 40);
  assertEq("spendEnergy floors at 0", w.pet.needs.energy, 0);

  w = mk();
  assertEq("canSleep when tired", App.interactions.canSleep(w), true);
  w.pet.needs.energy = 90;
  assertEq("cannot sleep when fresh", App.interactions.canSleep(w), false);
  assertEq("putToBed refused when fresh", App.interactions.putToBed(w), { ok: false, starsGained: 0 });
  w.pet.needs.energy = 40;
  const rb = App.interactions.putToBed(w);
  assertEq("putToBed refills energy", w.pet.needs.energy, 100);
  assertEq("putToBed result", rb, { ok: true, starsGained: 1 });

  // petting: +1 star per pat, capped per day, cap resets the next day
  w = mk();
  const DAY = 86400000, t0 = 5 * DAY + 1000;
  const first = App.interactions.petPet(w, t0);
  assertEq("first pat gives a star", first, { starsGained: 1, capped: false });
  assertEq("pat star landed", w.stars, 1);
  let capped;
  for (let i = 0; i < 20; i++) capped = App.interactions.petPet(w, t0 + i * 1000);
  assertEq("pats stop giving stars once capped", capped.starsGained, 0);
  assert("capped flag set", capped.capped === true);
  assertEq("daily cap honoured", w.stars, App.interactions.PET_STARS_PER_DAY);
  const nextDay = App.interactions.petPet(w, t0 + DAY);
  assertEq("cap resets next day", nextDay, { starsGained: 1, capped: false });
  assertEq("star after reset", w.stars, App.interactions.PET_STARS_PER_DAY + 1);

  w = mk();
  const round = App.interactions.newHideRound(w, 12345);
  const N = App.interactions.SPOT_COUNT;
  assert("spot count matches SPOT_COUNT", round.spots.length === N);
  assert("hidingSpot in range", round.hidingSpot >= 0 && round.hidingSpot < N);
  const wrongGuess = (round.hidingSpot + 1) % N;
  const miss = App.interactions.guessSpot(round, w, wrongGuess);
  assertEq("miss has no penalty", miss, { found: false, starsGained: 0, funGained: 0 });
  assertEq("miss doesn't change stars", w.stars, 0);
  const hit = App.interactions.guessSpot(round, w, round.hidingSpot);
  assertEq("hit result", hit, { found: true, starsGained: 4, funGained: 25 });
  assertEq("hit +25 fun", w.pet.needs.fun, 75);
  assertEq("hit +4 stars", w.stars, 4);
});
