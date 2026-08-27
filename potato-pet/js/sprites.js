window.App = window.App || {};
App.sprites = (function () {
  const COLORS = {
    strawberry: "#e5484d", broccoli: "#3fae5a", turtle: "#2f7d5d", cat: "#d9922b",
    frog: "#5bb85b", donut: "#c98bb9", carrot: "#e08a3c", penguin: "#3a4a5a"
  };
  const baseAnims = {
    idle:  { frames: 2, fps: 2 },
    happy: { frames: 4, fps: 8 },
    eat:   { frames: 4, fps: 6 },
    sleep: { frames: 2, fps: 1 },
    peek:  { frames: 1, fps: 1 }
  };
  const manifest = {};
  (App.world.SPECIES).forEach(s => {
    manifest[s] = { placeholderColor: COLORS[s] || "#999", anims: Object.assign({}, baseAnims) };
  });
  function animFor(species, name) {
    const m = manifest[species] || { anims: baseAnims };
    return m.anims[name] || m.anims.idle;
  }
  return { manifest, animFor };
})();
