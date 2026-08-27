window.App = window.App || {};
App.state = {
  world: null,
  DECAY_PER_DAY: 10,
  NEED_FLOOR: 25,
  HAPPY_THRESHOLD: 60,

  tickNeeds(world, now) {
    const pet = world.pet;
    let elapsed = now - pet.lastTick;
    if (!(elapsed > 0)) elapsed = 0;
    const drop = (elapsed / 86400000) * App.state.DECAY_PER_DAY;
    for (const k of ["hunger", "energy", "fun"]) {
      pet.needs[k] = Math.max(App.state.NEED_FLOOR, pet.needs[k] - drop);
    }
    pet.lastTick = now;
    return world;
  },

  deriveMood(world) {
    const n = world.pet.needs;
    const lowest = Math.min(n.hunger, n.energy, n.fun);
    if (lowest >= App.state.HAPPY_THRESHOLD) return "happy";
    if (lowest === n.hunger) return "hungry";
    if (lowest === n.energy) return "sleepy";
    return "bored";
  }
};
