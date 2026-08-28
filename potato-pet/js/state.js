window.App = window.App || {};
App.state = {
  world: null,
  // Live decay runs while the tab is open and focused: a need falls 100 -> 0
  // in two hours. Offline catch-up (tab hidden or app closed) is much gentler
  // and stops at OFFLINE_FLOOR, so coming back after a week finds a needy pet,
  // not a broken one. Only live neglect can take a need all the way to 0.
  DECAY_LIVE_PER_HOUR: 50,
  DECAY_OFFLINE_PER_HOUR: 100 / 24,
  OFFLINE_FLOOR: 20,
  HAPPY_THRESHOLD: 60,
  LOW_NEED: 40,

  tickNeeds(world, now, opts) {
    const pet = world.pet;
    const elapsed = now - pet.lastTick;
    pet.lastTick = now;
    if (!(elapsed > 0)) return world;

    const offline = !!(opts && opts.offline);
    const perHour = offline ? App.state.DECAY_OFFLINE_PER_HOUR : App.state.DECAY_LIVE_PER_HOUR;
    const floor = offline ? App.state.OFFLINE_FLOOR : 0;
    const drop = (elapsed / 3600000) * perHour;
    for (const k of ["hunger", "energy", "fun"]) {
      const next = pet.needs[k] - drop;
      // At/above the floor: take the decayed value. Below it: settle at the
      // floor, but never PULL A NEED UP that live neglect already drove lower.
      pet.needs[k] = next >= floor ? next : Math.min(pet.needs[k], floor);
    }
    return world;
  },

  // Needs that have bottomed out at 0 (live neglect only), in canonical order.
  // Drives the gentle "here's how to help me" nudges in the game screen.
  criticalNeeds(world) {
    const n = world.pet.needs;
    return ["hunger", "energy", "fun"].filter(k => n[k] <= 0);
  },

  deriveMood(world) {
    const n = world.pet.needs;
    const lowest = Math.min(n.hunger, n.energy, n.fun);
    if (lowest >= App.state.HAPPY_THRESHOLD) return "happy";
    if (lowest === n.hunger) return "hungry";
    if (lowest === n.energy) return "sleepy";
    return "bored";
  },

  // Per-need flag for the HUD meters: "low" once a need dips below LOW_NEED,
  // "ok" otherwise. The bar width itself is just the raw 0-100 value.
  needStatus(world) {
    const n = world.pet.needs;
    const tag = v => (v < App.state.LOW_NEED ? "low" : "ok");
    return { hunger: tag(n.hunger), energy: tag(n.energy), fun: tag(n.fun) };
  }
};
