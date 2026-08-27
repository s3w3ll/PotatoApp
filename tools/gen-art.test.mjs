import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { crc32, encodePNG, PNG_SIG } from "./gen-art.mjs";

const HERE = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const OUT = new URL("../potato-pet/assets/sprites/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SPECIES = "strawberry broccoli turtle cat frog donut carrot penguin".split(" ");
const THEMES = "meadow bedroom space beach".split(" ");
const DECO = "rug lamp plant poster beanbag bookshelf window ball blocks clock table cushion".split(" ");
const gen = (...args) => execFileSync("node", ["gen-art.mjs", ...args], { cwd: HERE });

function readPng(p) { return fs.readFileSync(p); }
function isValidPNG(b) {
  for (let i = 0; i < 8; i++) if (b[i] !== PNG_SIG[i]) return false;
  return b.readUInt32BE(16) > 0 && b.readUInt32BE(20) > 0;
}
function dims(b) { return [b.readUInt32BE(16), b.readUInt32BE(20)]; }
function idatIndices(b) {
  let off = 8, idat = [];
  while (off < b.length) {
    const len = b.readUInt32BE(off), type = b.toString("latin1", off + 4, off + 8);
    if (type === "IDAT") idat.push(b.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const [w, h] = dims(b);
  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = raw[y * (1 + w) + 1 + x];
  return { w, h, px };
}

// a hand-checked 4x4: index grid, palette [transparent, black, white]
const W = 4, H = 4;
const idx = Uint8Array.from([
  0, 1, 1, 0,
  1, 2, 2, 1,
  1, 2, 2, 1,
  0, 1, 1, 0,
]);
const palette = ["#000000", "#111111", "#eeeeee"];

test("crc32 matches a known value", () => {
  // CRC-32 of ASCII "IEND" is 0xAE426082
  assert.equal(crc32(Buffer.from("IEND", "latin1")) >>> 0, 0xAE426082);
});

test("encodePNG emits a valid colour-type-3 PNG", () => {
  const png = encodePNG({ width: W, height: H, palette, indices: idx });
  assert.ok(Buffer.isBuffer(png));
  assert.deepEqual([...png.subarray(0, 8)], [...PNG_SIG]);

  let off = 8, seen = [];
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    const type = png.toString("latin1", off + 4, off + 8);
    const data = png.subarray(off + 8, off + 8 + len);
    const crcGot = png.readUInt32BE(off + 8 + len) >>> 0;
    const crcCalc = crc32(png.subarray(off + 4, off + 8 + len)) >>> 0;
    assert.equal(crcGot, crcCalc, "CRC of chunk " + type);
    seen.push(type);
    if (type === "IHDR") {
      assert.equal(data.readUInt32BE(0), W);
      assert.equal(data.readUInt32BE(4), H);
      assert.equal(data[8], 8);   // bit depth
      assert.equal(data[9], 3);   // colour type = indexed
    }
    if (type === "IDAT") {
      const raw = zlib.inflateSync(data);
      assert.equal(raw.length, H * (1 + W));
      for (let y = 0; y < H; y++) {
        assert.equal(raw[y * (1 + W)], 0, "filter byte");
        for (let x = 0; x < W; x++) {
          assert.equal(raw[y * (1 + W) + 1 + x], idx[y * W + x]);
        }
      }
    }
    off += 12 + len;
  }
  assert.deepEqual(seen, ["IHDR", "PLTE", "tRNS", "IDAT", "IEND"]);
});

test("gen-art writes all 32 pet sheets, 64x128, valid PNG", () => {
  gen();
  for (const s of SPECIES) for (let v = 0; v < 4; v++) {
    const p = path.join(OUT, "pet", `${s}-${v}.png`);
    assert.ok(fs.existsSync(p), `missing ${s}-${v}.png`);
    const b = readPng(p);
    assert.ok(isValidPNG(b), `invalid PNG ${s}-${v}`);
    assert.deepEqual(dims(b), [64, 128], `${s}-${v} dims`);
    const { px } = idatIndices(b);
    const nonEmpty = px.reduce((n, v2) => n + (v2 ? 1 : 0), 0);
    assert.ok(nonEmpty > 200 && nonEmpty < px.length * 0.9, `${s}-${v} pixel fill ${nonEmpty}/${px.length}`);
  }
});

test("gen-art writes room tiles + deco sprites, 32x32, valid PNG", () => {
  gen();
  for (const t of THEMES) for (const kind of ["floor", "wall"]) {
    const p = path.join(OUT, "room", `${kind}-${t}.png`);
    assert.ok(fs.existsSync(p), `missing ${kind}-${t}`);
    const b = readPng(p);
    assert.ok(isValidPNG(b), `invalid PNG ${kind}-${t}`);
    assert.deepEqual(dims(b), [32, 32], `${kind}-${t} dims`);
  }
  for (const id of DECO) {
    const p = path.join(OUT, "deco", `${id}.png`);
    assert.ok(fs.existsSync(p), `missing deco ${id}`);
    const b = readPng(p);
    assert.ok(isValidPNG(b), `invalid PNG deco ${id}`);
    assert.deepEqual(dims(b), [32, 32], `deco ${id} dims`);
  }
});

test("floor tiles tile seamlessly (left edge == right edge, top == bottom)", () => {
  gen();
  for (const t of THEMES) {
    const { w, px } = idatIndices(readPng(path.join(OUT, "room", `floor-${t}.png`)));
    const at = (x, y) => px[y * w + x];
    for (let y = 0; y < 32; y++) assert.equal(at(0, y), at(31, y), `${t} row ${y} L/R`);
    for (let x = 0; x < 32; x++) assert.equal(at(x, 0), at(x, 31), `${t} col ${x} T/B`);
  }
});

test("deco sprites have a transparent margin and a solid object", () => {
  gen();
  for (const id of DECO) {
    const { px } = idatIndices(readPng(path.join(OUT, "deco", `${id}.png`)));
    const solid = px.reduce((n, v) => n + (v ? 1 : 0), 0);
    assert.ok(solid > 30, `${id} nearly empty (${solid}/${px.length})`);
    assert.ok(solid < px.length * 0.85, `${id} no transparent margin (${solid}/${px.length})`);
  }
});

test("gen-art is deterministic (two runs, identical bytes)", () => {
  const cap = () => [
    ...SPECIES.flatMap(s => [0, 1, 2, 3].map(v =>
      fs.readFileSync(path.join(OUT, "pet", `${s}-${v}.png`)))),
    ...THEMES.flatMap(t => ["floor", "wall"].map(k =>
      fs.readFileSync(path.join(OUT, "room", `${k}-${t}.png`)))),
    ...DECO.map(id => fs.readFileSync(path.join(OUT, "deco", `${id}.png`))),
  ];
  gen();
  const a = cap();
  gen();
  const b = cap();
  a.forEach((buf, i) => assert.ok(buf.equals(b[i]), "file " + i + " changed between runs"));
});

test("each species has at least one variant differing from variant 0", () => {
  for (const s of SPECIES) {
    const v0 = fs.readFileSync(path.join(OUT, "pet", `${s}-0.png`));
    let diff = false;
    for (let v = 1; v < 4; v++)
      if (!v0.equals(fs.readFileSync(path.join(OUT, "pet", `${s}-${v}.png`)))) diff = true;
    assert.ok(diff, `${s}: all 4 variants identical`);
  }
});
