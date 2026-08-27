# Potato Pet — Phase 3: Pixel-Art Sprites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every placeholder visual (flat-colour pet block, first-letter decorations, flat room themes) with generated pixel-art sprites, while keeping the front-end zero-build and degrading cleanly to today's look if any asset is missing.

**Architecture:** A committed Node script (`tools/gen-art.mjs`, `node:zlib` only) hand-authors pixel grids and encodes them to indexed PNGs under `potato-pet/assets/sprites/`. `sprites.js` exposes a manifest of sheet paths + animation metadata; `pet.js` frame-steps a `background-position` timer; `room.js` `renderRoom` tiles floor/wall sheets and paints decoration sprites. Two implementation tracks: the **pet track** (Tasks 1–4) lands and is independently shippable before the **room track** (Tasks 5–6); docs close it out (Task 7).

**Tech Stack:** Vanilla ES5-style browser JS (no build/framework/modules/npm under `potato-pet/`). Node (`node:zlib`, `node:test`) for the generator and its tests, contained in `tools/` exactly as `worker/` contains its own tooling. Hand-authored pixel grids; deterministic indexed-PNG encoding.

**Spec:** `docs/superpowers/specs/2026-08-28-potato-pet-phase3-pixel-art.md` — read it alongside this plan.

## Global Constraints

Every task's requirements implicitly include this section.

- **Zero-build front-end.** No framework, no bundler, no npm dependency anywhere under `potato-pet/`. Each JS file starts `window.App = window.App || {};` then attaches to `App`. `index.html` must still work opened from `file://`.
- **`tools/` tooling is self-contained.** `tools/package.json` may exist but has **zero dependencies** — `node:zlib` and `node:test` only. Nothing under `potato-pet/` or the repo root gains a dependency. Same containment rule as `worker/`.
- **`gen-art.mjs` is deterministic.** No timestamps, no `tIME` chunk, fixed `zlib` deflate level. Running it twice produces byte-identical files. Its PNG output is committed alongside the script.
- **Output paths are script-relative,** resolved via `new URL("../potato-pet/assets/sprites/", import.meta.url)` — never the cwd. The script works run from the repo root or from `tools/`.
- **Fallbacks are permanent.** Every asset load degrades to the exact current Phase 2 visual:
  - pet sheet fails → flat `manifest[species].placeholderColor` block, no frame stepping
  - decoration sprite fails → the catalog label's first letter as text
  - room floor/wall sheet fails → the flat `.room.theme-<name>` background colour
  At most **one `console.warn` per failed asset**. Never a thrown error, a blank element, or the `#overlay`.
- **No logic changes.** Do not touch game logic (`state.js`, `world.js`, `interactions.js`, `games.js`, `facts.js`, `content.js`, `rng.js`), the sync layer (`remote.js`, `save.js`, `config.js`, `worker/`), `backup.js`, `devpanel.js`, `main.js`, the `world` object shape, or save migrations. The only `*.tests.js` change permitted is **adding** `potato-pet/js/sprites.tests.js`.
- **Existing suites stay green:** `node potato-pet/run-suite.mjs` (currently **1248**) and `cd worker && npm test` (**10**). `room.tests.js` in particular must keep passing — `renderRoom` changes must not touch `CATALOG` / `priceOf` / `canBuy` / `buy` / `cellOccupied` / `place` / `pickUp`.
- **Public contracts unchanged:** `App.sprites.{manifest, animFor}` keep working (manifest gains fields; `animFor(species,name)` still returns a valid idle def and never throws). `App.pet.{mount(container,world), render(mood), playAnim(name,done?), speak(text,ms?)}`. `App.room.renderRoom(container, world, opts)` still renders `<button class="cell" data-x data-y>` cells and honours `opts.placeMode` + `opts.onPlaceCell`.
- **DOM code has no unit-test tradition here.** Tasks that touch only `pet.js`, `startscreen.js`, `room.js` `renderRoom`, or `gamescreen.js` `renderShop` ship with a **manual-verification step + task review** as the gate — do not build a DOM test harness for them (carry-forward of the Phase 2 ruling for `startscreen.js`/`devpanel.js`). `sprites.js` **is** unit-tested via the new `sprites.tests.js`.
- **Fixed dimensions:** logical cell **32×32**. Pet sheet = **2 columns (frames) × 4 rows (anims: `idle`, `happy`, `eat`, `sleep`)** → **64×128** px. **4 palette variants** per species → 4 files per species. On-screen scale ×3 for both the game stage (96px) and the creation preview.
- **`variantFor(tint)`** is total and wrapping: `((Math.floor(t/90) % 4) + 4) % 4`, with any non-finite / non-number `tint` treated as `0`.
- **Canonical name lists** (copy verbatim):
  - species: `strawberry broccoli turtle cat frog donut carrot penguin`
  - themes: `meadow bedroom space beach`
  - decoration ids: `rug lamp plant poster beanbag bookshelf window ball blocks clock table cushion`
- **Commit per task.** TDD where tests exist (Task 1 encoder, Task 2/5 generator completeness+determinism, Task 3 `sprites.js`). Match surrounding style: IIFE returning an API object, 2-space indent, semicolons, terse helpers.

---

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `tools/gen-art.mjs` | The generator. Task 1 adds the indexed-PNG encoder + CRC32; Task 2 adds the pixel-grid DSL, the 8 pet base sprites, frame-derivation transforms, palette variants, sheet packing, and the pet write loop + `--preview`; Task 5 adds room tiles + decoration sprites and their write loop. |
| `tools/gen-art.test.mjs` | `node --test` suite for the encoder (Task 1) and generator output — determinism + completeness + validity (Tasks 2, 5). |
| `tools/package.json` | `{ "type": "module", "private": true, "scripts": { "test": "node --test", "gen": "node gen-art.mjs" } }`. No deps. |
| `tools/.gitignore` | `node_modules/` (defensive; nothing installs anything). |
| `potato-pet/js/sprites.tests.js` | Manifest-shape + `animFor` fallback + `variantFor` table tests. Added to both test harnesses. |
| `potato-pet/assets/sprites/pet/<species>-<0..3>.png` | 32 pet sheets (8 species × 4 variants), 64×128 each. |
| `potato-pet/assets/sprites/room/floor-<theme>.png`, `room/wall-<theme>.png` | 8 tileable 32×32 room tiles. |
| `potato-pet/assets/sprites/deco/<id>.png` | 12 decoration sprites, 32×32, transparent background. |

**Modified files:**

| Path | Change |
|---|---|
| `potato-pet/js/sprites.js` | New manifest shape (`cell`, `cols`, `variants`, `rows`, `sheet(v)`, `anims{row,frames,fps}`, `placeholderColor` kept) + `variantFor`. |
| `potato-pet/js/pet.js` | Frame-stepping renderer over a `background-image` sheet, ambient/one-shot animation with tracked timers, sheet-load fallback. |
| `potato-pet/js/startscreen.js` | Creation preview renders the pet's idle frame instead of a tinted block; probe-image fallback. |
| `potato-pet/js/room.js` | `renderRoom` only: tiled floor/wall background + decoration sprite spans + first-letter fallback. All buy/place/bounds logic untouched. |
| `potato-pet/js/gamescreen.js` | `renderShop` only: a `<span class="shopicon pixel">` before each catalog label. |
| `potato-pet/styles.css` | `.pet` / `.preview` / `.room` / `.room.theme-*` / `.cell` / `.deco` reworked; new `.pet.fallback` / `.wall` / `.shopicon` / `.deco.noimg`; remove `@keyframes bob`, `@keyframes chomp`, `.pet.anim-eat`. |
| `potato-pet/index.html` | Add `<script src="js/sprites.js">` is **already present** — verify only; no change expected. |
| `potato-pet/tests.html` | Add `<script src="js/sprites.js">` to the module block (after `world.js`) and `<script src="js/sprites.tests.js">` to the test block. |
| `potato-pet/run-suite.mjs` | Add `'sprites.js'` to the module list (after `'world.js'`) and `'sprites.tests.js'` to the test-file list. |
| `potato-pet/assets/sprites/LICENSE.txt` | Replace with the generated-CC0 note. |
| `potato-pet/TESTING.md` | Append the Phase 3 visual checklist. |
| `potato-pet/README.md` | One line: how to regenerate art (`cd tools && npm run gen`). |

**Untouched:** everything else, including all of `worker/`, `deploy-*.yml`, and every `*.tests.js` except the new `sprites.tests.js`.

---

## Design notes that bind multiple tasks

**Indexed-PNG format used throughout.** Colour type 3 (palette), 8-bit. One `IHDR`, one `PLTE` (from the sprite's palette, transparent colour first), one `tRNS` (`[0]` — index 0 fully transparent), one or more `IDAT` (zlib `deflateSync`, level 9), one `IEND`. Each scanline is prefixed with filter byte `0x00` (no filter). CRC-32 (ISO-HDLC, poly `0xEDB88320`) over `type + data` of every chunk.

**Sheet packing.** For a species: an array of rows `[idle, happy, eat, sleep]`, each an array of `cols` frames, each frame a 32×32 index grid. The packed image is `cols*32` wide × `4*32` tall; frame `(row r, col c)` occupies `x ∈ [c*32, c*32+32)`, `y ∈ [r*32, r*32+32)`.

**Renderer positioning (Task 4).** With scale `S=3`: the div is `32*S` px square, `background-size: (cols*32*S) (rows*32*S)`, `background-position: -(col*32*S)px -(row*32*S)px`, `background-repeat: no-repeat`, `image-rendering: pixelated`.

**`--preview` (Tasks 2, 5).** `node gen-art.mjs --preview` writes NO files; it prints to stdout an ASCII rendering (`' '` for transparent, a distinct char per palette entry) of every authored base sprite and one derived frame per animation row, and every room tile / decoration. The implementer pastes this into the task report so the reviewer and controller can eyeball recognisability without opening PNGs.

**Fallback mechanism (Tasks 4, 6).** Preload each sheet/sprite URL with `new Image()`. `onload` → set the `background-image`. `onerror` → add a `fallback` / `noimg` class and apply the flat-visual style; `console.warn("art missing: " + url)` exactly once. Decoration `<span>`s always contain the label's first letter as text; `.deco` sets `color: transparent`, `.deco.noimg` sets `color: inherit`, so the letter shows only when the image is absent.

---

### Task 1: Indexed-PNG encoder + CRC32

**Files:**
- Create: `tools/gen-art.mjs` (encoder + CRC only for now)
- Create: `tools/gen-art.test.mjs`
- Create: `tools/package.json`, `tools/.gitignore`

**Interfaces:**
- Consumes: `node:zlib` (`deflateSync`).
- Produces (exported from `gen-art.mjs`):
  - `crc32(buf: Uint8Array) → number` (unsigned 32-bit).
  - `encodePNG({ width, height, palette, indices }) → Buffer` where `palette` is an array of `"#rrggbb"` strings (index 0 is the transparent colour), and `indices` is a `Uint8Array` of length `width*height` (row-major, values into `palette`). Emits a valid colour-type-3 8-bit PNG with `tRNS` making index 0 transparent, filter-0 scanlines, level-9 `IDAT`.
  - `PNG_SIG` — the 8-byte signature constant.

- [ ] **Step 1: Scaffold `tools/`**

`tools/package.json`:
```json
{ "type": "module", "private": true, "scripts": { "test": "node --test", "gen": "node gen-art.mjs" } }
```
`tools/.gitignore`:
```
node_modules/
```

- [ ] **Step 2: Write the failing encoder test**

`tools/gen-art.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { crc32, encodePNG, PNG_SIG } from "./gen-art.mjs";

// a hand-checked 4x4: index grid, palette [transparent, black, white]
const W = 4, H = 4;
const idx = Uint8Array.from([
  0,1,1,0,
  1,2,2,1,
  1,2,2,1,
  0,1,1,0,
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

  // walk chunks
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
      // 4 scanlines, each: filter byte 0 + 4 index bytes
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
```

- [ ] **Step 3: Run it, verify it fails**

Run: `cd tools && node --test`
Expected: FAIL — `gen-art.mjs` has no exports yet (import error or assertion failure).

- [ ] **Step 4: Implement the encoder in `tools/gen-art.mjs`**

```js
import zlib from "node:zlib";

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
  const t = Buffer.from(type, "latin1");
  const body = Buffer.concat([t, Buffer.from(data)]);
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
  ihdr[8] = 8;      // bit depth
  ihdr[9] = 3;      // colour type: indexed
  ihdr[10] = 0;     // compression
  ihdr[11] = 0;     // filter
  ihdr[12] = 0;     // interlace

  const plte = Buffer.alloc(palette.length * 3);
  palette.forEach((h, i) => { const [r, g, b] = hexToRGB(h); plte[i*3] = r; plte[i*3+1] = g; plte[i*3+2] = b; });

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

// --- generator entry (filled in by later tasks) ---
const isMain = import.meta.url === `file://${process.argv[1]}` ||
               import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/") ?? "");
if (isMain) {
  // Task 2 / Task 5 add the real generation here.
  console.log("gen-art: nothing to generate yet");
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `cd tools && node --test`
Expected: PASS — both tests green, output pristine.

- [ ] **Step 6: Commit**

```bash
git add tools/gen-art.mjs tools/gen-art.test.mjs tools/package.json tools/.gitignore
git commit -m "feat(tools): deterministic indexed-PNG encoder for the art generator

Colour-type-3 8-bit PNG with tRNS transparency, filter-0 scanlines,
level-9 zlib IDAT, ISO-HDLC CRC-32. node:zlib only, no deps. node --test
suite decodes the output and checks every chunk + CRC + inflated scanlines."
```

---

### Task 2: Pet sprite generation

**Files:**
- Modify: `tools/gen-art.mjs` (add DSL, 8 pet base sprites, transforms, variants, packing, pet write loop, `--preview`)
- Modify: `tools/gen-art.test.mjs` (determinism + pet completeness/validity)
- Create: `potato-pet/assets/sprites/pet/<species>-<0..3>.png` (32 files, via running the script)
- Modify: `potato-pet/assets/sprites/LICENSE.txt`

**Interfaces:**
- Consumes: `encodePNG` (Task 1).
- Produces:
  - `parseGrid({ palette, pixels }) → { w, h, indices: Uint8Array, palette: string[] }` — `pixels` is an array of equal-length strings; each char is a key of `palette` or `"."`/`" "` for transparent (index 0). The returned `palette` always has the transparent colour at index 0.
  - `SPECIES_ART` — a map `species → { palette, pixels }` (32×32 or smaller, centred).
  - `deriveFrames(baseGrid) → { idle:[g,g], happy:[g,g], eat:[g,g], sleep:[g,g] }` via the transforms in the spec.
  - `VARIANT_MAPS[species] → [map0..map3]` where each map is `{ paletteKey: "#rrggbb" }` overrides applied before encoding (`natural`/`warm`/`cool`/`pale`).
  - `packSheet(rows) → { width:64, height:128, indices, palette }`.
  - Running `node gen-art.mjs` writes `pet/<species>-<v>.png` for every species and `v ∈ 0..3`, and rewrites `LICENSE.txt`.
  - `node gen-art.mjs --preview` prints ASCII of every base sprite + one frame per row; writes nothing.

- [ ] **Step 1: Author the DSL + one species, write the failing completeness test**

Add to `gen-art.mjs` `parseGrid`, and `SPECIES_ART` with at minimum `cat` fully authored, e.g.:
```js
const SPECIES_ART = {
  cat: {
    palette: { K: "#2b2b2b", F: "#d9922b", P: "#ffd9b0", E: "#1b3a5c" },
    pixels: [
      "................................",
      "................................",
      "..........K..........K..........",
      ".........KFK........KFK.........",
      ".........KFFK......KFFK.........",
      "........KFFFFKKKKKKFFFFK........",
      "........KFFFFFFFFFFFFFFK........",
      ".......KFFEFFFFFFFFEFFFK.......",
      ".......KFFFFFFPPFFFFFFFK.......",
      ".......KFFFFFFPPFFFFFFFK.......",
      "........KFFFFFFFFFFFFFK........",
      ".........KFFFFFFFFFFKK.........",
      "..........KKFFFFFFKK...........",
      "...........KFFFFFFK............",
      "...........KFFFFFFK............",
      "...........KFFFFFFK............",
      "...........KK....KK............",
      "................................",
      /* pad to 32 rows total; keep width 32 */
    ],
  },
  // strawberry, broccoli, turtle, frog, donut, carrot, penguin authored similarly
};
```
(The `cat` grid above is illustrative — pad every `SPECIES_ART[x].pixels` to exactly 32 rows × 32 cols. Each species: a clear silhouette + 2–3 identifying features; palette ≤ 8 keys.)

Add to `gen-art.test.mjs`:
```js
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const HERE = new URL(".", import.meta.url).pathname;
const OUT = new URL("../potato-pet/assets/sprites/", import.meta.url).pathname;
const SPECIES = "strawberry broccoli turtle cat frog donut carrot penguin".split(" ");

function png(p) { const b = fs.readFileSync(p); return b; }
function isValidPNG(b) {
  if ([...b.subarray(0,8)].join() !== [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].join()) return false;
  return b.readUInt32BE(16) > 0 && b.readUInt32BE(20) > 0; // IHDR w/h
}
function dims(b) { return [b.readUInt32BE(16), b.readUInt32BE(20)]; }

test("gen-art writes all 32 pet sheets, 64x128, valid PNG", () => {
  execFileSync("node", ["gen-art.mjs"], { cwd: HERE });
  for (const s of SPECIES) for (let v = 0; v < 4; v++) {
    const p = path.join(OUT, "pet", `${s}-${v}.png`);
    assert.ok(fs.existsSync(p), `missing ${s}-${v}.png`);
    const b = png(p);
    assert.ok(isValidPNG(b), `invalid PNG ${s}-${v}`);
    assert.deepEqual(dims(b), [64, 128], `${s}-${v} dims`);
    assert.ok(b.length > 60, `${s}-${v} suspiciously tiny`);
  }
});

test("gen-art is deterministic (two runs, identical bytes)", () => {
  const cap = () => SPECIES.flatMap(s => [0,1,2,3].map(v =>
    fs.readFileSync(path.join(OUT, "pet", `${s}-${v}.png`))));
  execFileSync("node", ["gen-art.mjs"], { cwd: HERE });
  const a = cap();
  execFileSync("node", ["gen-art.mjs"], { cwd: HERE });
  const b = cap();
  a.forEach((buf, i) => assert.ok(buf.equals(b[i]), "file " + i + " changed between runs"));
});

test("each variant differs from variant 0 for at least one species pixel", () => {
  for (const s of SPECIES) {
    const v0 = fs.readFileSync(path.join(OUT, "pet", `${s}-0.png`));
    let anyDiff = false;
    for (let v = 1; v < 4; v++) {
      if (!v0.equals(fs.readFileSync(path.join(OUT, "pet", `${s}-${v}.png`)))) anyDiff = true;
    }
    assert.ok(anyDiff, `${s}: all 4 variants identical — recolour maps not applied`);
  }
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `cd tools && node --test`
Expected: FAIL — no pet write loop yet, files absent.

- [ ] **Step 3: Implement generation in `gen-art.mjs`**

Add `parseGrid`, all 8 `SPECIES_ART` entries (author each — 32×32, clear silhouette, ≤ 8 palette keys), `deriveFrames`:
- `idle`: `[base, shiftY(base, -1)]` (bob up 1px, transparent-fill vacated row).
- `happy`: `[base, squashStretch(base)]` — 1px vertical squash + copy edge columns out 1px.
- `eat`: `[withMouth(base, "closed"), withMouth(base, "open")]` — toggle a 2px mouth pair on a fixed mouth row (choose per species, default row 21).
- `sleep`: `[flatten(base, 0.7) + zGlyph(1), flatten(base, 0.7) + zGlyph(2)]` — vertical scale to ~70% anchored at the feet, replace eye pixels with a 1px closed line, draw a small `z` in a `Z` palette colour top-right; frame 2 nudges the `z` up-right by 1px.

`VARIANT_MAPS`: for each species, 4 objects overriding its palette keys — `0` = as-authored (`natural`), `1` `warm` (shift hues toward red/orange), `2` `cool` (toward blue/green), `3` `pale` (lift lightness, reduce saturation). Keep the outline key (`K`) constant across variants.

`packSheet([idleFrames, happyFrames, eatFrames, sleepFrames])` → 64×128 index buffer + merged palette (union of the variant-mapped palette; ≤ 15 entries; index 0 transparent).

Main entry: for each species, `deriveFrames(parseGrid(SPECIES_ART[s]).grid)`; for `v` in `0..3` apply `VARIANT_MAPS[s][v]`, `packSheet`, `encodePNG`, write `pet/<species>-<v>.png` (mkdir -p the `pet/` dir). Rewrite `LICENSE.txt` (see Step 4). `--preview`: render ASCII instead of writing.

- [ ] **Step 4: Rewrite `LICENSE.txt`**

`potato-pet/assets/sprites/LICENSE.txt`:
```
All sprites in this directory are generated by tools/gen-art.mjs from
hand-authored pixel grids in that script. They are released to the public
domain (CC0 1.0). No third-party assets are used or redistributed.
Regenerate with:  cd tools && npm run gen
```

- [ ] **Step 5: Run the generator, then the tests**

Run: `cd tools && npm run gen && node --test`
Expected: 32 files under `potato-pet/assets/sprites/pet/`; all Task 2 tests + the Task 1 encoder tests PASS.

- [ ] **Step 6: Capture the ASCII preview into the report**

Run: `cd tools && node gen-art.mjs --preview`
Paste the full output into the task report. (The reviewer and controller judge recognisability from this.)

- [ ] **Step 7: Confirm the game suite is untouched**

Run: `node potato-pet/run-suite.mjs`
Expected: `1248 / 1248 passed` (this task changed nothing under `potato-pet/js/`).

- [ ] **Step 8: Commit**

```bash
git add tools/gen-art.mjs tools/gen-art.test.mjs potato-pet/assets/sprites/pet potato-pet/assets/sprites/LICENSE.txt
git commit -m "feat(tools): generate pet sprite sheets (8 species x 4 palette variants)

Hand-authored 32x32 base grids + derived idle/happy/eat/sleep frames,
packed 2 cols x 4 rows into 64x128 indexed PNGs. Deterministic;
--preview prints ASCII. 32 committed sheets."
```

---

### Task 3: `sprites.js` manifest + `sprites.tests.js` + harness wiring

**Files:**
- Modify: `potato-pet/js/sprites.js`
- Create: `potato-pet/js/sprites.tests.js`
- Modify: `potato-pet/tests.html`, `potato-pet/run-suite.mjs`
- Verify (no change expected): `potato-pet/index.html` already has `<script src="js/sprites.js">`

**Interfaces:**
- Consumes: `App.world.SPECIES`.
- Produces:
  - `App.sprites.manifest[species] = { cell: 32, cols: 2, variants: 4, rows: 4, placeholderColor, sheet: (v)=>string, anims: { idle:{row:0,frames:2,fps:2}, happy:{row:1,frames:2,fps:8}, eat:{row:2,frames:2,fps:6}, sleep:{row:3,frames:2,fps:1} } }`.
  - `App.sprites.animFor(species, name)` → the anim def; unknown species OR unknown name → a def deep-equal to `idle`; never throws.
  - `App.sprites.variantFor(tint)` → `0..3`, total & wrapping (`((Math.floor(t/90)%4)+4)%4`; non-finite/non-number → 0).
  - `App.sprites.CELL` (32), `App.sprites.COLS` (2), `App.sprites.VARIANTS` (4).
  - `manifest[species].sheet(v)` === `"assets/sprites/pet/" + species + "-" + v + ".png"`.

- [ ] **Step 1: Write the failing tests**

`potato-pet/js/sprites.tests.js`:
```js
window.__pushTests(function spritesTests() {
  const S = App.sprites;
  App.world.SPECIES.forEach(sp => {
    const m = S.manifest[sp];
    assert("manifest has " + sp, !!m);
    assertEq(sp + " cell", m.cell, 32);
    assertEq(sp + " cols", m.cols, 2);
    assertEq(sp + " variants", m.variants, 4);
    assertEq(sp + " rows", m.rows, 4);
    assert(sp + " has placeholderColor", typeof m.placeholderColor === "string");
    assert(sp + " sheet is fn", typeof m.sheet === "function");
    assertEq(sp + " sheet(2)", m.sheet(2), "assets/sprites/pet/" + sp + "-2.png");
    ["idle", "happy", "eat", "sleep"].forEach((n, i) => {
      const a = m.anims[n];
      assert(sp + " anim " + n + " exists", !!a);
      assertEq(sp + " anim " + n + " row", a.row, i);
      assert(sp + " anim " + n + " frames num", typeof a.frames === "number" && a.frames > 0);
      assert(sp + " anim " + n + " fps num", typeof a.fps === "number" && a.fps > 0);
    });
  });

  // animFor fallback
  const sp0 = App.world.SPECIES[0];
  assertEq("animFor idle", App.sprites.animFor(sp0, "idle"), App.sprites.manifest[sp0].anims.idle);
  assertEq("animFor unknown anim -> idle", App.sprites.animFor(sp0, "zzz"), App.sprites.manifest[sp0].anims.idle);
  assertEq("animFor unknown species -> idle-shaped",
    App.sprites.animFor("nope", "idle"), App.sprites.manifest[sp0].anims.idle);
  assertEq("animFor peek falls back", App.sprites.animFor(sp0, "peek"), App.sprites.manifest[sp0].anims.idle);

  // variantFor
  [[0,0],[89,0],[90,1],[180,2],[270,3],[359,3],[360,0],[450,1],[-90,3],[-1,3]].forEach(([in_, out]) =>
    assertEq("variantFor(" + in_ + ")", App.sprites.variantFor(in_), out));
  assertEq("variantFor(NaN)", App.sprites.variantFor(NaN), 0);
  assertEq("variantFor(undefined)", App.sprites.variantFor(undefined), 0);
  assertEq("variantFor('x')", App.sprites.variantFor("x"), 0);
});
```

- [ ] **Step 2: Wire the harnesses**

`potato-pet/tests.html` — add after line 15 (`<script src="js/world.js"></script>`):
```html
<script src="js/sprites.js"></script>
```
and after the `world.tests.js` line in the test block:
```html
<script src="js/sprites.tests.js"></script>
```

`potato-pet/run-suite.mjs` — module list (line ~56): insert `'sprites.js'` right after `'world.js'`. Test-file list (line ~77): insert `'sprites.tests.js'` right after `'world.tests.js'`.

- [ ] **Step 3: Run tests, verify the new ones FAIL**

Run: `node potato-pet/run-suite.mjs`
Expected: `spritesTests` FAILs (old manifest lacks `cell`/`cols`/`variants`/`rows`/`sheet`; `variantFor` undefined). All 1248 prior tests still pass.

- [ ] **Step 4: Rewrite `potato-pet/js/sprites.js`**

```js
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
```

- [ ] **Step 5: Run tests, verify all pass**

Run: `node potato-pet/run-suite.mjs`
Expected: `12xx / 12xx passed` (1248 + the new `spritesTests` assertions), exit 0. Open `potato-pet/tests.html` in a browser once — green.

- [ ] **Step 6: Commit**

```bash
git add potato-pet/js/sprites.js potato-pet/js/sprites.tests.js potato-pet/tests.html potato-pet/run-suite.mjs
git commit -m "feat: sprites.js manifest for real sheets + variantFor

Manifest gains cell/cols/variants/rows/sheet(v); animFor keeps its
no-throw idle fallback; variantFor maps pet.tint into 0..3 (total,
wrapping). New sprites.tests.js wired into both harnesses."
```

---

### Task 4: `pet.js` frame-stepping renderer + `styles.css` + `startscreen.js` preview

**Files:**
- Modify: `potato-pet/js/pet.js`
- Modify: `potato-pet/styles.css`
- Modify: `potato-pet/js/startscreen.js`

**Interfaces:**
- Consumes: `App.sprites.manifest`, `App.sprites.animFor`, `App.sprites.variantFor`, `App.sprites.CELL`, `App.sprites.COLS`.
- Produces: no API change. `App.pet.{mount, render, playAnim, speak}` keep their signatures.

> DOM code — no unit tests (Global Constraints). Gate = manual verification + review.

- [ ] **Step 1: Rewrite `potato-pet/js/pet.js`**

```js
window.App = window.App || {};
App.pet = (function () {
  const SCALE = 3;
  let el = null, bubble = null, bubbleTimer = null, world = null;
  let stepTimer = null, ambient = "idle", col = 0;

  function sheetGeom(species) {
    const m = App.sprites.manifest[species] || { cell: 32, cols: 2, rows: 4 };
    return {
      cell: m.cell * SCALE,
      bgw: m.cols * m.cell * SCALE,
      bgh: m.rows * m.cell * SCALE
    };
  }

  function stop() { if (stepTimer) { clearInterval(stepTimer); stepTimer = null; } }

  function runAnim(name, loop, done) {
    if (!el || el.classList.contains("fallback")) { if (done) done(); return; }
    const a = App.sprites.animFor(world.pet.species, name);
    const g = sheetGeom(world.pet.species);
    stop();
    col = 0;
    const place = () => {
      el.style.backgroundPositionX = -(col * g.cell) + "px";
      el.style.backgroundPositionY = -(a.row * g.cell) + "px";
    };
    place();
    stepTimer = setInterval(() => { col = (col + 1) % a.frames; place(); }, Math.max(60, 1000 / a.fps));
    if (!loop) {
      const ms = Math.max(400, (a.frames / a.fps) * 1000);
      setTimeout(() => { stop(); runAmbient(); if (done) done(); }, ms);
    }
  }

  function runAmbient() { runAnim(ambient, true); }

  function mount(container, w) {
    world = w;
    stop();
    container.innerHTML =
      '<div class="stage">' +
        '<div class="speech" hidden></div>' +
        '<div class="pet pixel" data-mood="happy"></div>' +
      '</div>';
    el = container.querySelector(".pet");
    bubble = container.querySelector(".speech");
    const m = App.sprites.manifest[world.pet.species] || { placeholderColor: "#999" };
    const g = sheetGeom(world.pet.species);
    el.style.width = el.style.height = (m.cell ? m.cell * SCALE : 96) + "px";
    el.style.backgroundRepeat = "no-repeat";
    el.style.backgroundSize = g.bgw + "px " + g.bgh + "px";
    const v = App.sprites.variantFor(world.pet.tint);
    const src = m.sheet ? m.sheet(v) : null;
    if (!src) { fallback(m); return; }
    const img = new Image();
    img.onload = () => { el.style.backgroundImage = "url(" + src + ")"; ambient = "idle"; runAmbient(); };
    img.onerror = () => { fallback(m); };
    img.src = src;
  }

  function fallback(m) {
    if (!el) return;
    el.classList.add("fallback");
    el.style.background = m.placeholderColor || "#999";
    el.style.filter = "hue-rotate(" + ((world.pet.tint || 0) % 360) + "deg)";
    console.warn("pet sprite missing, using placeholder block");
  }

  function render(mood) {
    if (!el) return;
    el.setAttribute("data-mood", mood);
    const want = mood === "sleepy" ? "sleep" : "idle";
    if (want !== ambient) { ambient = want; if (!el.classList.contains("fallback")) runAmbient(); }
  }

  function playAnim(name, done) { runAnim(name, false, done); }

  function speak(text, ms) {
    if (!bubble) return;
    bubble.textContent = text;
    bubble.hidden = false;
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => { bubble.hidden = true; }, ms || 3500);
  }

  return { mount, render, playAnim, speak };
})();
```

- [ ] **Step 2: Update `potato-pet/styles.css`**

Replace the `.pet` rule and remove the dead keyframes/anim rules:
```css
.pet {
  width: 96px; height: 96px;
  background-repeat: no-repeat;
}
.pet.fallback { border-radius: 24px; animation: bob 1.6s ease-in-out infinite; }
.pet[data-mood="sleepy"] { opacity: .85; }
.pet[data-mood="bored"]  { animation: wiggle 1.6s ease-in-out infinite; }
.pet.anim-peek { opacity: .5; }
```
- Keep `@keyframes bob`, `@keyframes wiggle`, `@keyframes snooze`.
- **Remove** `@keyframes chomp`, the old `.pet.anim-eat` rule, the old `.pet.anim-sleep` rule, and the old `.pet` `border-radius` / `animation: bob` (now only on `.fallback`).
- `.preview`:
```css
.preview { width: 96px; height: 96px; margin: 12px 0; background-repeat: no-repeat; }
.preview.fallback { width: 140px; height: 140px; border-radius: 24px; }
```

- [ ] **Step 3: Update the creation preview in `potato-pet/js/startscreen.js`**

In `startCreation`'s `paint()`, replace the `.preview` div construction. Current:
```js
      const col = (App.sprites.manifest[preview.pet.species] || {}).placeholderColor || "#999";
      container.innerHTML =
        '<h1>Meet your new pet!</h1>' +
        '<div class="preview pixel" style="background:' + col +
          ';filter:hue-rotate(' + preview.pet.tint + 'deg)"></div>' +
        ...
```
New:
```js
      const m = App.sprites.manifest[preview.pet.species] || {};
      const S = 3;
      const bg = m.sheet
        ? 'background-image:url(' + m.sheet(App.sprites.variantFor(preview.pet.tint)) +
          ');background-size:' + (m.cols*m.cell*S) + 'px ' + (m.rows*m.cell*S) +
          'px;background-position:0 0'
        : 'background:' + (m.placeholderColor || "#999") + ';filter:hue-rotate(' + (preview.pet.tint||0) + 'deg)';
      container.innerHTML =
        '<h1>Meet your new pet!</h1>' +
        '<div class="preview pixel" id="pvpet" style="' + bg + '"></div>' +
        ...
```
After setting `innerHTML`, add a probe so a missing sheet degrades:
```js
      if (m.sheet) {
        const probe = new Image();
        probe.onerror = () => {
          const d = container.querySelector("#pvpet");
          if (d) { d.classList.add("fallback");
            d.style.backgroundImage = "none";
            d.style.background = (m.placeholderColor || "#999");
            d.style.filter = "hue-rotate(" + (preview.pet.tint||0) + "deg)"; }
        };
        probe.src = m.sheet(App.sprites.variantFor(preview.pet.tint));
      }
```
Nothing else in `startscreen.js` changes.

- [ ] **Step 4: Run the game suite (unchanged)**

Run: `node potato-pet/run-suite.mjs`
Expected: same count as after Task 3 (no test files touched; `pet.js`/`startscreen.js` have none).

- [ ] **Step 5: Manual verification**

Open `potato-pet/index.html` from `file://`:
- Adopt a pet. It shows an animated sprite (idle bob via frame-stepping), not a flat block.
- Feed → `eat` frames play, then return to idle. Put to bed → `sleep` frames + dimming. Hide-and-seek → peek dims the pet.
- Make several new pets until you see the same species with different codes → visibly different palette variants (or note in report if RNG didn't surface one).
- Rename `potato-pet/assets/sprites/pet/<some-species>-0.png`, reload a pet of that species+variant → coloured-block fallback, exactly one `console.warn`, no error overlay. Restore the file.
If a browser is unavailable, say so and paste the final `pet.js` + the preview region of `startscreen.js` into the report for the reviewer to trace the timer/fallback logic.

- [ ] **Step 6: Commit**

```bash
git add potato-pet/js/pet.js potato-pet/styles.css potato-pet/js/startscreen.js
git commit -m "feat: frame-stepping pixel-art pet renderer

pet.js steps background-position over the sheet at each anim's fps
(ambient idle/sleep + one-shot eat/happy), preloads the variant sheet
and falls back to the coloured block on error. styles.css drops the
CSS-keyframe pet animation; creation preview shows the idle frame.
Pet track complete."
```

---

### Task 5: Room tile + decoration sprite generation

**Files:**
- Modify: `tools/gen-art.mjs` (room tiles + deco sprites + write loop)
- Modify: `tools/gen-art.test.mjs` (room/deco completeness + validity, still deterministic)
- Create: `potato-pet/assets/sprites/room/floor-<theme>.png`, `room/wall-<theme>.png` (8), `potato-pet/assets/sprites/deco/<id>.png` (12) — via running the script

**Interfaces:**
- Consumes: `parseGrid`, `encodePNG`, `packSheet` helpers (Tasks 1–2).
- Produces:
  - `THEME_ART[theme] = { floor: {palette,pixels}, wall: {palette,pixels} }` — 32×32 grids designed to tile seamlessly (opposite edges match).
  - `DECO_ART[id] = { palette, pixels }` — 32×32, transparent background, object centred.
  - Running `node gen-art.mjs` now also writes `room/floor-<theme>.png`, `room/wall-<theme>.png`, `deco/<id>.png`.
  - `--preview` also prints every room tile and decoration.

- [ ] **Step 1: Extend the completeness test (failing)**

Add to `gen-art.test.mjs`:
```js
const THEMES = "meadow bedroom space beach".split(" ");
const DECO = "rug lamp plant poster beanbag bookshelf window ball blocks clock table cushion".split(" ");

test("gen-art writes room tiles + deco sprites, 32x32, valid PNG", () => {
  execFileSync("node", ["gen-art.mjs"], { cwd: HERE });
  for (const t of THEMES) for (const kind of ["floor", "wall"]) {
    const p = path.join(OUT, "room", `${kind}-${t}.png`);
    assert.ok(fs.existsSync(p), `missing ${kind}-${t}`);
    assert.deepEqual(dims(png(p)), [32, 32]);
  }
  for (const id of DECO) {
    const p = path.join(OUT, "deco", `${id}.png`);
    assert.ok(fs.existsSync(p), `missing deco ${id}`);
    assert.deepEqual(dims(png(p)), [32, 32]);
  }
});

test("floor tiles tile seamlessly (left edge == right edge, top == bottom)", () => {
  // decode indices and compare opposite edges
  for (const t of THEMES) {
    const b = png(path.join(OUT, "room", `floor-${t}.png`));
    // walk to IDAT, inflate, strip filter bytes -> 32x32 indices
    let off = 8, idat = null;
    while (off < b.length) {
      const len = b.readUInt32BE(off), type = b.toString("latin1", off+4, off+8);
      if (type === "IDAT") idat = b.subarray(off+8, off+8+len);
      off += 12 + len;
    }
    const raw = zlib.inflateSync(idat), W = 32;
    const at = (x,y) => raw[y*(1+W) + 1 + x];
    for (let y = 0; y < 32; y++) assert.equal(at(0,y), at(31,y), `${t} row ${y} L/R`);
    for (let x = 0; x < 32; x++) assert.equal(at(x,0), at(x,31), `${t} col ${x} T/B`);
  }
});
```
(Keep the existing determinism test — extend its `cap()` to also read the room/deco files so determinism is checked for them too.)

- [ ] **Step 2: Run tests, verify failure**

Run: `cd tools && node --test` → the new room/deco tests FAIL (files absent).

- [ ] **Step 3: Author + generate in `gen-art.mjs`**

- `THEME_ART`: 4 themes. `floor`: a small ground pattern (meadow = grass tufts, bedroom = carpet weave, space = starfield dots, beach = sand ripples), edges matched so `at(0,y)==at(31,y)` and `at(x,0)==at(x,31)`. `wall`: a matching upper band (meadow = sky+hill, bedroom = wallpaper stripe, space = deep blue + stars, beach = sky+sea line). Palettes ≤ 6 keys, all opaque (index 0 unused / set to a background colour, since tiles are not transparent — still emit `tRNS [0]` but no pixel uses index 0).
- `DECO_ART`: 12 recognisable objects, 32×32, transparent background (index 0), centred, ≤ 6 palette keys each: `rug` (flat oval), `lamp` (post + shade + glow), `plant` (pot + leaves), `poster` (framed rectangle w/ a shape), `beanbag` (rounded blob), `bookshelf` (shelf + book spines), `window` (frame + panes + sky), `ball` (circle + highlight), `blocks` (2–3 stacked cubes), `clock` (circle + hands), `table` (top + legs), `cushion` (rounded square + star).
- Write loop: `mkdir -p room/ deco/`; for each theme write `floor-<t>.png` / `wall-<t>.png`; for each id write `deco/<id>.png`. `--preview` prints them.

- [ ] **Step 4: Generate + test + preview**

Run: `cd tools && npm run gen && node --test`
Expected: all Task 1/2/5 tests PASS; 8 room + 12 deco files present.
Run: `cd tools && node gen-art.mjs --preview` → paste the room/deco portion into the report.

- [ ] **Step 5: Game suite untouched**

Run: `node potato-pet/run-suite.mjs` → same count as after Task 4.

- [ ] **Step 6: Commit**

```bash
git add tools/gen-art.mjs tools/gen-art.test.mjs potato-pet/assets/sprites/room potato-pet/assets/sprites/deco
git commit -m "feat(tools): generate room tiles + decoration sprites

4 themes x (floor,wall) seamless 32x32 tiles + 12 transparent 32x32
decoration sprites. Determinism + seam + completeness tests."
```

---

### Task 6: `room.js` `renderRoom` + `gamescreen.js` shop icons + `styles.css` room block

**Files:**
- Modify: `potato-pet/js/room.js` (only `renderRoom`)
- Modify: `potato-pet/js/gamescreen.js` (only `renderShop`)
- Modify: `potato-pet/styles.css`

**Interfaces:**
- Consumes: the room/deco PNGs (Task 5); `App.room.CATALOG` (for the label first-letter + `id`).
- Produces: no API change. `renderRoom(container, world, opts)` still emits `<button class="cell" data-x data-y>` and wires `opts.placeMode`/`opts.onPlaceCell`. `App.room`'s other exports are untouched.

> DOM code — no unit tests. `room.tests.js` (buy/place/bounds) must stay green because none of that logic changes.

- [ ] **Step 1: Rewrite `renderRoom` in `potato-pet/js/room.js`**

```js
  function renderRoom(container, world, opts) {
    opts = opts || {};
    const cells = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const here = world.room.placed.find(p => p.x === x && p.y === y);
      let inner = "";
      if (here) {
        const c = byId(here.item);
        const letter = c ? c.label[0] : "?";
        inner = '<span class="deco pixel" data-item="' + here.item +
          '" style="background-image:url(assets/sprites/deco/' + here.item + '.png)">' + letter + '</span>';
      }
      cells.push('<button class="cell" data-x="' + x + '" data-y="' + y + '">' + inner + '</button>');
    }
    container.innerHTML =
      '<div class="room theme-' + world.room.theme + '"' +
        ' style="background-image:url(assets/sprites/room/floor-' + world.room.theme + '.png)">' +
      '<div class="wall" style="background-image:url(assets/sprites/room/wall-' + world.room.theme + '.png)"></div>' +
      cells.join("") + '</div>';
    // deco fallback: if a sprite 404s, reveal the letter
    container.querySelectorAll(".deco").forEach(sp => {
      const url = "assets/sprites/deco/" + sp.dataset.item + ".png";
      const probe = new Image();
      probe.onerror = () => sp.classList.add("noimg");
      probe.src = url;
    });
    if (opts.placeMode && opts.onPlaceCell) {
      container.querySelectorAll(".cell").forEach(btn => btn.addEventListener("click", () => {
        opts.onPlaceCell(+btn.dataset.x, +btn.dataset.y);
      }));
    }
  }
```

- [ ] **Step 2: Add shop icons in `potato-pet/js/gamescreen.js` `renderShop`**

Change the `.map` body (currently returns `'<button data-buy="' + c.id + '"' + ... + '>' + c.label + ...`):
```js
      return '<button data-buy="' + c.id + '"' + (owned || !App.room.canBuy(world, c.id) ? ' disabled' : '') +
        '><span class="shopicon pixel" style="background-image:url(assets/sprites/deco/' + c.id + '.png)"></span>' +
        c.label + (owned ? ' ✓' : ' — ★' + c.price) + '</button>';
```
Nothing else in `renderShop` or `gamescreen.js` changes.

- [ ] **Step 3: Update `potato-pet/styles.css` room block**

```css
.room {
  position: relative;
  display: grid; grid-template-columns: repeat(12, 1fr); gap: 2px;
  background: #cd8c5c;                 /* fallback colour, stays */
  background-size: 24px;
  image-rendering: pixelated;
  padding: 6px; border-radius: 10px;
}
.room.theme-space   { background-color: #2a2350; }
.room.theme-beach   { background-color: #e8d6a0; }
.room.theme-bedroom { background-color: #b98cc0; }
.wall {
  position: absolute; left: 0; right: 0; top: 0; height: 22px;
  background-repeat: repeat-x; background-size: 22px; image-rendering: pixelated;
  border-radius: 10px 10px 0 0; pointer-events: none;
}
.cell {
  aspect-ratio: 1; padding: 0; border-radius: 4px; border: 1px solid rgba(0,0,0,.15);
  background: transparent; display: grid; place-items: center;
}
.deco {
  width: 100%; height: 100%;
  background-size: contain; background-repeat: no-repeat; background-position: center;
  color: transparent; font-size: 12px; font-weight: 700;
}
.deco.noimg { color: inherit; }
.shopicon {
  display: inline-block; width: 18px; height: 18px; vertical-align: -3px; margin-right: 6px;
  background-size: contain; background-repeat: no-repeat; background-position: center;
}
```
- Replace the old `.room` / `.room.theme-*` / `.cell` / `.deco` rules with the above (note `.room.theme-*` now uses `background-color` so the tile `background-image` isn't clobbered).
- The first grid row is visually behind `.wall`; that is acceptable (the wall is a decorative band). If a cell in row 0 must stay clickable, `.wall { pointer-events: none }` already ensures clicks pass through.

- [ ] **Step 4: Run suites**

Run: `node potato-pet/run-suite.mjs` — unchanged count (room.tests.js green: no buy/place logic touched).
Run: `cd worker && npm test` — 10/10 (sanity; untouched).

- [ ] **Step 5: Manual verification**

Open `potato-pet/index.html?dev` from `file://`:
- Each of the 4 themes (make new pets until you see each, or use the dev panel) shows a tiled floor + a wall band, not a flat colour.
- Decorate → buy a few items → each shows its sprite icon on the shop button; place them → each cell shows the decoration sprite, not a letter.
- Rename one `deco/*.png` → that item's cell shows its first letter instead; rename a `room/floor-*.png` → that theme falls back to the flat colour. One `console.warn` per missing file, no overlay. Restore.
If no browser, paste the final `renderRoom`, the `renderShop` map body, and the room CSS block into the report.

- [ ] **Step 6: Commit**

```bash
git add potato-pet/js/room.js potato-pet/js/gamescreen.js potato-pet/styles.css
git commit -m "feat: tiled pixel-art room + decoration sprites + shop icons

renderRoom paints floor/wall tile sheets and decoration sprites (first
letter kept as a fallback); shop buttons show the item sprite. Room
track complete."
```

---

### Task 7: Docs

**Files:**
- Modify: `potato-pet/TESTING.md`
- Modify: `potato-pet/README.md`

**Interfaces:** none.

- [ ] **Step 1: Append a Phase 3 section to `potato-pet/TESTING.md`**

```markdown

## Phase 3 — pixel-art sprites (visual)

1. Adopt a pet: it shows an animated pixel sprite, not a flat block. The idle bob is frame-stepped.
2. Feed it -> the eat frames play, then it returns to idle. Put it to bed -> the sleep frames + dimming. Hide-and-seek -> the pet dims while hidden.
3. Enter the same species with two different codes -> the two pets use different palette variants.
4. Decorate: each shop button shows the item's sprite icon; buying + placing an item shows that sprite in the grid cell.
5. Each of the four room themes (meadow / bedroom / space / beach) shows a tiled floor and a wall band.
6. Break an asset to check the fallbacks (restore the file afterwards):
   - rename `assets/sprites/pet/<species>-0.png` -> that pet shows the old coloured block, one console warning, no error screen
   - rename a `assets/sprites/deco/<id>.png` -> that decoration shows its first letter
   - rename a `assets/sprites/room/floor-<theme>.png` -> that theme shows the flat background colour
```

- [ ] **Step 2: Add a regenerate-art note to `potato-pet/README.md`**

Under "Dev tools" (or as a new short section):
```markdown
## Regenerate the art
The sprites in `assets/sprites/` are generated, not hand-drawn files.
Edit the pixel grids in `tools/gen-art.mjs`, then:
  cd tools && npm run gen
Output is deterministic — re-running with no edits changes nothing.
`node gen-art.mjs --preview` prints ASCII of every sprite without writing.
```

- [ ] **Step 3: Verify both suites**

Run: `node potato-pet/run-suite.mjs` and `cd tools && node --test` and `cd worker && npm test`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add potato-pet/TESTING.md potato-pet/README.md
git commit -m "docs: Phase 3 visual test checklist + art regeneration note"
```

---

## Self-Review

**1. Spec coverage**

| Spec section | Task(s) |
|---|---|
| §3 architecture (generator → assets → sprites.js → pet/room) | 1–6 |
| §4.1 run model, script-relative paths, `--preview` | 1, 2, 5 |
| §4.2 authoring DSL (`{palette, pixels[]}`) | 2 |
| §4.3 indexed-PNG encoder, deterministic, CRC | 1 |
| §4.4 pet sheets: 8×4, 64×128, rows idle/happy/eat/sleep, derived frames, variant maps | 2 |
| §4.5 room floor/wall tiles ×4 themes, tileable | 5 |
| §4.6 12 decoration sprites, transparent | 5 |
| §4.7 LICENSE.txt | 2 |
| §5 `sprites.js` manifest + `variantFor` | 3 |
| §6 `pet.js` frame-stepping renderer + fallback + ambient/one-shot | 4 |
| §6 styles.css `.pet` changes, remove dead keyframes | 4 |
| §7 startscreen preview = idle frame + probe fallback | 4 |
| §8 `room.js` renderRoom tiled bg + deco spans + letter fallback | 6 |
| §8 gamescreen renderShop icons | 6 |
| §8 styles.css room block | 6 |
| §9 sequencing (pet track Tasks 1–4 before room track 5–6), permanent fallbacks | task order + Global Constraints |
| §10 `sprites.tests.js` | 3 |
| §10 `gen-art.test.mjs` (encoder, determinism, completeness, seam) | 1, 2, 5 |
| §10 existing suites stay green | every task's verify step |
| §10 manual checklist | 7 (+ per-task manual steps in 4, 6) |
| §11 file manifest | File Structure section |
| §12 out of scope | respected — no editor, no runtime gen, no new content, no logic/save/sync change |

No gaps.

**2. Placeholder scan** — no `TBD` / `TODO` / "similar to Task N" / prose-only code steps. The one place the plan cannot supply literal content is the *pixel art itself* (8 species + 8 tiles + 12 decos): Task 2/5 give the DSL, one fully-authored example (`cat`), the exact transforms, dimensions, palette limits, and a hard gate (`--preview` ASCII into the report + validity/dimension/determinism/seam tests + reviewer recognisability check). That is a bounded creative latitude, not a placeholder.

**3. Type / name consistency**

- Manifest fields (`cell`, `cols`, `variants`, `rows`, `sheet`, `anims`, `placeholderColor`) — defined Task 3, consumed Task 4 (`pet.js`, `startscreen.js`) and referenced in Task 6 only via `assets/sprites/deco/<id>.png` literals. Consistent.
- `sheet(v)` returns `"assets/sprites/pet/<species>-<v>.png"` — Task 3 defines, Task 2 produces files at exactly that path, Task 4 loads it. Consistent.
- `variantFor` — Task 3 defines (`((floor(t/90)%4)+4)%4`, non-number→0); Task 1's Global Constraint states the same formula; Task 3's test table and Task 4's `mount`/preview use it. Consistent.
- Anim rows `idle=0, happy=1, eat=2, sleep=3` — Task 2 packs sheets in that row order, Task 3 manifest `anims[n].row` matches, Task 4 positions `backgroundPositionY = -(a.row*cell)`. Consistent.
- `encodePNG({width,height,palette,indices})` / `crc32` / `PNG_SIG` — Task 1 exports, Tasks 2 & 5 consume, Task 1 & 5 tests import. Consistent.
- `parseGrid` / `packSheet` — introduced Task 2, reused Task 5. Consistent.
- Cell 32, scale 3, sheet 64×128 — Global Constraints, Task 2 (`dims === [64,128]`), Task 4 (`SCALE=3`, geom math), Task 3 (`cell:32`). Consistent.
- `.deco` first-letter fallback via `.noimg` class — Task 6 `renderRoom` adds the class on probe error, Task 6 CSS `.deco{color:transparent}` / `.deco.noimg{color:inherit}`. Consistent.
- `styles.css` path is `potato-pet/styles.css` throughout (Task 4 and Task 6 Files blocks and step text all agree).

No mismatches.
