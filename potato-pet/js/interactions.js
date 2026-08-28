window.App = window.App || {};
App.interactions = (function () {
  const FOODS = ["apple", "cookie", "carrot", "fish", "cake"];
  const SPOT_COUNT = 5;
  const clamp100 = v => Math.min(100, v);
  const clampNeed = v => Math.max(0, Math.min(100, v));

  // Energy a completed round of each activity costs the pet. Playing makes it
  // tired, which is what makes Bedtime reachable within a single session.
  const HIDE_ENERGY_COST = 12;
  const LEARN_ENERGY_COST = 10;

  function spendEnergy(world, n) {
    world.pet.needs.energy = clampNeed(world.pet.needs.energy - n);
  }

  function happyLine() {
    const lines = App.content.moodLines.happy;
    return lines[Math.floor(Math.random() * lines.length)];
  }

  function feed(world, foodId) {
    world.pet.needs.hunger = clamp100(world.pet.needs.hunger + 30);
    world.stars += 1;
    if (App.pet) {
      App.pet.showFood(foodId);
      App.pet.playAnim("eat");
      App.pet.speak(happyLine());
    }
    return { starsGained: 1 };
  }
  function canSleep(world) { return world.pet.needs.energy <= 80; }
  function putToBed(world) {
    if (!canSleep(world)) return { ok: false, starsGained: 0 };
    world.pet.needs.energy = 100;
    world.stars += 1;
    if (App.pet) { App.pet.playAnim("sleep"); App.pet.speak("Zzz…"); }
    return { ok: true, starsGained: 1 };
  }
  function newHideRound(world, seed) {
    const rand = App.rng.mulberry32((seed == null ? Date.now() : seed) >>> 0);
    return { spots: Array.from({ length: SPOT_COUNT }, (_, i) => i),
             hidingSpot: App.rng.int(rand, 0, SPOT_COUNT - 1) };
  }
  function guessSpot(round, world, guess) {
    if (guess === round.hidingSpot) {
      world.pet.needs.fun = clamp100(world.pet.needs.fun + 25);
      world.stars += 4;
      if (App.pet) { App.pet.playAnim("happy"); App.pet.speak("You found me! Hee hee!"); }
      return { found: true, starsGained: 4, funGained: 25 };
    }
    if (App.pet) App.pet.speak("Not there… *giggle*");
    return { found: false, starsGained: 0, funGained: 0 };
  }

  return {
    FOODS, SPOT_COUNT, HIDE_ENERGY_COST, LEARN_ENERGY_COST,
    feed, canSleep, putToBed, spendEnergy, newHideRound, guessSpot
  };
})();
