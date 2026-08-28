window.__pushTests(function interactionsTests() {
  const mk = () => ({ pet: { species: "turtle", needs: { hunger: 50, energy: 50, fun: 50 } }, stars: 0 });

  let w = mk();
  const r1 = App.interactions.feed(w, "apple");
  assertEq("feed +30 hunger", w.pet.needs.hunger, 80);
  assertEq("feed +1 star", w.stars, 1);
  assertEq("feed result", r1, { starsGained: 1 });
  w.pet.needs.hunger = 90; App.interactions.feed(w, "cake");
  assertEq("feed caps at 100", w.pet.needs.hunger, 100);

  w = mk();
  assertEq("canSleep when tired", App.interactions.canSleep(w), true);
  w.pet.needs.energy = 90;
  assertEq("cannot sleep when fresh", App.interactions.canSleep(w), false);
  assertEq("putToBed refused when fresh", App.interactions.putToBed(w), { ok: false, starsGained: 0 });
  w.pet.needs.energy = 40;
  const rb = App.interactions.putToBed(w);
  assertEq("putToBed refills energy", w.pet.needs.energy, 100);
  assertEq("putToBed result", rb, { ok: true, starsGained: 1 });

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
