window.App = window.App || {};
App.sprites = (function () {
  const COLORS = {
    strawberry: "#e5484d", broccoli: "#3fae5a", turtle: "#2f7d5d", cat: "#d9922b",
    frog: "#5bb85b", donut: "#c98bb9", carrot: "#e08a3c", penguin: "#3a4a5a"
  };
  const CELL = 32, COLS = 2, VARIANTS = 4;
  const ANIMS = {
    idle:  { row: 0, frames: 2, fps: 2 },
    happy: { row: 1, frames: 2, fps: 8 },
    eat:   { row: 2, frames: 2, fps: 6 },
    sleep: { row: 3, frames: 2, fps: 1 }
  };
  const ROWS = Object.keys(ANIMS).length;
  const manifest = {};
  (App.world.SPECIES).forEach(s => {
    manifest[s] = {
      cell: CELL, cols: COLS, variants: VARIANTS, rows: ROWS,
      placeholderColor: COLORS[s] || "#999",
      sheet: v => "assets/sprites/pet/" + s + "-" + v + ".png",
      anims: ANIMS
    };
  });
  function animFor(species, name) {
    const m = manifest[species];
    const a = (m && m.anims) || ANIMS;
    return a[name] || a.idle;
  }
  function variantFor(tint) {
    const t = (typeof tint === "number" && isFinite(tint)) ? tint : 0;
    return ((Math.floor(t / 90) % VARIANTS) + VARIANTS) % VARIANTS;
  }
  return { manifest, animFor, variantFor, CELL, COLS, VARIANTS };
})();
