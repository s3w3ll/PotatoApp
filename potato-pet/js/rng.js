window.App = window.App || {};
App.rng = {
  hashCode(str) {
    let h = 2166136261 >>> 0;            // FNV-1a 32-bit
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  },
  mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  seededFrom(code) {
    return App.rng.mulberry32(App.rng.hashCode(code));
  },
  pick(rand, arr) {
    return arr[Math.floor(rand() * arr.length)];
  },
  int(rand, min, max) {
    return min + Math.floor(rand() * (max - min + 1));
  }
};
