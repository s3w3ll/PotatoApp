window.App = window.App || {};
App.world = (function () {
  const SPECIES  = ["strawberry","broccoli","turtle","cat","frog","donut","carrot","penguin"];
  const THEMES   = ["meadow","bedroom","space","beach"];
  const STARTERS = ["rug","lamp","plant","poster","beanbag"];

  function generateWorld(code) {
    const rand = App.rng.seededFrom(code);
    const species = App.rng.pick(rand, SPECIES);
    const theme   = App.rng.pick(rand, THEMES);
    const tint    = App.rng.int(rand, 0, 359);
    const starter = App.rng.pick(rand, STARTERS);
    const now = Date.now();
    return {
      version: App.save.CURRENT_VERSION,
      code,
      savedAt: 0,
      pet: {
        species, name: "", adoptedAt: now, tint,
        needs: { hunger: 100, energy: 100, fun: 100 },
        lastTick: now,
        pos: null,      // { left, bottom } once the child drags the pet somewhere
        petLog: null    // { day, count } — daily cap on stars from petting
      },
      stars: 0,
      room: { theme, owned: [starter], placed: [] },
      learn: { factsSeen: [], game: { mathLevel: 1, spellingLevel: 1, bestStreak: 0 } }
    };
  }
  return { SPECIES, THEMES, STARTERS, generateWorld };
})();
