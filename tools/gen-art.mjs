// Potato Pet art generator. node:zlib only, no deps. Deterministic output.
// Run:  node gen-art.mjs           regenerate every PNG under potato-pet/assets/sprites/
//       node gen-art.mjs --preview print ASCII of every sprite, write nothing
import fs from "node:fs";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

export const PNG_SIG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "latin1"), Buffer.from(data)]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}

function hexToRGB(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

export function encodePNG({ width, height, palette, indices }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 3;   // colour type: indexed
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  const plte = Buffer.alloc(palette.length * 3);
  palette.forEach((h, i) => {
    const [r, g, b] = hexToRGB(h);
    plte[i * 3] = r; plte[i * 3 + 1] = g; plte[i * 3 + 2] = b;
  });

  const trns = Buffer.from([0]); // palette index 0 fully transparent

  const raw = Buffer.alloc(height * (1 + width));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width)] = 0; // filter: none
    for (let x = 0; x < width; x++) raw[y * (1 + width) + 1 + x] = indices[y * width + x];
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    Buffer.from(PNG_SIG),
    chunk("IHDR", ihdr),
    chunk("PLTE", plte),
    chunk("tRNS", trns),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ===================================================================
// Pixel-grid DSL
// ===================================================================

// A "grid" is { w, h, rows: string[] } — each row w chars, each char a
// palette key or "." (transparent). Grids carry no palette; callers map
// keys -> hex at pack time.

export function parseGrid({ palette, pixels }) {
  const h = pixels.length;
  const w = Math.max(...pixels.map(r => r.length));
  const rows = pixels.map(r => (r + ".".repeat(w)).slice(0, w).replace(/ /g, "."));
  for (const r of rows) for (const ch of r) {
    if (ch !== "." && !(ch in palette)) throw new Error("parseGrid: unknown key '" + ch + "'");
  }
  return { w, h, rows };
}

const g2d = g => g.rows.map(r => r.split(""));
const from2d = cells => ({ w: cells[0].length, h: cells.length, rows: cells.map(r => r.join("")) });

function scale2x(g) {
  const out = [];
  for (const row of g2d(g)) { const o = row.flatMap(c => [c, c]); out.push(o, o.slice()); }
  return from2d(out);
}

function pad(g, W, H) {
  const src = g2d(g);
  const ox = Math.floor((W - g.w) / 2), oy = Math.floor((H - g.h) / 2);
  const out = Array.from({ length: H }, () => Array(W).fill("."));
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const ty = oy + y, tx = ox + x;
    if (ty >= 0 && ty < H && tx >= 0 && tx < W) out[ty][tx] = src[y][x];
  }
  return from2d(out);
}

function bbox(cells) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < cells.length; y++) for (let x = 0; x < cells[0].length; x++)
    if (cells[y][x] !== ".") { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}

function shiftY(g, dy) {
  const src = g2d(g), out = Array.from({ length: g.h }, () => Array(g.w).fill("."));
  for (let y = 0; y < g.h; y++) { const sy = y - dy; if (sy >= 0 && sy < g.h) out[y] = src[sy].slice(); }
  return from2d(out);
}

function widen(g) {
  const cells = g2d(g), out = cells.map(r => r.slice());
  for (let y = 0; y < g.h; y++) {
    const xs = []; for (let x = 0; x < g.w; x++) if (cells[y][x] !== ".") xs.push(x);
    if (!xs.length) continue;
    const lo = xs[0], hi = xs[xs.length - 1];
    if (lo - 1 >= 0 && out[y][lo - 1] === ".") out[y][lo - 1] = cells[y][lo];
    if (hi + 1 < g.w && out[y][hi + 1] === ".") out[y][hi + 1] = cells[y][hi];
  }
  return from2d(out);
}

function mouthOpen(g, darkKey) {
  const cells = g2d(g), b = bbox(cells), out = cells.map(r => r.slice());
  if (b.x1 < 0) return from2d(out);
  const cx = Math.floor((b.x0 + b.x1) / 2);
  const my = b.y1 - Math.max(3, Math.floor((b.y1 - b.y0) * 0.28));
  for (let y = my; y <= my + 1; y++) for (let x = cx - 1; x <= cx + 1; x++)
    if (y >= 0 && y < g.h && x >= 0 && x < g.w && cells[y][x] !== ".") out[y][x] = darkKey;
  return from2d(out);
}

function flattenSleep(g, factor) {
  const cells = g2d(g), b = bbox(cells);
  const out = Array.from({ length: g.h }, () => Array(g.w).fill("."));
  if (b.x1 < 0) return from2d(out);
  const srcH = b.y1 - b.y0 + 1, dstH = Math.max(1, Math.round(srcH * factor));
  for (let dy = 0; dy < dstH; dy++) {
    const sy = b.y0 + Math.min(srcH - 1, Math.floor(dy / factor));
    const ty = b.y1 - dstH + 1 + dy;
    if (ty >= 0 && ty < g.h) out[ty] = cells[sy].slice();
  }
  return from2d(out);
}

function drawZ(g, phase, zKey) {
  const out = g2d(g).map(r => r.slice());
  const zx = g.w - 8 + phase, zy = 3 - phase;
  const glyph = ["zzzz", "..z.", ".z..", "zzzz"];
  for (let i = 0; i < glyph.length; i++) for (let j = 0; j < 4; j++) {
    if (glyph[i][j] === "z") {
      const y = zy + i, x = zx + j;
      if (y >= 0 && y < g.h && x >= 0 && x < g.w) out[y][x] = zKey;
    }
  }
  return from2d(out);
}

function deriveFrames(base32, palette) {
  const K = "K" in palette ? "K" : Object.keys(palette)[0];
  const up = shiftY(base32, -1);
  return {
    idle:  [base32, up],
    happy: [up, widen(up)],
    eat:   [base32, mouthOpen(base32, K)],
    sleep: [drawZ(flattenSleep(base32, 0.72), 0, "z"), drawZ(flattenSleep(base32, 0.72), 1, "z")],
  };
}

// ===================================================================
// Colour: hex <-> hsl, and per-variant recolour
// ===================================================================

function hexToHsl(hex) {
  let [r, g, b] = hexToRGB(hex).map(v => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  const l = (mx + mn) / 2;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  return [h, s, l];
}

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.min(1, Math.max(0, s));
  l = Math.min(1, Math.max(0, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = v => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return "#" + to(r) + to(g) + to(b);
}

const VARIANT_MODES = ["natural", "warm", "cool", "pale"];

function recolorPalette(palette, mode) {
  const out = {};
  for (const [k, hex] of Object.entries(palette)) {
    if (k === "K" || k === "z" || mode === "natural") { out[k] = hex; continue; }
    let [h, s, l] = hexToHsl(hex);
    if (mode === "warm") { h -= 22; s = Math.min(1, s + 0.06); }
    else if (mode === "cool") { h += 40; }
    else if (mode === "pale") { l = Math.min(1, l + 0.16); s = Math.max(0, s - 0.22); }
    out[k] = hslToHex(h, s, l);
  }
  return out;
}

// ===================================================================
// Sheet packing + PNG output
// ===================================================================

function packSheet(rowsOfFrames, keyToHex) {
  const CELL = 32, COLS = 2, ROWS = rowsOfFrames.length;
  const W = COLS * CELL, H = ROWS * CELL;
  const palette = ["#000000"];
  const index = new Map([["#000000", 0]]);
  const idxOf = hex => {
    if (!index.has(hex)) { index.set(hex, palette.length); palette.push(hex); }
    return index.get(hex);
  };
  const indices = new Uint8Array(W * H);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const cells = g2d(rowsOfFrames[r][c]);
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
      const key = cells[y][x];
      indices[(r * CELL + y) * W + (c * CELL + x)] = key === "." ? 0 : idxOf(keyToHex[key]);
    }
  }
  return { width: W, height: H, palette, indices };
}

// A single 32x32 image (room tile or decoration). Index 0 stays transparent
// even for opaque tiles (no pixel uses it) so every PNG carries a tRNS chunk.
function packCell(grid, keyToHex) {
  const cells = g2d(grid);
  const palette = ["#000000"];
  const index = new Map([["#000000", 0]]);
  const idxOf = hex => {
    if (!index.has(hex)) { index.set(hex, palette.length); palette.push(hex); }
    return index.get(hex);
  };
  const indices = new Uint8Array(32 * 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const key = cells[y][x];
    indices[y * 32 + x] = key === "." ? 0 : idxOf(keyToHex[key]);
  }
  return { width: 32, height: 32, palette, indices };
}

// ===================================================================
// Art data
// ===================================================================

const SPECIES = "strawberry broccoli turtle cat frog donut carrot penguin".split(" ");

const SPECIES_ART = {
  strawberry: {
    palette: { K: "#40201f", r: "#e5484d", d: "#b3272c", g: "#3fae5a", y: "#ffd97d" },
    pixels: [
      "......gg........",
      ".....gKKg.......",
      "....gKrrKg......",
      "...KKrrrrKK.....",
      "..KrryrrrrK.....",
      "..KryrrrryrK....",
      ".KrrrryrrrrK....",
      ".KryrrrrrrryK...",
      ".KrrrryrrdrrK...",
      "..KryrrrrrrK....",
      "..KrrryrrryK....",
      "...KrrrrrrK.....",
      "...KKrrrrKK.....",
      ".....KrrK.......",
      "......KK........",
    ],
  },
  broccoli: {
    palette: { K: "#1f3a1f", g: "#3fae5a", d: "#2f8a45", s: "#cdb98a" },
    pixels: [
      "....gg..gg.....",
      "...gKggggKg....",
      "..gKgddgggKg...",
      ".gKggggddgggK..",
      ".KgdggggggddgK.",
      ".KggddgggggggK.",
      "..KgggggddggK..",
      "...KKgggggKK...",
      ".....KssK......",
      ".....KssK......",
      ".....KssK......",
      "....KKssKK.....",
      ".....KKKK......",
    ],
  },
  turtle: {
    palette: { K: "#173d2c", g: "#2f7d5d", d: "#1d5a41", h: "#8fd0a8", y: "#ffd97d" },
    pixels: [
      "................",
      "....KKKKKKK.....",
      "...KggddggK.....",
      "..KghgddghgK....",
      "..KgddhhddgK....",
      ".KghddggddhgK...",
      ".Kgddhggh ddgK.",
      ".Kghggddggh gK.",
      "..KggddhhggK....",
      "...KKgddgKK.....",
      "..KK.KKKK.KK....",
      ".K.....y....K...",
      ".K..........K..",
    ],
  },
  cat: {
    palette: { K: "#2b2320", f: "#d9922b", d: "#b5771f", E: "#1b3a5c", w: "#ffffff" },
    pixels: [
      "..K.........K...",
      ".KfK.......KfK..",
      ".KffKKKKKKKffK..",
      ".KfffffffffffK..",
      "KffEffffffEffK..",
      "KffffffwwffffK..",
      "KffdffffffdffK..",
      "KffffffffffffK..",
      ".KffffffffffK...",
      "..KffffffffK....",
      "..KffKKKKffK....",
      "..KfK...KfK.....",
      "..KK.....KK.....",
      "...........Kdd..",
      "............KKd.",
    ],
  },
  frog: {
    palette: { K: "#1c3a1c", g: "#5bb85b", d: "#3f8f3f", E: "#101010", w: "#ffffff" },
    pixels: [
      "...KK......KK...",
      "..KwEK....KwEK..",
      "..KEEK....KEEK..",
      ".KKggKKKKKKggKK.",
      ".KggggggggggggK.",
      "KgdggggggggdggK",
      "KggggddddggggK.",
      "KgdgggggggggdgK",
      ".KggddgggddggK.",
      ".KKgggggggggKK.",
      "..KKgKKKKgKK...",
      "..K.K....K.K...",
    ],
  },
  donut: {
    palette: { K: "#5a3b2a", p: "#c98bb9", d: "#a86aa0", i: "#7d4b6f", y: "#ffd97d", c: "#8fd0e0" },
    pixels: [
      "...KKKKKKKK.....",
      "..KppdppyppK....",
      ".KpypppcpppdK...",
      ".KppppKKppppK..",
      "KpycppK..KppyK.",
      "Kppppp...KpcpK.",
      "KpdpppK..KpppK.",
      ".KppppKKppydK..",
      ".KpcppppppppK..",
      "..KppyppdppK....",
      "...KKKKKKKK.....",
    ],
  },
  carrot: {
    palette: { K: "#5a3a1a", o: "#e08a3c", d: "#b96a24", g: "#3fae5a" },
    pixels: [
      ".....g.g.g......",
      "...g.gKgKg.g....",
      "...gKgKgKgKg....",
      "....gKKgKKg.....",
      "....KooooooK....",
      "....KodooodK....",
      "....KooooooK....",
      ".....KoddoK.....",
      ".....KooooK.....",
      "......KoddK.....",
      "......KooK......",
      ".......KoK......",
      ".......KK.......",
    ],
  },
  penguin: {
    palette: { K: "#1a2230", b: "#3a4a5a", w: "#f2f2f2", o: "#e08a3c", E: "#101010" },
    pixels: [
      "....KKKKKK......",
      "..KKbbbbbbKK....",
      ".KbbbbbbbbbbK...",
      ".KbbwEbbEwbbK...",
      ".KbbwwoowwbbK...",
      "KbbwwwwwwwwbbK..",
      "Kbwwwwwwwwwwb K.",
      "Kbwwwwwwwwwwb K.",
      "KbbwwwwwwwwbbK..",
      ".KbbwwwwwwbbK...",
      ".KKbbwwwwbbKK...",
      "..oKKbwwbKKo....",
      "..oo.KKKK.oo....",
    ],
  },
};

// ===================================================================
// Room themes + decorations
// ===================================================================

const THEMES = "meadow bedroom space beach".split(" ");
const DECO = ("rug lamp plant poster beanbag bookshelf window ball blocks clock table cushion bed blanket " +
  "starlamp planetrug rocket galaxyposter palm seashell sandcastle surfboard fairylights terrarium toadstool birdcage").split(" ");

// Build a 32x32 tile from a per-pixel fn, then force column 31 == column 0
// and row 31 == row 0 so the tile repeats without a visible seam (and the
// generator's seam test passes by construction). fn must return a real key
// for every pixel — tiles are opaque.
function tileRows(fn) {
  const g = [];
  for (let y = 0; y < 32; y++) {
    const r = [];
    for (let x = 0; x < 32; x++) r.push(fn(x, y));
    g.push(r);
  }
  for (let y = 0; y < 32; y++) g[y][31] = g[y][0];
  for (let x = 0; x < 32; x++) g[31][x] = g[0][x];
  return g.map(r => r.join(""));
}

const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

const THEME_ART = {
  meadow: {
    floor: {
      palette: { g: "#6bbf59", d: "#4f9d43", l: "#8fd47c" },
      pixels: tileRows((x, y) =>
        ((x * 3 + y) % 8 === 5 && y % 4 === 3) ? "l" :
        ((x + y * 2) % 8 === 3 && y % 4 === 1) ? "d" : "g"),
    },
    wall: {
      palette: { s: "#bfe3f5", g: "#6bbf59", d: "#4f9d43", c: "#ffffff" },
      pixels: tileRows((x, y) => {
        const hy = 20 + Math.round(2 * Math.sin(x / 32 * 2 * Math.PI));
        if (inRect(x, y, 4, 4, 9, 6) || inRect(x, y, 19, 9, 25, 11)) return "c";
        if (y < hy) return "s";
        return y === hy ? "d" : "g";
      }),
    },
  },
  bedroom: {
    floor: {
      palette: { a: "#caa06f", b: "#bd8f5f", K: "#9c6b46" },
      pixels: tileRows((x, y) =>
        (x % 8 === 2 && y % 8 === 2) ? "K" :
        (((x >> 2) + (y >> 2)) % 2 ? "a" : "b")),
    },
    wall: {
      palette: { a: "#d9b3d6", b: "#c99cc6", c: "#efe0ee" },
      pixels: tileRows((x) => x % 8 === 0 ? "c" : (x % 8 < 4 ? "a" : "b")),
    },
  },
  space: {
    floor: {
      palette: { d: "#2a2350", m: "#37306a", K: "#1b1636" },
      pixels: tileRows((x, y) =>
        (x % 8 === 0 || y % 8 === 0) ? "K" :
        (x % 8 === 4 && y % 8 === 4) ? "m" : "d"),
    },
    wall: {
      palette: { d: "#171233", s: "#ffffff", b: "#8f9bd6" },
      pixels: tileRows((x, y) => {
        const stars = [[3, 4], [11, 9], [18, 3], [24, 14], [7, 20], [28, 8], [15, 25]];
        const dim = [[9, 15], [21, 21], [5, 11], [26, 27]];
        if (stars.some(([sx, sy]) => sx === x && sy === y)) return "s";
        if (dim.some(([sx, sy]) => sx === x && sy === y)) return "b";
        return "d";
      }),
    },
  },
  beach: {
    floor: {
      palette: { s: "#ecd9a8", d: "#dcc48c", l: "#f5e8c4" },
      pixels: tileRows((x, y) => {
        const m = (y + (x >> 3)) % 6;
        return m === 0 ? "d" : m === 3 ? "l" : "s";
      }),
    },
    wall: {
      palette: { s: "#bfe3f5", w: "#4bb0c9", f: "#ffffff" },
      pixels: tileRows((x, y) => {
        if (y === 15 && x % 6 === 2) return "f";
        return y < 14 ? "s" : y === 14 ? "f" : "w";
      }),
    },
  },
};

// Decorations: authored ~16 wide, scaled x2 and centred into 32x32 with a
// transparent background (".").
const DECO_ART = {
  rug: {
    palette: { f: "#e2c37a", r: "#c56b6b", R: "#a94c4c" },
    pixels: [
      "................",
      "................",
      "................",
      "....ffffffff....",
      "..ffrrrrrrrrff..",
      ".frrRRRRRRRRrrf.",
      ".frRRRRRRRRRRRf.",
      ".frrRRRRRRRRrrf.",
      "..ffrrrrrrrrff..",
      "....ffffffff....",
      "................",
      "................",
      "................",
    ],
  },
  lamp: {
    palette: { g: "#fff0c2", G: "#ffd25e", s: "#8a6b4a", K: "#5a4632" },
    pixels: [
      ".....gggg.......",
      "....gGGGGg......",
      "...gGGGGGGg.....",
      "...gGGGGGGg.....",
      "....gGGGGg......",
      ".....gGGg.......",
      "......ss........",
      "......ss........",
      "......ss........",
      "......ss........",
      "......ss........",
      "....KKKKKK......",
      "...KKKKKKKK.....",
      "................",
    ],
  },
  plant: {
    palette: { g: "#3fae5a", G: "#6bd47c", p: "#c56b3a", P: "#a9512a" },
    pixels: [
      "......gg........",
      "....g.gg.g......",
      "...g.gGg.g.g....",
      "...gg.gg.gg.....",
      "..g.ggGggg.g....",
      "...g.gGg.g......",
      "....ggggg.......",
      ".....ppp........",
      ".....ppp........",
      "....pPPPp.......",
      "....pPPPp.......",
      "....pppppp......",
      ".....pppp.......",
      "................",
    ],
  },
  poster: {
    palette: { K: "#5a4632", w: "#eef2f5", s: "#4b8fc9" },
    pixels: [
      "................",
      "..KKKKKKKKKKKK..",
      "..KwwwwwwwwwwK..",
      "..KwwwsswwwwwK..",
      "..KwwssssswwwK..",
      "..KwssssssssswK.",
      "..KwwwsssswwwwK.",
      "..KwwwwsswwwwwK.",
      "..KwwwwwwwwwwK..",
      "..KKKKKKKKKKKK..",
      "................",
    ],
  },
  beanbag: {
    palette: { b: "#7a9cc9", B: "#5f82b0" },
    pixels: [
      "................",
      "................",
      ".....bbbbb......",
      "...bbBBBBBbb....",
      "..bBBBBBBBBBb...",
      "..bBBBBBBBBBb...",
      ".bBBBBBBBBBBBb..",
      ".bBBBBBBBBBBBb..",
      "..bBBBBBBBBBb...",
      "..bbBBBBBBBbb...",
      "...bbbbbbbbb....",
      "................",
    ],
  },
  bookshelf: {
    palette: { K: "#5a4632", r: "#c56b6b", g: "#5fae6b", b: "#5f82b0", y: "#e0c56b" },
    pixels: [
      "..KKKKKKKKKKKK..",
      "..KrgbyrgbyrgK..",
      "..KrgbyrgbyrgK..",
      "..KKKKKKKKKKKK..",
      "..KbyrgbyrgbyK..",
      "..KbyrgbyrgbyK..",
      "..KKKKKKKKKKKK..",
      "..KgrbygrbygrK..",
      "..KgrbygrbygrK..",
      "..KKKKKKKKKKKK..",
      "................",
    ],
  },
  window: {
    palette: { K: "#5a4632", s: "#bfe3f5", c: "#ffffff" },
    pixels: [
      "..KKKKKKKKKKKK..",
      "..KssssKsssssK..",
      "..KsccsKsssssK..",
      "..KssssKsssssK..",
      "..KssssKsssssK..",
      "..KKKKKKKKKKKK..",
      "..KssssKsssssK..",
      "..KssssKssccsK..",
      "..KssssKsssssK..",
      "..KssssKsssssK..",
      "..KKKKKKKKKKKK..",
      "................",
    ],
  },
  ball: {
    palette: { r: "#e05a5a", w: "#ffffff" },
    pixels: [
      "................",
      ".....rrrrr......",
      "...rrrrrrrrr....",
      "..rrwwrrrrrrr...",
      "..rwwrrrrrrrr...",
      ".rrrrrrrrrrrrr..",
      ".rrrrrrrrrrrrr..",
      ".rrrrrrrrrrrrr..",
      "..rrrrrrrrrrr...",
      "...rrrrrrrrr....",
      ".....rrrrr......",
      "................",
    ],
  },
  blocks: {
    palette: { b: "#5f82b0", B: "#7a9cc9", g: "#5fae6b", G: "#7cc98a", r: "#e0a05a", R: "#f0bd7a" },
    pixels: [
      "................",
      "......bbbb......",
      "......bBBb......",
      "......bbbb......",
      "..gggg.rrrr.....",
      "..gGGg.rRRr.....",
      "..gGGg.rRRr.....",
      "..gggg.rrrr.....",
      "................",
    ],
  },
  clock: {
    palette: { K: "#3a3a3a", w: "#f2efe4" },
    pixels: [
      "................",
      ".....KKKKK......",
      "...KKwwwwwKK....",
      "..KwwwwKwwwwK...",
      "..KwwwwKwwwwK...",
      ".KwwwwwKwwwwwK..",
      ".KwwwwwKKKKwwK..",
      ".KwwwwwwwwwwwK..",
      "..KwwwwwwwwwK...",
      "...KKwwwwwKK....",
      ".....KKKKK......",
      "................",
    ],
  },
  table: {
    palette: { K: "#8a5a34", t: "#a9744a" },
    pixels: [
      "................",
      ".. tttttttttt ..",
      "..KKKKKKKKKKKK..",
      "..KKKKKKKKKKKK..",
      "...K........K...",
      "...K........K...",
      "...K........K...",
      "...K........K...",
      "...K........K...",
      "................",
    ],
  },
  cushion: {
    palette: { b: "#c98f6f", B: "#d9a888", y: "#ffe08a" },
    pixels: [
      "................",
      "...bbbbbbbbbb...",
      "..bBBBBBBBBBBb..",
      "..bBBBByBBBBBb..",
      "..bBBByyyBBBBb..",
      "..bByyyyyyyBBb..",
      "..bBBByyyBBBBb..",
      "..bBBBByBBBBBb..",
      "..bBBBBBBBBBBb..",
      "...bbbbbbbbbb...",
      "................",
    ],
  },
  bed: {
    palette: { K: "#6b4a2f", L: "#a9744a", w: "#eef2f7", p: "#9ec7ee", q: "#c98a9a" },
    pixels: [
      "................",
      "KKK.............",
      "KKK.............",
      "KKK..........LL.",
      "KKKpppp......LL.",
      "KKKppppwwwwwwLL.",
      "KKKwwwwwwwwwwLL.",
      "KKKqqqqqqqqqqLL.",
      "KKKLLLLLLLLLLLL.",
      "KKKKL......LLLL.",
      "..LL.......LL...",
      "................",
      "................",
    ],
  },
  blanket: {
    palette: { b: "#9a86c4", B: "#b7a6da", W: "#efe9f7" },
    pixels: [
      "................",
      "................",
      "...bbbbbbbbbb...",
      "..bBBBBBBBBBBb..",
      "..bBBBBBBBBBBb..",
      "..bWWWWWWWWWWb..",
      "..bBBBBBBBBBBb..",
      "..bBBBBBBBBBBb..",
      "..bWWWWWWWWWWb..",
      "..bBBBBBBBBBBb..",
      "..bBBBBBBBBBBb..",
      "...bbbbbbbbbb...",
      "................",
    ],
  },

  // --- space set ---
  starlamp: {
    palette: { y: "#ffe08a", Y: "#ffd25e", s: "#8a6b4a", K: "#5a4632" },
    pixels: [
      ".......y........",
      "......yYy.......",
      "...y.yYYYy.y....",
      "....yYYYYYy.....",
      "..yyYYYYYYYyy...",
      "....yYYYYYy.....",
      "....yYYYYYy.....",
      "...... sss.......",
      "......ss........",
      "......ss........",
      "....KKKKKK......",
      "...KKKKKKKK.....",
      "................",
    ],
  },
  planetrug: {
    palette: { d: "#3b3f8a", D: "#2a2e66", r: "#d98a5a", o: "#e0b070" },
    pixels: [
      "................",
      "................",
      "....dddddddd....",
      "..ddDDDDDDDDdd..",
      ".dDDDrrDDDDDDDd.",
      ".dDDrrrrDDrrDDd.",
      ".dDDDDDDrrrrDDd.",
      ".dDDoDDDDDDDDDd.",
      "..ddDDDDDDDDdd..",
      "....dddddddd....",
      "................",
      "................",
      "................",
    ],
  },
  rocket: {
    palette: { w: "#eef2f5", W: "#c9d2da", r: "#e05a5a", s: "#bfe3f5", f: "#ffb04a", F: "#ffd25e" },
    pixels: [
      ".......w........",
      "......wWw.......",
      "......wWw.......",
      ".....wWWWw......",
      ".....wsWsw......",
      ".....wWWWw......",
      ".....wWWWw......",
      "....rwWWWwr.....",
      "...rrwWWWwrr....",
      "......fFf.......",
      ".....f F f......",
      "......f.f.......",
      "................",
    ],
  },
  galaxyposter: {
    palette: { K: "#3a2f6b", d: "#4b3f96", w: "#eef2f5", y: "#ffe08a" },
    pixels: [
      "..KKKKKKKKKKKK..",
      "..KddddddddddK..",
      "..Kdddwddddy dK..",
      "..KddddddddddK..",
      "..Kdy ddwdddddK..",
      "..Kddddddddy dK..",
      "..Kdddw dddddddK..",
      "..Ky ddddddwdddK..",
      "..KddddddddddK..",
      "..KKKKKKKKKKKK..",
      "................",
    ],
  },

  // --- beach set ---
  palm: {
    palette: { g: "#3fae5a", G: "#6bd47c", t: "#a9744a", K: "#7a5230", s: "#e0c084" },
    pixels: [
      "....g.g.g......",
      "..gGgGgGgGg.....",
      ".gGGGGGGGGGg....",
      "..gGg tttGg......",
      ".....ttt........",
      ".....Ktt........",
      ".....ttK........",
      ".....Ktt........",
      ".....ttt........",
      "....KtttK.......",
      "...ssssssss.....",
      "................",
      "................",
    ],
  },
  seashell: {
    palette: { p: "#f0b8c8", P: "#e08aa8", w: "#fff2f6" },
    pixels: [
      "................",
      "......ww........",
      ".....pPPp.......",
      "....pPwwPp......",
      "...pPwppwPp.....",
      "..pPwpPPpwPp....",
      "..pPpPPPPpPp....",
      "..pPPpPPpPPp....",
      "...pPPPPPPp.....",
      "....pppppp......",
      "................",
      "................",
      "................",
    ],
  },
  sandcastle: {
    palette: { s: "#e0c084", S: "#c9a45f", r: "#e05a5a", b: "#bfe3f5" },
    pixels: [
      "..r.......r....",
      "..s.......s....",
      ".sss.....sss...",
      ".sSs.....sSs...",
      ".sss.rrr.sss...",
      "sssssssssssss..",
      "sSsSsSsSsSsSs..",
      "sssssssssssss..",
      "sSsSsSsSsSsSs..",
      "sssssssssssss..",
      "bbbbbbbbbbbbb..",
      "................",
      "................",
    ],
  },
  surfboard: {
    palette: { w: "#eef2f5", r: "#e05a5a", b: "#5f9bd0", y: "#ffd25e" },
    pixels: [
      ".......w........",
      "......wrw.......",
      "......wrw.......",
      ".....wryw......",
      ".....wryw......",
      ".....wbyw......",
      ".....wbyw......",
      ".....wbyw......",
      ".....wbrw......",
      "......wrw.......",
      "......wrw.......",
      ".......w........",
      "................",
    ],
  },

  // --- garden set ---
  fairylights: {
    palette: { K: "#5a4632", y: "#ffe08a", r: "#e05a5a", g: "#5fae6b", b: "#5f9bd0" },
    pixels: [
      "KKKKKKKKKKKKKKKK",
      "K.KK.KK.KK.KK.KK",
      ".y..r..g..b..y..",
      ".y..r..g..b..y..",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
    ],
  },
  terrarium: {
    palette: { w: "#cfe6ee", W: "#eef7fa", g: "#3fae5a", G: "#6bd47c", d: "#7a5230" },
    pixels: [
      "................",
      "....WWWWWWWW....",
      "...WwwwwwwwwW...",
      "...Wwww ggwwwW...",
      "...WwwgGGgwwW...",
      "...WwggGGggwW...",
      "...WwwgggwwwW...",
      "...WddddddddW...",
      "...WddddddddW...",
      "....WWWWWWWW....",
      "................",
      "................",
      "................",
    ],
  },
  toadstool: {
    palette: { r: "#e05a5a", R: "#c23c3c", w: "#fff2f0", s: "#f0e6d2" },
    pixels: [
      "................",
      "................",
      "....rrrrrr......",
      "..rrRwrrRwrr....",
      ".rRRrrRRrrRRr...",
      ".rrRwrrrrwRrr...",
      "..rrrrrrrrrr....",
      "....swwws.......",
      "....swwws.......",
      "....sssss.......",
      "...sssssss......",
      "................",
      "................",
    ],
  },
  birdcage: {
    palette: { K: "#5a4632", y: "#ffd25e", o: "#e0902a" },
    pixels: [
      "......KK........",
      ".....K..K.......",
      "....K....K......",
      "...KKKKKKKK.....",
      "...K.K.K.KK.....",
      "...K.K.K.KK.....",
      "...K.Kyy.KK.....",
      "...K.Koy.KK.....",
      "...K.K.K.KK.....",
      "...KKKKKKKK.....",
      "....KKKKKK......",
      "................",
      "................",
    ],
  },
};

// Foods shown briefly in front of the pet during the eat animation.
const FOOD = "apple cookie carrot fish cake".split(" ");

const FOOD_ART = {
  apple: {
    palette: { s: "#7a5230", g: "#5fae5a", r: "#e5484d", R: "#c02c30", h: "#ff9aa0" },
    pixels: [
      ".......s........",
      "......s.g.......",
      ".....rrrg.......",
      "....rrrrrrr.....",
      "...rrrhrrrrr....",
      "...rrrhrrrrr....",
      "...Rrrrrrrrr....",
      "...Rrrrrrrrr....",
      "....Rrrrrrr.....",
      "....RRrrrRR.....",
      ".....RRRR.......",
      "................",
    ],
  },
  cookie: {
    palette: { d: "#c98a4a", D: "#a96f34", c: "#5a3a20" },
    pixels: [
      "................",
      "....dddddd......",
      "...dddddddd.....",
      "..ddcddddddd....",
      "..ddddddddcd....",
      "..dddcdddddd....",
      "..ddddddcddd....",
      "...dddddddd.....",
      "....DDDDDD......",
      "................",
    ],
  },
  carrot: {
    palette: { o: "#e08a3c", O: "#c46a20", g: "#5fae5a" },
    pixels: [
      ".........g.g....",
      "........ggggg...",
      ".......gg.gg....",
      "......oo.g......",
      "......ooo.......",
      ".....ooooO......",
      ".....oooO.......",
      "......ooO.......",
      "......oO........",
      ".......O........",
      "................",
    ],
  },
  fish: {
    palette: { b: "#5b9be0", B: "#3f7fbf", e: "#ffffff", p: "#20364a" },
    pixels: [
      "................",
      "....bbbb....B...",
      "..bbbbbbbb.BB...",
      ".bbebbbbbbbBBB..",
      ".bbpbbbbbbbbBB..",
      ".bbebbbbbbbBBB..",
      "..bbbbbbbb.BB...",
      "....bbbb....B...",
      "................",
    ],
  },
  cake: {
    palette: { s: "#f4d6e2", f: "#fff2f7", b: "#c98a6f", r: "#e5484d", y: "#ffd97d" },
    pixels: [
      ".......r........",
      ".......r........",
      "......yyy.......",
      "....ffffffff....",
      "...ffffffffff...",
      "...fssssssssf...",
      "...bbbbbbbbbb...",
      "...bbbbbbbbbb...",
      "...bbbbbbbbbb...",
      "................",
    ],
  },
};

// ===================================================================
// Generation
// ===================================================================

const SPRITE_DIR = new URL("../potato-pet/assets/sprites/", import.meta.url);

const LICENSE_TEXT =
  "All sprites in this directory are generated by tools/gen-art.mjs from\n" +
  "hand-authored pixel grids in that script. They are released to the public\n" +
  "domain (CC0 1.0). No third-party assets are used or redistributed.\n" +
  "Regenerate with:  cd tools && npm run gen\n";

function previewGrid(label, g) {
  console.log("--- " + label + " ---");
  for (const row of g.rows) console.log(row.replace(/\./g, " "));
  console.log("");
}

export function buildPetSheet(species, variant) {
  const art = SPECIES_ART[species];
  const base32 = pad(scale2x(parseGrid(art)), 32, 32);
  const paletteZ = { ...art.palette, z: "#f2f2f2" };
  const f = deriveFrames(base32, paletteZ);
  const rows = [f.idle, f.happy, f.eat, f.sleep];
  return packSheet(rows, recolorPalette(paletteZ, VARIANT_MODES[variant]));
}

function genPets({ preview }) {
  if (!preview) fs.mkdirSync(new URL("pet/", SPRITE_DIR), { recursive: true });
  for (const sp of SPECIES) {
    const art = SPECIES_ART[sp];
    if (!("K" in art.palette)) throw new Error(sp + ": palette needs a 'K' outline key");
    if (preview) {
      const base32 = pad(scale2x(parseGrid(art)), 32, 32);
      const f = deriveFrames(base32, { ...art.palette, z: "#f2f2f2" });
      previewGrid(sp + " idle[0]", f.idle[0]);
      previewGrid(sp + " happy[1]", f.happy[1]);
      previewGrid(sp + " eat[1]", f.eat[1]);
      previewGrid(sp + " sleep[0]", f.sleep[0]);
      continue;
    }
    for (let v = 0; v < 4; v++) {
      const png = encodePNG(buildPetSheet(sp, v));
      fs.writeFileSync(new URL("pet/" + sp + "-" + v + ".png", SPRITE_DIR), png);
    }
  }
}

function buildTile(art) {
  return packCell(parseGrid(art), art.palette);
}

function buildDeco(art) {
  return packCell(pad(scale2x(parseGrid(art)), 32, 32), art.palette);
}

function genRooms({ preview }) {
  if (!preview) {
    fs.mkdirSync(new URL("room/", SPRITE_DIR), { recursive: true });
    fs.mkdirSync(new URL("deco/", SPRITE_DIR), { recursive: true });
  }
  for (const t of THEMES) {
    for (const kind of ["floor", "wall"]) {
      const art = THEME_ART[t][kind];
      if (preview) { previewGrid(t + " " + kind, parseGrid(art)); continue; }
      fs.writeFileSync(new URL("room/" + kind + "-" + t + ".png", SPRITE_DIR), encodePNG(buildTile(art)));
    }
  }
  for (const id of DECO) {
    const art = DECO_ART[id];
    if (preview) { previewGrid("deco " + id, pad(scale2x(parseGrid(art)), 32, 32)); continue; }
    fs.writeFileSync(new URL("deco/" + id + ".png", SPRITE_DIR), encodePNG(buildDeco(art)));
  }
}

function genFood({ preview }) {
  if (!preview) fs.mkdirSync(new URL("food/", SPRITE_DIR), { recursive: true });
  for (const id of FOOD) {
    const art = FOOD_ART[id];
    if (preview) { previewGrid("food " + id, pad(scale2x(parseGrid(art)), 32, 32)); continue; }
    fs.writeFileSync(new URL("food/" + id + ".png", SPRITE_DIR), encodePNG(buildDeco(art)));
  }
}

function main() {
  const preview = process.argv.includes("--preview");
  genPets({ preview });
  genRooms({ preview });
  genFood({ preview });
  if (!preview) {
    fs.writeFileSync(new URL("LICENSE.txt", SPRITE_DIR), LICENSE_TEXT);
    console.log("gen-art: wrote pet + room + deco + food sprites + LICENSE.txt");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
