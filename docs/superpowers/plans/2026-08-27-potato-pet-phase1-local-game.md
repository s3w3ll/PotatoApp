# Potato Pet — Phase 1: Local Playable Game — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully playable, offline, local-storage virtual-pet web game — adopt/name a seeded pixel-ish pet, feed it, play hide-and-seek, put it to bed, decorate a room with stars earned from fun-facts and two multiple-choice practice games.

**Architecture:** Plain HTML + CSS + JavaScript, no build step. Every `js/*.js` file attaches its API to one global `App` object and is loaded via ordered `<script>` tags. `localStorage` is the only persistence (via a single `App.save` seam that is already `async` so Phase 2 can swap in Cloudflare D1 without touching call sites). Pure logic (seeded RNG, world generation, needs decay, save/migrate, game question generation) is unit-tested by hand-rolled assertions in `tests.html`; DOM behaviour is covered by a manual checklist in `TESTING.md`.

**Tech Stack:** HTML5, CSS3 (`image-rendering: pixelated`, CSS grid), vanilla ES2019 JavaScript, `localStorage`, `speechSynthesis`. No framework, no bundler, no npm. VS Code Live Server (or double-click `index.html`) to run.

**Spec:** `docs/superpowers/specs/2026-08-27-potato-pet-design.md`

## Global Constraints

- **No build tooling for the front-end** — no bundler, framework, or npm. Scripts are plain `<script>` tags in `index.html`, loaded in dependency order.
- **No ES modules** — every file adds to the global `App` object (`window.App = window.App || {}` at the top of each file). Double-clicking `index.html` (`file://`) must work.
- **No `fetch` of local files** — all data (facts, word banks, sprite manifest) lives in `.js` files as literals, not JSON loaded at runtime.
- **`App.save` is the only file that touches `localStorage`.** No other file may reference `localStorage` directly.
- **All `App.save` public methods are `async`** (return Promises) even though Phase 1's implementation is synchronous.
- **Needs decay envelope:** ~10 points/day, every need floored at **25**, negative/NaN elapsed treated as **0**. No sickness, death, or run-away — ever.
- **Storage keys:** `potato-pet:index` (array of `{code, name, species}`), `potato-pet:world:<code>` (world JSON).
- **Code format:** 6 chars from alphabet `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (no `0 O 1 I L`), displayed grouped `XXX-XXX`. Phase 1 generates codes client-side; Phase 2 replaces that with a server call.
- **Hide-and-seek:** exactly **8** hiding spots, one hide per round.
- **Room grid:** **12 × 8** cells, one item per cell, no rotation/stacking.
- **Mini-games:** multiple choice only (4 options, exactly one correct), no timers, no lives, streak resets on wrong answer with no other penalty.
- **Every failure degrades to "keep playing"** — missing sprite → placeholder block; no `speechSynthesis` → text only; corrupt save → offer fresh start, never silent-wipe.
- **Pet name validation:** 1–16 characters after trim, rejected if it matches the rude-word blocklist in `content.js`.
- Commit after every task with a `feat:`/`test:`/`docs:` message.

---

## File Structure

```
potato-pet/
  index.html          page shell; ordered <script> tags; root containers
  styles.css          all styling incl. .pixel { image-rendering: pixelated }
  js/
    config.js         App.config = { apiBase }  (unused in Phase 1, stub for Phase 2)
    rng.js            App.rng: hashCode, mulberry32, seededFrom, pick, int
    save.js           App.save: list/load/set/create/remove (async) + migrations
    world.js          App.world: generateWorld(code), SPECIES, THEMES, STARTERS
    state.js          App.state: world holder, tickNeeds, deriveMood, constants
    content.js        App.content: greetings, affirmations, moodLines, facts,
                      mathBank helpers, spellingLists, RUDE_WORDS
    sprites.js        App.sprites: per-species manifest (placeholder blocks in P1)
    pet.js            App.pet: mount, render(mood), playAnim(name), speak(text)
    interactions.js   App.interactions: feed, putToBed, startHideAndSeek
    room.js           App.room: renderRoom, openShop, buy, enterPlaceMode, place
    games.js          App.games: mathRound, spellingRound, scoreRound,
                      shouldOfferLevelUp, makeMathQuestion, makeSpellingQuestion
    facts.js          App.facts: tellSomething, factOfTheDay
    startscreen.js    App.startscreen: render, randomCode, creation flow + reroll
    devpanel.js       App.devpanel: mount if location.search includes 'dev'
    main.js           boot: wire error overlay, route start screen vs game, tick loop
  assets/
    sprites/
      LICENSE.txt     placeholder note in Phase 1
  tests.html          hand-rolled assertions over pure logic
  TESTING.md          manual post-change checklist
  README.md           how to run, how to add content
```

**Script load order in `index.html`** (dependencies flow downward):
`config.js → rng.js → save.js → world.js → state.js → content.js → sprites.js → pet.js → interactions.js → room.js → games.js → facts.js → startscreen.js → devpanel.js → main.js`

---

## Task 1: Project skeleton + test harness

**Files:**
- Create: `potato-pet/index.html`
- Create: `potato-pet/styles.css`
- Create: `potato-pet/js/config.js`
- Create: `potato-pet/js/main.js`
- Create: `potato-pet/tests.html`
- Create: `potato-pet/assets/sprites/LICENSE.txt`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `window.App` — the global namespace object, created by `config.js`.
  - `App.config` — `{ apiBase: string }` (Phase 1 value: `""`).
  - `tests.html` globals: `assert(name, cond)`, `assertEq(name, actual, expected)`, `assertThrows(name, fn, msgIncludes)`, `runTests()` — plus a `TESTS` array that later task test files push functions onto by defining `window.__pushTests(fn)`.

- [ ] **Step 1: Create the test harness page**

`potato-pet/tests.html`:

```html
<!doctype html>
<html>
<head><meta charset="utf-8"><title>Potato Pet — logic tests</title>
<style>body{font:14px monospace;padding:1rem}.pass{color:#177245}.fail{color:#b00020}</style>
</head>
<body>
<h1>Potato Pet — logic tests</h1>
<pre id="out"></pre>

<!-- load the same modules the app uses, in order -->
<script src="js/config.js"></script>
<script src="js/rng.js"></script>
<script src="js/save.js"></script>
<script src="js/world.js"></script>
<script src="js/state.js"></script>
<script src="js/content.js"></script>
<script src="js/games.js"></script>
<script src="js/facts.js"></script>

<script>
const TESTS = [];
window.__pushTests = fn => TESTS.push(fn);
let _results = [];
function assert(name, cond) { _results.push([name, !!cond]); }
function assertEq(name, actual, expected) {
  assert(name + "  (got " + JSON.stringify(actual) + ")",
         JSON.stringify(actual) === JSON.stringify(expected));
}
function assertThrows(name, fn, msgIncludes) {
  try { fn(); assert(name + " — expected throw", false); }
  catch (e) { assert(name, !msgIncludes || String(e.message).includes(msgIncludes)); }
}
async function runTests() {
  _results = [];
  for (const t of TESTS) { try { await t(); } catch (e) { _results.push(["THREW: " + e.message, false]); } }
  const out = document.getElementById("out");
  const pass = _results.filter(r => r[1]).length;
  out.textContent = _results.map(r => (r[1] ? "  ok  " : " FAIL ") + r[0]).join("\n")
    + "\n\n" + pass + " / " + _results.length + " passed";
  out.className = pass === _results.length ? "pass" : "fail";
}
window.addEventListener("load", runTests);
</script>
</body>
</html>
```

- [ ] **Step 2: Open `tests.html`, verify it runs**

Open `potato-pet/tests.html` in a browser.
Expected: page shows `0 / 0 passed` and no console errors (script 404s are fine to see now — the files come in later tasks; but `config.js` must exist so create it next).

- [ ] **Step 3: Create `config.js` and the `App` namespace**

`potato-pet/js/config.js`:

```js
window.App = window.App || {};
App.config = { apiBase: "" }; // Phase 2 sets this to the deployed Pages origin
```

- [ ] **Step 4: Create the app shell**

`potato-pet/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>Potato Pet</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>
<div id="app"></div>
<div id="overlay" hidden></div>

<script src="js/config.js"></script>
<script src="js/rng.js"></script>
<script src="js/save.js"></script>
<script src="js/world.js"></script>
<script src="js/state.js"></script>
<script src="js/content.js"></script>
<script src="js/sprites.js"></script>
<script src="js/pet.js"></script>
<script src="js/interactions.js"></script>
<script src="js/room.js"></script>
<script src="js/games.js"></script>
<script src="js/facts.js"></script>
<script src="js/startscreen.js"></script>
<script src="js/devpanel.js"></script>
<script src="js/main.js"></script>
</body>
</html>
```

`potato-pet/js/main.js` (minimal for now — expanded in Task 12):

```js
window.App = window.App || {};
window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("app").textContent = "Potato Pet — booting…";
});
```

- [ ] **Step 5: Create baseline stylesheet**

`potato-pet/styles.css`:

```css
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background: #f4ecd8;
  color: #3b2f2f;
  -webkit-user-select: none; user-select: none;
  touch-action: manipulation;
}
#app { max-width: 720px; margin: 0 auto; padding: 12px; }
.pixel { image-rendering: pixelated; image-rendering: crisp-edges; }
button {
  font: inherit; padding: 10px 16px; border-radius: 10px; border: 2px solid #3b2f2f;
  background: #ffd97d; cursor: pointer;
}
button:disabled { opacity: .45; cursor: default; }
#overlay {
  position: fixed; inset: 0; display: grid; place-items: center;
  background: rgba(0,0,0,.55); color: #fff; text-align: center; padding: 24px;
}
#overlay[hidden] { display: none; }
```

- [ ] **Step 6: Create the sprite licence placeholder**

`potato-pet/assets/sprites/LICENSE.txt`:

```
Phase 1 uses coloured placeholder blocks, no third-party art.
Phase 3 will list each sprite sheet and its CC0 source pack here
(Kenney.nl / itch.io CC0), one line per file.
```

- [ ] **Step 7: Verify the shell loads**

Open `potato-pet/index.html`. Expected: page reads "Potato Pet — booting…", no console errors.

- [ ] **Step 8: Commit**

```bash
git add potato-pet/
git commit -m "feat: project skeleton, app shell, and hand-rolled test harness"
```

---

## Task 2: Seeded RNG

**Files:**
- Create: `potato-pet/js/rng.js`
- Test: add to `potato-pet/tests.html` via a new `<script src="js/rng.test-inline.js">`? No — inline tests live in `tests.html` itself is messy. Instead create `potato-pet/js/rng.tests.js` and add `<script src="js/rng.tests.js"></script>` to `tests.html` AFTER the harness `<script>` block. Each `*.tests.js` calls `window.__pushTests(...)`.

**Interfaces:**
- Consumes: nothing.
- Produces on `App.rng`:
  - `hashCode(str: string) -> number` — unsigned 32-bit, deterministic.
  - `mulberry32(seed: number) -> () => number` — each call returns a float in `[0, 1)`; same seed → same sequence.
  - `seededFrom(code: string) -> () => number` — `mulberry32(hashCode(code))`.
  - `pick(rand: () => number, arr: T[]) -> T`.
  - `int(rand: () => number, min: number, max: number) -> number` — integer in `[min, max]` inclusive.

- [ ] **Step 1: Write the failing tests**

`potato-pet/js/rng.tests.js`:

```js
window.__pushTests(function rngTests() {
  // hashCode is deterministic and unsigned
  assertEq("hashCode stable", App.rng.hashCode("K7F-9Q2"), App.rng.hashCode("K7F-9Q2"));
  assert("hashCode unsigned", App.rng.hashCode("anything") >= 0);
  assert("hashCode differs for different input",
    App.rng.hashCode("AAA-AAA") !== App.rng.hashCode("AAA-AAB"));

  // mulberry32 same seed -> same first 5 values
  const a = App.rng.mulberry32(12345), b = App.rng.mulberry32(12345);
  const seqA = [a(), a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b(), b()];
  assertEq("mulberry32 deterministic", seqA, seqB);
  assert("mulberry32 in range", seqA.every(x => x >= 0 && x < 1));
  assert("mulberry32 not constant", new Set(seqA).size > 1);

  // pick / int
  const r = App.rng.mulberry32(1);
  assert("pick returns an element", ["x","y","z"].includes(App.rng.pick(r, ["x","y","z"])));
  const r2 = App.rng.mulberry32(2);
  const ints = Array.from({length: 200}, () => App.rng.int(r2, 3, 7));
  assert("int within bounds", ints.every(n => n >= 3 && n <= 7 && Number.isInteger(n)));
  assert("int hits both ends", ints.includes(3) && ints.includes(7));

  // seededFrom ties them together
  const s1 = App.rng.seededFrom("HELLO1"), s2 = App.rng.seededFrom("HELLO1");
  assertEq("seededFrom deterministic", [s1(), s1()], [s2(), s2()]);
});
```

Add to `tests.html` right after the closing `</script>` of the harness:

```html
<script src="js/rng.tests.js"></script>
<script>runTests();</script>
```

- [ ] **Step 2: Run tests to verify they fail**

Open `tests.html`. Expected: FAIL lines mentioning `App.rng` is undefined / cannot read properties of undefined.

- [ ] **Step 3: Implement `rng.js`**

`potato-pet/js/rng.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Open `tests.html`. Expected: all rng tests `ok`.

- [ ] **Step 5: Commit**

```bash
git add potato-pet/js/rng.js potato-pet/js/rng.tests.js potato-pet/tests.html
git commit -m "feat: seeded RNG (FNV-1a hash + mulberry32) with tests"
```

---

## Task 3: Save system (local) + migrations

**Files:**
- Create: `potato-pet/js/save.js`
- Create: `potato-pet/js/save.tests.js`
- Modify: `potato-pet/tests.html` — add `<script src="js/save.tests.js"></script>` before the final `runTests()`.

**Interfaces:**
- Consumes: nothing (does NOT depend on `world.js`).
- Produces on `App.save`:
  - `CURRENT_VERSION: number` — `1` in Phase 1.
  - `list() -> Promise<Array<{code, name, species}>>`.
  - `load(code: string) -> Promise<world | null>` — `null` if absent; throws `Error("SAVE_CORRUPT")` if the stored value won't parse or fails the shape check; auto-migrates and re-saves if `world.version < CURRENT_VERSION`.
  - `set(world) -> Promise<world>` — stamps `world.savedAt = Date.now()`, writes `potato-pet:world:<code>`, upserts the index. Returns the same world.
  - `create(world) -> Promise<world>` — Phase 1 alias for `set`.
  - `remove(code: string) -> Promise<void>`.
  - `_migrate(world) -> world` and `_migrations` object — exposed for tests.
- Shape check used by `load`: value is a non-null object with `pet`, `room`, and `learn` properties.

- [ ] **Step 1: Write the failing tests**

`potato-pet/js/save.tests.js`:

```js
window.__pushTests(async function saveTests() {
  const CODE = "TST-001";
  await App.save.remove(CODE);

  // round-trip
  const w = {
    version: App.save.CURRENT_VERSION, code: CODE, savedAt: 0,
    pet: { species: "turtle", name: "T", adoptedAt: 1, tint: 0,
           needs: { hunger: 100, energy: 100, fun: 100 }, lastTick: 1 },
    stars: 0, room: { theme: "meadow", owned: [], placed: [] },
    learn: { factsSeen: [], game: { mathLevel: 1, spellingLevel: 1, bestStreak: 0 } }
  };
  const saved = await App.save.set(w);
  assert("set stamps savedAt", saved.savedAt > 0);
  const loaded = await App.save.load(CODE);
  assertEq("round-trips pet name", loaded.pet.name, "T");

  // index reflects the save
  const idx = await App.save.list();
  assert("index contains code", idx.some(e => e.code === CODE && e.species === "turtle"));

  // absent code -> null
  assertEq("missing code returns null", await App.save.load("NO-PE1"), null);

  // corrupt -> throws SAVE_CORRUPT (write junk through the raw key)
  localStorage.setItem("potato-pet:world:" + CODE, "{not json");
  await assertThrowsAsync("corrupt parse throws SAVE_CORRUPT",
    () => App.save.load(CODE), "SAVE_CORRUPT");
  localStorage.setItem("potato-pet:world:" + CODE, JSON.stringify({ nope: true }));
  await assertThrowsAsync("bad shape throws SAVE_CORRUPT",
    () => App.save.load(CODE), "SAVE_CORRUPT");

  // migration: register a temporary 1->2 step, bump CURRENT_VERSION locally
  const realCurrent = App.save.CURRENT_VERSION;
  App.save._migrations[1] = world => { world.learn.game.newField = 42; world.version = 2; return world; };
  Object.defineProperty(App.save, "CURRENT_VERSION", { value: 2, configurable: true });
  const v1 = Object.assign({}, w, { version: 1, code: "MIG-001" });
  v1.learn = { factsSeen: [], game: { mathLevel: 1, spellingLevel: 1, bestStreak: 0 } };
  localStorage.setItem("potato-pet:world:MIG-001", JSON.stringify(v1));
  const migrated = await App.save.load("MIG-001");
  assertEq("migration ran", migrated.learn.game.newField, 42);
  assertEq("migration bumped version", migrated.version, 2);
  // restore
  delete App.save._migrations[1];
  Object.defineProperty(App.save, "CURRENT_VERSION", { value: realCurrent, configurable: true });
  await App.save.remove("MIG-001");
  await App.save.remove(CODE);
});
```

Add this helper to the harness `<script>` in `tests.html` (next to `assertThrows`):

```js
async function assertThrowsAsync(name, fn, msgIncludes) {
  try { await fn(); assert(name + " — expected throw", false); }
  catch (e) { assert(name, !msgIncludes || String(e.message).includes(msgIncludes)); }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Open `tests.html`. Expected: FAIL — `App.save` undefined.

- [ ] **Step 3: Implement `save.js`**

`potato-pet/js/save.js`:

```js
window.App = window.App || {};
App.save = (function () {
  let CURRENT_VERSION = 1;
  const INDEX_KEY = "potato-pet:index";
  const worldKey = code => "potato-pet:world:" + code;
  const migrations = {}; // migrations[n] : (world@vN) -> world@v(N+1)

  function migrate(world) {
    while (world.version < CURRENT_VERSION) {
      const step = migrations[world.version];
      if (!step) throw new Error("SAVE_NO_MIGRATION_" + world.version);
      world = step(world);
    }
    return world;
  }
  function readIndex() {
    try { return JSON.parse(localStorage.getItem(INDEX_KEY)) || []; }
    catch (_) { return []; }
  }
  function writeIndex(list) { localStorage.setItem(INDEX_KEY, JSON.stringify(list)); }
  function upsertIndex(world) {
    const list = readIndex().filter(e => e.code !== world.code);
    list.push({ code: world.code, name: world.pet.name, species: world.pet.species });
    writeIndex(list);
  }
  function validShape(w) {
    return w && typeof w === "object" && w.pet && w.room && w.learn;
  }

  async function list() { return readIndex(); }

  async function load(code) {
    const raw = localStorage.getItem(worldKey(code));
    if (raw == null) return null;
    let world;
    try { world = JSON.parse(raw); } catch (_) { throw new Error("SAVE_CORRUPT"); }
    if (!validShape(world)) throw new Error("SAVE_CORRUPT");
    if (world.version < CURRENT_VERSION) {
      world = migrate(world);
      await set(world);
    }
    return world;
  }

  async function set(world) {
    world.savedAt = Date.now();
    localStorage.setItem(worldKey(world.code), JSON.stringify(world));
    upsertIndex(world);
    return world;
  }

  async function create(world) { return set(world); }

  async function remove(code) {
    localStorage.removeItem(worldKey(code));
    writeIndex(readIndex().filter(e => e.code !== code));
  }

  return {
    get CURRENT_VERSION() { return CURRENT_VERSION; },
    list, load, set, create, remove,
    _migrate: migrate, _migrations: migrations
  };
})();
```

Note: `CURRENT_VERSION` is a getter so the test can override it with `Object.defineProperty`. The closure reads the module-local `CURRENT_VERSION` for real runs.

- [ ] **Step 4: Run tests to verify they pass**

Open `tests.html`. Expected: all save tests `ok`.

- [ ] **Step 5: Commit**

```bash
git add potato-pet/js/save.js potato-pet/js/save.tests.js potato-pet/tests.html
git commit -m "feat: local save/load with index + numbered migrations + corruption guard"
```

---

## Task 4: World generation

**Files:**
- Create: `potato-pet/js/world.js`
- Create: `potato-pet/js/world.tests.js`
- Modify: `potato-pet/tests.html` — add `<script src="js/world.tests.js"></script>`.

**Interfaces:**
- Consumes: `App.rng.*`, `App.save.CURRENT_VERSION`.
- Produces on `App.world`:
  - `SPECIES: string[]` — `["strawberry","broccoli","turtle","cat","frog","donut","carrot","penguin"]`.
  - `THEMES: string[]` — `["meadow","bedroom","space","beach"]`.
  - `STARTERS: string[]` — `["rug","lamp","plant","poster","beanbag"]`.
  - `generateWorld(code: string) -> world` — deterministic from `code`. Shape exactly matches spec §5.1 plus `pet.tint` (integer hue-rotate degrees `0..359`). `pet.name` is `""` (set later during creation). `needs` all `100`. `adoptedAt` and `lastTick` are `Date.now()` at call time (the only non-deterministic fields).

- [ ] **Step 1: Write the failing tests**

`potato-pet/js/world.tests.js`:

```js
window.__pushTests(function worldTests() {
  const a = App.world.generateWorld("K7F-9Q2");
  const b = App.world.generateWorld("K7F-9Q2");
  assertEq("same code -> same species", a.pet.species, b.pet.species);
  assertEq("same code -> same theme", a.room.theme, b.room.theme);
  assertEq("same code -> same tint", a.pet.tint, b.pet.tint);
  assertEq("same code -> same starter", a.room.owned, b.room.owned);

  assert("species is valid", App.world.SPECIES.includes(a.pet.species));
  assert("theme is valid", App.world.THEMES.includes(a.room.theme));
  assert("tint in 0..359", a.pet.tint >= 0 && a.pet.tint <= 359);
  assert("starts with one owned decoration", a.room.owned.length === 1);
  assert("placed starts empty", a.room.placed.length === 0);
  assertEq("needs full", a.pet.needs, { hunger: 100, energy: 100, fun: 100 });
  assertEq("stars zero", a.stars, 0);
  assertEq("name empty", a.pet.name, "");
  assertEq("version matches save", a.version, App.save.CURRENT_VERSION);
  assertEq("factsSeen empty", a.learn.factsSeen, []);
  assertEq("game defaults", a.learn.game, { mathLevel: 1, spellingLevel: 1, bestStreak: 0 });

  // different codes generally differ across a sample
  const species = new Set();
  ["AAA-AAA","BBB-BBB","CCC-CCC","DDD-DDD","EEE-EEE","FFF-FFF"].forEach(
    c => species.add(App.world.generateWorld(c).pet.species));
  assert("codes spread across species", species.size >= 3);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Open `tests.html`. Expected: FAIL — `App.world` undefined.

- [ ] **Step 3: Implement `world.js`**

`potato-pet/js/world.js`:

```js
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
        lastTick: now
      },
      stars: 0,
      room: { theme, owned: [starter], placed: [] },
      learn: { factsSeen: [], game: { mathLevel: 1, spellingLevel: 1, bestStreak: 0 } }
    };
  }
  return { SPECIES, THEMES, STARTERS, generateWorld };
})();
```

- [ ] **Step 4: Run tests to verify they pass**

Open `tests.html`. Expected: all world tests `ok`.

- [ ] **Step 5: Commit**

```bash
git add potato-pet/js/world.js potato-pet/js/world.tests.js potato-pet/tests.html
git commit -m "feat: seeded world generation (species/theme/tint/starter)"
```

---

## Task 5: Needs decay + mood

**Files:**
- Create: `potato-pet/js/state.js`
- Create: `potato-pet/js/state.tests.js`
- Modify: `potato-pet/tests.html` — add `<script src="js/state.tests.js"></script>`.

**Interfaces:**
- Consumes: nothing.
- Produces on `App.state`:
  - `world: world | null` — the live world holder for the running app.
  - `DECAY_PER_DAY = 10`, `NEED_FLOOR = 25`, `HAPPY_THRESHOLD = 60` — constants.
  - `tickNeeds(world, now: number) -> world` — mutates `world.pet.needs` (each `-= (elapsedMs/86400000)*DECAY_PER_DAY`, clamped `>= NEED_FLOOR`), sets `world.pet.lastTick = now`. `elapsed = now - lastTick`; if not `> 0`, treat as `0`. Never raises a need.
  - `deriveMood(world) -> "happy" | "hungry" | "sleepy" | "bored"` — `"happy"` if the lowest of the three needs `>= HAPPY_THRESHOLD`; otherwise the mood of whichever need is lowest (`hunger`→`hungry`, `energy`→`sleepy`, `fun`→`bored`; ties resolve in that order).

- [ ] **Step 1: Write the failing tests**

`potato-pet/js/state.tests.js`:

```js
window.__pushTests(function stateTests() {
  const mk = over => ({ pet: {
    needs: Object.assign({ hunger: 100, energy: 100, fun: 100 }, over || {}),
    lastTick: 0
  }});

  // one full day drops each need by ~10
  let w = mk(); App.state.tickNeeds(w, 86400000);
  assert("~10/day hunger", Math.abs(w.pet.needs.hunger - 90) < 0.001);
  assertEq("lastTick advanced", w.pet.lastTick, 86400000);

  // floor at 25 even after a long absence
  w = mk({ hunger: 30 }); App.state.tickNeeds(w, 86400000 * 30);
  assertEq("hunger floored at 25", w.pet.needs.hunger, 25);
  assert("energy floored at 25", w.pet.needs.energy === 25);

  // negative / zero elapsed -> no change
  w = mk({ hunger: 50 }); w.pet.lastTick = 1000;
  App.state.tickNeeds(w, 500);
  assertEq("clock-back = no decay", w.pet.needs.hunger, 50);
  assertEq("lastTick still moves to now", w.pet.lastTick, 500);

  // mood derivation
  assertEq("all high -> happy", App.state.deriveMood(mk()), "happy");
  assertEq("low hunger -> hungry", App.state.deriveMood(mk({ hunger: 30 })), "hungry");
  assertEq("low energy -> sleepy", App.state.deriveMood(mk({ energy: 26 })), "sleepy");
  assertEq("low fun -> bored", App.state.deriveMood(mk({ fun: 40 })), "bored");
  assertEq("tie hunger vs energy -> hungry",
    App.state.deriveMood(mk({ hunger: 30, energy: 30 })), "hungry");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Open `tests.html`. Expected: FAIL — `App.state` undefined.

- [ ] **Step 3: Implement `state.js`**

`potato-pet/js/state.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Open `tests.html`. Expected: all state tests `ok`.

- [ ] **Step 5: Commit**

```bash
git add potato-pet/js/state.js potato-pet/js/state.tests.js potato-pet/tests.html
git commit -m "feat: gentle needs decay (floor 25) and derived mood"
```

---

## Task 6: Content data + validation helpers

**Files:**
- Create: `potato-pet/js/content.js`
- Create: `potato-pet/js/content.tests.js`
- Modify: `potato-pet/tests.html` — add `<script src="js/content.tests.js"></script>`.

**Interfaces:**
- Consumes: nothing.
- Produces on `App.content`:
  - `greetings: string[]` (≥ 4), `affirmations: string[]` (≥ 12).
  - `moodLines: { happy: string[], hungry: string[], sleepy: string[], bored: string[] }` — each ≥ 3 lines.
  - `facts: Array<{ id: number, text: string, topic: string }>` — ≥ 40, `id` unique, `topic` one of `"animals" | "food" | "space" | "body" | "world"`.
  - `spellingLists: { 1: string[], 2: string[], 3: string[] }` — level → lowercase words, ≥ 12 each, no duplicates within a level.
  - `RUDE_WORDS: string[]` — lowercase substrings to reject in pet names (keep short; e.g. a handful of obvious ones).
  - `validateName(raw: string) -> { ok: boolean, value?: string, reason?: string }` — trims; `ok:false, reason:"length"` if trimmed length `< 1` or `> 16`; `ok:false, reason:"blocked"` if the lowercased trimmed value contains any `RUDE_WORDS` entry; otherwise `ok:true, value:<trimmed>`.

- [ ] **Step 1: Write the failing tests**

`potato-pet/js/content.tests.js`:

```js
window.__pushTests(function contentTests() {
  const c = App.content;
  assert("greetings present", Array.isArray(c.greetings) && c.greetings.length >= 4);
  assert("affirmations present", c.affirmations.length >= 12);
  ["happy","hungry","sleepy","bored"].forEach(m =>
    assert("moodLines." + m + " >= 3", c.moodLines[m] && c.moodLines[m].length >= 3));

  assert("40+ facts", c.facts.length >= 40);
  const ids = c.facts.map(f => f.id);
  assertEq("fact ids unique", ids.length, new Set(ids).size);
  const topics = new Set(["animals","food","space","body","world"]);
  assert("fact topics valid", c.facts.every(f => topics.has(f.topic) && f.text.length > 0));

  [1,2,3].forEach(lvl => {
    const list = c.spellingLists[lvl];
    assert("spelling L" + lvl + " >= 12", list && list.length >= 12);
    assertEq("spelling L" + lvl + " no dupes", list.length, new Set(list).size);
    assert("spelling L" + lvl + " lowercase", list.every(w => w === w.toLowerCase()));
  });

  assertEq("name ok", c.validateName("  Shelly "), { ok: true, value: "Shelly" });
  assertEq("name too long",
    c.validateName("x".repeat(17)), { ok: false, reason: "length" });
  assertEq("name empty", c.validateName("   "), { ok: false, reason: "length" });
  // pick a real entry from RUDE_WORDS so this stays in sync
  const bad = c.RUDE_WORDS[0];
  assertEq("name blocked", c.validateName(bad), { ok: false, reason: "blocked" });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Open `tests.html`. Expected: FAIL — `App.content` undefined.

- [ ] **Step 3: Implement `content.js`**

`potato-pet/js/content.js` — fill the arrays with real, warm, kid-appropriate copy. Structure:

```js
window.App = window.App || {};
App.content = (function () {
  const greetings = [
    "You're back! I did a happy wiggle.",
    "Hi hi hi! I was hoping you'd visit.",
    "There you are! My favourite part of the day.",
    "Yay, it's you! Let's have fun."
  ];
  const affirmations = [
    "Making mistakes means your brain is stretching!",
    "You tried something tricky. That's real bravery.",
    "Slow is still forward. I'm proud of you.",
    "Your kindness makes this room brighter.",
    "You figured that out! See what practice does?",
    "It's okay to find things hard. Hard is how we grow.",
    "You showed up today. That matters more than perfect.",
    "I like how you kept going.",
    "Rest is allowed. You've earned a comfy moment.",
    "Being curious is a superpower, and you've got it.",
    "One tiny step counts as a step.",
    "You're a good friend to me."
  ];
  const moodLines = {
    happy:  ["I feel great!", "Best day. Ten out of ten.", "Everything is cosy right now."],
    hungry: ["My tummy did a little rumble.", "Snack o'clock, maybe?", "I'd nibble something tasty."],
    sleepy: ["My eyelids are so heavy...", "A nap would be lovely.", "Yawwwn. Bedtime soon?"],
    bored:  ["Wanna play a game?", "Let's do something fun!", "I've got the wiggles, help!"]
  };
  const facts = [
    { id: 1, text: "A group of flamingos is called a flamboyance.", topic: "animals" },
    { id: 2, text: "Honey never spoils — jars in ancient tombs were still edible.", topic: "food" },
    { id: 3, text: "A day on Venus is longer than its year.", topic: "space" },
    { id: 4, text: "Your body has enough carbon to make about 900 pencils.", topic: "body" },
    { id: 5, text: "The Sahara desert sometimes gets snow.", topic: "world" }
    // ... continue to at least id: 40, spread across all five topics ...
  ];
  const spellingLists = {
    1: ["cat","dog","sun","tree","book","milk","jump","rain","fish","hand","frog","cake"],
    2: ["planet","dragon","garden","pencil","window","yellow","friend","school","bridge","orange","rocket","silver"],
    3: ["because","through","different","favourite","tomorrow","separate","sentence","important","beautiful","dangerous","calendar","necessary"]
  };
  const RUDE_WORDS = ["butt", "poop", "stupid", "hate", "dumb"];

  function validateName(raw) {
    const value = String(raw == null ? "" : raw).trim();
    if (value.length < 1 || value.length > 16) return { ok: false, reason: "length" };
    const low = value.toLowerCase();
    if (RUDE_WORDS.some(w => low.includes(w))) return { ok: false, reason: "blocked" };
    return { ok: true, value };
  }

  return { greetings, affirmations, moodLines, facts, spellingLists, RUDE_WORDS, validateName };
})();
```

**Implementer note:** the `facts` array above shows 5 entries — you must extend it to **at least 40**, with each of the five topics appearing several times. Keep each fact to one or two short sentences a 10-year-old finds delightful.

- [ ] **Step 4: Run tests to verify they pass**

Open `tests.html`. Expected: all content tests `ok` (will fail on `40+ facts` until you extend the array — do that, then re-run).

- [ ] **Step 5: Commit**

```bash
git add potato-pet/js/content.js potato-pet/js/content.tests.js potato-pet/tests.html
git commit -m "feat: content data (affirmations, mood lines, 40+ facts, spelling lists) + name validation"
```

---

## Task 7: Mini-game logic (Math Dash + Spelling Pop)

**Files:**
- Create: `potato-pet/js/games.js`
- Create: `potato-pet/js/games.tests.js`
- Modify: `potato-pet/tests.html` — add `<script src="js/games.tests.js"></script>`.

**Interfaces:**
- Consumes: `App.rng.*`, `App.content.spellingLists`.
- Produces on `App.games`:
  - `QUESTIONS_PER_ROUND = 5`.
  - `makeMathQuestion(level: 1|2|3|4, rand: () => number) -> { prompt: string, answer: number, options: number[] }` — `options` length 4, contains `answer` exactly once, all integers, no duplicates. Level ranges: **1** add/subtract within 20 (no negative results); **2** add/subtract within 100; **3** times tables (2–12 × 2–12); **4** mixed, includes exact division.
  - `makeSpellingQuestion(level: 1|2|3, rand: () => number) -> { word: string, options: string[] }` — `options` length 4, contains `word` exactly once, the other three are plausible misspellings of `word`, no duplicates.
  - `scoreRound(correctCount: number, bestStreakInRound: number) -> number` — **STUB for the maintainer** (see spec §16). Ship a documented placeholder: `return correctCount * 2 + bestStreakInRound;`.
  - `shouldOfferLevelUp(history: Array<{correct: number, total: number}>) -> boolean` — **STUB for the maintainer**. Ship a placeholder: `true` if the last two entries each have `correct/total >= 0.8`, else `false`.
  - `runRound(kind: "math" | "spelling", level, rand) -> { questions: Array<question> }` — builds `QUESTIONS_PER_ROUND` questions via the matching `make…` function.

- [ ] **Step 1: Write the failing tests**

`potato-pet/js/games.tests.js`:

```js
window.__pushTests(function gamesTests() {
  const rand = App.rng.mulberry32(99);

  for (const level of [1,2,3,4]) {
    for (let i = 0; i < 40; i++) {
      const q = App.games.makeMathQuestion(level, rand);
      assert("math L"+level+" 4 options", q.options.length === 4);
      assert("math L"+level+" answer present once",
        q.options.filter(o => o === q.answer).length === 1);
      assert("math L"+level+" options unique", new Set(q.options).size === 4);
      assert("math L"+level+" ints", q.options.every(Number.isInteger));
      if (level === 1) assert("math L1 no negative answer", q.answer >= 0 && q.answer <= 20);
    }
  }

  for (const level of [1,2,3]) {
    for (let i = 0; i < 30; i++) {
      const q = App.games.makeSpellingQuestion(level, rand);
      assert("spell L"+level+" 4 options", q.options.length === 4);
      assert("spell L"+level+" word present once",
        q.options.filter(o => o === q.word).length === 1);
      assert("spell L"+level+" options unique", new Set(q.options).size === 4);
      assert("spell L"+level+" word is real",
        App.content.spellingLists[level].includes(q.word));
    }
  }

  const round = App.games.runRound("math", 2, App.rng.mulberry32(7));
  assertEq("round has 5 questions", round.questions.length, App.games.QUESTIONS_PER_ROUND);

  // stubs behave as documented
  assert("scoreRound placeholder", App.games.scoreRound(5, 5) === 15);
  assertEq("levelUp needs two strong rounds",
    App.games.shouldOfferLevelUp([{correct:4,total:5},{correct:5,total:5}]), true);
  assertEq("levelUp false on weak round",
    App.games.shouldOfferLevelUp([{correct:2,total:5},{correct:5,total:5}]), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Open `tests.html`. Expected: FAIL — `App.games` undefined.

- [ ] **Step 3: Implement `games.js`**

`potato-pet/js/games.js`:

```js
window.App = window.App || {};
App.games = (function () {
  const QUESTIONS_PER_ROUND = 5;

  function distinctOptions(answer, rand, spread, count) {
    const opts = new Set([answer]);
    let guard = 0;
    while (opts.size < count && guard++ < 200) {
      const delta = App.rng.int(rand, 1, spread) * (rand() < 0.5 ? -1 : 1);
      const cand = answer + delta;
      if (cand >= 0) opts.add(cand);
    }
    while (opts.size < count) opts.add(answer + opts.size); // last-resort fill
    return shuffle([...opts], rand);
  }
  function shuffle(arr, rand) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function makeMathQuestion(level, rand) {
    let a, b, op, answer;
    if (level === 1) {
      a = App.rng.int(rand, 0, 20); b = App.rng.int(rand, 0, a);
      op = rand() < 0.5 ? "+" : "-";
      if (op === "+") { b = App.rng.int(rand, 0, 20 - a); answer = a + b; }
      else answer = a - b;
    } else if (level === 2) {
      a = App.rng.int(rand, 0, 99); op = rand() < 0.5 ? "+" : "-";
      if (op === "+") { b = App.rng.int(rand, 0, 100 - a); answer = a + b; }
      else { b = App.rng.int(rand, 0, a); answer = a - b; }
    } else if (level === 3) {
      a = App.rng.int(rand, 2, 12); b = App.rng.int(rand, 2, 12);
      op = "×"; answer = a * b;
    } else {
      const kind = App.rng.int(rand, 0, 2);
      if (kind === 0) { a = App.rng.int(rand, 2, 12); b = App.rng.int(rand, 2, 12); op = "×"; answer = a * b; }
      else if (kind === 1) { b = App.rng.int(rand, 2, 12); answer = App.rng.int(rand, 2, 12); a = b * answer; op = "÷"; }
      else { a = App.rng.int(rand, 20, 99); b = App.rng.int(rand, 0, a); op = "-"; answer = a - b; }
    }
    const spread = level >= 3 ? 10 : 5;
    return { prompt: a + " " + op + " " + b + " = ?", answer, options: distinctOptions(answer, rand, spread, 4) };
  }

  function misspell(word, rand) {
    const chars = word.split("");
    const mode = App.rng.int(rand, 0, 2);
    const i = App.rng.int(rand, 0, chars.length - 1);
    if (mode === 0 && chars.length > 3) chars.splice(i, 1);                 // drop a letter
    else if (mode === 1) chars.splice(i, 0, chars[i] || "e");              // double a letter
    else {                                                                 // swap a vowel
      const vowels = "aeiou".replace(chars[i] || "", "");
      chars[i] = vowels[App.rng.int(rand, 0, vowels.length - 1)];
    }
    const out = chars.join("");
    return out === word ? word + "e" : out;
  }
  function makeSpellingQuestion(level, rand) {
    const list = App.content.spellingLists[level];
    const word = App.rng.pick(rand, list);
    const opts = new Set([word]);
    let guard = 0;
    while (opts.size < 4 && guard++ < 200) opts.add(misspell(word, rand));
    while (opts.size < 4) opts.add(word + "x".repeat(opts.size));
    return { word, options: shuffle([...opts], rand) };
  }

  function runRound(kind, level, rand) {
    const make = kind === "math" ? makeMathQuestion : makeSpellingQuestion;
    const questions = [];
    for (let i = 0; i < QUESTIONS_PER_ROUND; i++) questions.push(make(level, rand));
    return { questions };
  }

  // --- STUBS: maintainer tunes these (spec §16) ---
  function scoreRound(correctCount, bestStreakInRound) {
    return correctCount * 2 + bestStreakInRound;
  }
  function shouldOfferLevelUp(history) {
    if (history.length < 2) return false;
    return history.slice(-2).every(h => h.total > 0 && h.correct / h.total >= 0.8);
  }

  return {
    QUESTIONS_PER_ROUND, makeMathQuestion, makeSpellingQuestion,
    runRound, scoreRound, shouldOfferLevelUp
  };
})();
```

- [ ] **Step 4: Run tests to verify they pass**

Open `tests.html`. Expected: all games tests `ok`.

- [ ] **Step 5: Commit**

```bash
git add potato-pet/js/games.js potato-pet/js/games.tests.js potato-pet/tests.html
git commit -m "feat: mini-game question generators + tunable scoring stubs"
```

---

## Task 8: Facts logic

**Files:**
- Create: `potato-pet/js/facts.js`
- Create: `potato-pet/js/facts.tests.js`
- Modify: `potato-pet/tests.html` — add `<script src="js/facts.tests.js"></script>`.

**Interfaces:**
- Consumes: `App.content.facts`, `App.rng.hashCode`.
- Produces on `App.facts`:
  - `tellSomething(world) -> { id, text, topic }` — returns a fact whose `id` is not in `world.learn.factsSeen`; appends that `id` to `world.learn.factsSeen`; when every fact has been seen, clears `factsSeen` first (reshuffle) then returns one. Does NOT save — caller persists.
  - `factOfTheDay(date = new Date()) -> { id, text, topic }` — deterministic for a given calendar day: index = `hashCode("YYYY-MM-DD") % facts.length`. Does not touch `factsSeen`.

- [ ] **Step 1: Write the failing tests**

`potato-pet/js/facts.tests.js`:

```js
window.__pushTests(function factsTests() {
  const total = App.content.facts.length;
  const world = { learn: { factsSeen: [] } };
  const seen = new Set();
  for (let i = 0; i < total; i++) {
    const f = App.facts.tellSomething(world);
    assert("fact not repeated before exhaustion", !seen.has(f.id));
    seen.add(f.id);
  }
  assertEq("all facts consumed", seen.size, total);
  // next call wraps: factsSeen cleared then one returned
  const wrap = App.facts.tellSomething(world);
  assert("wrap returns a fact", wrap && typeof wrap.id === "number");
  assertEq("factsSeen reset to just the wrapped one", world.learn.factsSeen, [wrap.id]);

  const d1 = App.facts.factOfTheDay(new Date("2026-08-27T09:00:00"));
  const d1b = App.facts.factOfTheDay(new Date("2026-08-27T22:00:00"));
  assertEq("fact of the day stable within a day", d1.id, d1b.id);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Open `tests.html`. Expected: FAIL — `App.facts` undefined.

- [ ] **Step 3: Implement `facts.js`**

`potato-pet/js/facts.js`:

```js
window.App = window.App || {};
App.facts = (function () {
  function tellSomething(world) {
    const all = App.content.facts;
    let unseen = all.filter(f => !world.learn.factsSeen.includes(f.id));
    if (unseen.length === 0) { world.learn.factsSeen = []; unseen = all.slice(); }
    const chosen = unseen[Math.floor(Math.random() * unseen.length)];
    world.learn.factsSeen.push(chosen.id);
    return chosen;
  }
  function factOfTheDay(date) {
    const d = date || new Date();
    const key = d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
    const all = App.content.facts;
    return all[App.rng.hashCode(key) % all.length];
  }
  return { tellSomething, factOfTheDay };
})();
```

- [ ] **Step 4: Run tests to verify they pass**

Open `tests.html`. Expected: all facts tests `ok`.

- [ ] **Step 5: Commit**

```bash
git add potato-pet/js/facts.js potato-pet/js/facts.tests.js potato-pet/tests.html
git commit -m "feat: no-repeat fact picker + stable fact-of-the-day"
```

---

## Task 9: Sprite manifest + pet rendering

**Files:**
- Create: `potato-pet/js/sprites.js`
- Create: `potato-pet/js/pet.js`
- Modify: `potato-pet/styles.css` — add pet + speech-bubble styles.

**Interfaces:**
- Consumes: `App.world.SPECIES`, `App.state.deriveMood`.
- Produces on `App.sprites`:
  - `manifest: { [species: string]: { placeholderColor: string, anims: { idle, happy, eat, sleep, peek } } }` — Phase 1 has no image sheets; `anims` values are objects `{ frames: number, fps: number }` used only for timing. Every species in `App.world.SPECIES` has an entry. Missing animation name → callers fall back to `"idle"`.
  - `animFor(species, name) -> { frames, fps }` — returns the named anim or the `idle` anim if absent.
- Produces on `App.pet`:
  - `mount(container: HTMLElement, world) -> void` — renders a `.pet` element (Phase 1: a coloured rounded block, `filter: hue-rotate(<tint>deg)`, sized ~120px, `.pixel`) plus an empty `.speech` bubble, into `container`.
  - `render(mood: string) -> void` — swaps a `data-mood` attribute on the `.pet` element and restarts a simple CSS bob/wiggle keyed to the mood (no image stepping in Phase 1).
  - `playAnim(name: string, done?: () => void) -> void` — adds a one-shot CSS class (`anim-eat`, `anim-sleep`, `anim-peek`), removes it and calls `done` after `frames/fps` seconds (min 400ms).
  - `speak(text: string, ms = 3500) -> void` — shows `text` in `.speech` for `ms`, then hides it. Calling again resets the timer.

- [ ] **Step 1: Implement `sprites.js`**

`potato-pet/js/sprites.js`:

```js
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
```

- [ ] **Step 2: Implement `pet.js`**

`potato-pet/js/pet.js`:

```js
window.App = window.App || {};
App.pet = (function () {
  let el = null, bubble = null, bubbleTimer = null, world = null;

  function mount(container, w) {
    world = w;
    container.innerHTML =
      '<div class="stage">' +
        '<div class="speech" hidden></div>' +
        '<div class="pet pixel" data-mood="happy"></div>' +
      '</div>';
    el = container.querySelector(".pet");
    bubble = container.querySelector(".speech");
    const m = App.sprites.manifest[world.pet.species] || { placeholderColor: "#999" };
    el.style.background = m.placeholderColor;
    el.style.filter = "hue-rotate(" + (world.pet.tint || 0) + "deg)";
  }
  function render(mood) {
    if (el) el.setAttribute("data-mood", mood);
  }
  function playAnim(name, done) {
    if (!el) { if (done) done(); return; }
    const a = App.sprites.animFor(world.pet.species, name);
    const ms = Math.max(400, (a.frames / a.fps) * 1000);
    const cls = "anim-" + name;
    el.classList.add(cls);
    setTimeout(() => { el.classList.remove(cls); if (done) done(); }, ms);
  }
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

- [ ] **Step 3: Add pet styles to `styles.css`**

```css
.stage { position: relative; height: 260px; display: grid; place-items: center; }
.pet {
  width: 120px; height: 120px; border-radius: 24px;
  animation: bob 1.6s ease-in-out infinite;
}
.pet[data-mood="sleepy"] { animation-duration: 3s; opacity: .85; }
.pet[data-mood="bored"]  { animation-name: wiggle; }
.pet.anim-eat  { animation: chomp .4s steps(2) 3; }
.pet.anim-peek { opacity: .5; }
.speech {
  position: absolute; top: 8px; max-width: 80%; background: #fff;
  border: 2px solid #3b2f2f; border-radius: 12px; padding: 8px 12px; font-size: 14px;
}
.speech[hidden] { display: none; }
@keyframes bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-10px) } }
@keyframes wiggle { 0%,100% { transform: rotate(-4deg) } 50% { transform: rotate(4deg) } }
@keyframes chomp { 0%,100% { transform: scale(1) } 50% { transform: scale(.9) } }
```

- [ ] **Step 4: Manual check**

In `tests.html` there is nothing to add (rendering isn't unit-tested). Instead, temporarily append to `main.js`'s `DOMContentLoaded` handler:

```js
// TEMP smoke test — remove after Task 12
const w = App.world.generateWorld("K7F-9Q2"); w.pet.name = "Testy";
App.pet.mount(document.getElementById("app"), w);
App.pet.render(App.state.deriveMood(w));
App.pet.speak("Hi! I'm a placeholder block.");
setTimeout(() => App.pet.playAnim("eat"), 1500);
```

Open `index.html`. Expected: a coloured rounded block bobbing, a speech bubble that disappears after ~3.5s, a brief "chomp" scale animation at 1.5s. Remove the TEMP block before committing.

- [ ] **Step 5: Commit**

```bash
git add potato-pet/js/sprites.js potato-pet/js/pet.js potato-pet/styles.css potato-pet/js/main.js
git commit -m "feat: sprite manifest + placeholder pet rendering, speech bubble, one-shot anims"
```

---

## Task 10: Interactions (feed, bed, hide-and-seek)

**Files:**
- Create: `potato-pet/js/interactions.js`
- Create: `potato-pet/js/interactions.tests.js`
- Modify: `potato-pet/tests.html` — add `<script src="js/interactions.tests.js"></script>`.

**Interfaces:**
- Consumes: `App.pet.playAnim`, `App.pet.speak`, `App.content.moodLines`, `App.rng.*`.
- Produces on `App.interactions` (all take the live `world`, mutate it, and return a small result; the caller persists + re-renders):
  - `FOODS: string[]` — cosmetic food ids, e.g. `["apple","cookie","carrot","fish","cake"]`.
  - `feed(world, foodId) -> { starsGained: 1 }` — `world.pet.needs.hunger = min(100, hunger + 30)`; `world.stars += 1`; plays `eat`; speaks a happy line.
  - `canSleep(world) -> boolean` — `world.pet.needs.energy <= 80`.
  - `putToBed(world) -> { ok: boolean, starsGained: number }` — if `!canSleep` returns `{ ok: false, starsGained: 0 }`; else `energy = 100`, `stars += 1`, plays `sleep`, returns `{ ok: true, starsGained: 1 }`.
  - `SPOT_COUNT = 8`.
  - `newHideRound(world, seed?) -> { spots: number[], hidingSpot: number }` — `spots` is `[0..7]`; `hidingSpot` chosen via a seeded RNG (seed defaults to `Date.now()`), value `0..7`.
  - `guessSpot(round, world, guess) -> { found: boolean, starsGained: number, funGained: number }` — if `guess === round.hidingSpot`: `world.pet.needs.fun = min(100, fun + 25)`, `world.stars += 4`, returns `{ found: true, starsGained: 4, funGained: 25 }`; else `{ found: false, starsGained: 0, funGained: 0 }` (no penalty, round stays open for another guess).

- [ ] **Step 1: Write the failing tests**

`potato-pet/js/interactions.tests.js`:

```js
window.__pushTests(function interactionsTests() {
  const mk = () => ({ pet: { species: "turtle", needs: { hunger: 50, energy: 50, fun: 50 } }, stars: 0 });

  let w = mk();
  const r1 = App.interactions.feed(w, "apple");
  assertEq("feed +30 hunger", w.pet.needs.hunger, 80);
  assertEq("feed +1 star", w.stars, 1);
  assertEq("feed result", r1, { starsGained: 1 });
  w.pet.needs.hunger = 90; App.interactions.feed(w, "cake");
  assertEq("feed caps at 100", w.pet.needs.hunger, 100);

  w = mk();
  assertEq("canSleep when tired", App.interactions.canSleep(w), true);
  w.pet.needs.energy = 90;
  assertEq("cannot sleep when fresh", App.interactions.canSleep(w), false);
  assertEq("putToBed refused when fresh", App.interactions.putToBed(w), { ok: false, starsGained: 0 });
  w.pet.needs.energy = 40;
  const rb = App.interactions.putToBed(w);
  assertEq("putToBed refills energy", w.pet.needs.energy, 100);
  assertEq("putToBed result", rb, { ok: true, starsGained: 1 });

  w = mk();
  const round = App.interactions.newHideRound(w, 12345);
  assert("8 spots", round.spots.length === App.interactions.SPOT_COUNT);
  assert("hidingSpot in range", round.hidingSpot >= 0 && round.hidingSpot < 8);
  const wrongGuess = (round.hidingSpot + 1) % 8;
  const miss = App.interactions.guessSpot(round, w, wrongGuess);
  assertEq("miss has no penalty", miss, { found: false, starsGained: 0, funGained: 0 });
  assertEq("miss doesn't change stars", w.stars, 0);
  const hit = App.interactions.guessSpot(round, w, round.hidingSpot);
  assertEq("hit result", hit, { found: true, starsGained: 4, funGained: 25 });
  assertEq("hit +25 fun", w.pet.needs.fun, 75);
  assertEq("hit +4 stars", w.stars, 4);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Open `tests.html`. Expected: FAIL — `App.interactions` undefined.

- [ ] **Step 3: Implement `interactions.js`**

`potato-pet/js/interactions.js`:

```js
window.App = window.App || {};
App.interactions = (function () {
  const FOODS = ["apple", "cookie", "carrot", "fish", "cake"];
  const SPOT_COUNT = 8;
  const clamp100 = v => Math.min(100, v);

  function happyLine() {
    const lines = App.content.moodLines.happy;
    return lines[Math.floor(Math.random() * lines.length)];
  }

  function feed(world, foodId) {
    world.pet.needs.hunger = clamp100(world.pet.needs.hunger + 30);
    world.stars += 1;
    if (App.pet) { App.pet.playAnim("eat"); App.pet.speak(happyLine()); }
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

  return { FOODS, SPOT_COUNT, feed, canSleep, putToBed, newHideRound, guessSpot };
})();
```

- [ ] **Step 4: Run tests to verify they pass**

Open `tests.html`. Expected: all interactions tests `ok`.

- [ ] **Step 5: Commit**

```bash
git add potato-pet/js/interactions.js potato-pet/js/interactions.tests.js potato-pet/tests.html
git commit -m "feat: feed / bed / hide-and-seek interaction logic (8 spots, no penalties)"
```

---

## Task 11: Room, Star Shop, place mode

**Files:**
- Create: `potato-pet/js/room.js`
- Create: `potato-pet/js/room.tests.js`
- Modify: `potato-pet/tests.html` — add `<script src="js/room.tests.js"></script>`.
- Modify: `potato-pet/styles.css` — add `.room` grid styles.

**Interfaces:**
- Consumes: nothing (pure logic + DOM rendering).
- Produces on `App.room`:
  - `COLS = 12`, `ROWS = 8`.
  - `CATALOG: Array<{ id: string, label: string, price: number, kind: "furniture"|"wall"|"floor"|"toy" }>` — ≥ 10 items, ids include the five `App.world.STARTERS`, whose price may be anything (they start owned).
  - `priceOf(id) -> number` — from `CATALOG`, or `Infinity` if unknown.
  - `canBuy(world, id) -> boolean` — `!world.room.owned.includes(id) && world.stars >= priceOf(id)`.
  - `buy(world, id) -> { ok: boolean }` — if `canBuy`: `world.stars -= priceOf(id)`, `world.room.owned.push(id)`, `{ ok: true }`; else `{ ok: false }`.
  - `cellOccupied(world, x, y) -> boolean`.
  - `place(world, id, x, y) -> { ok: boolean, reason?: string }` — fails (`reason`) if `id` not owned (`"not-owned"`), `x/y` out of the 12×8 grid (`"out-of-bounds"`), or the cell is taken (`"occupied"`). On success pushes `{ item: id, x, y }` to `world.room.placed` (removing any prior placement of the same `id` — an item exists once).
  - `pickUp(world, id) -> void` — removes `id` from `world.room.placed`.
  - `renderRoom(container, world, opts) -> void` — draws the 12×8 grid with theme classes and placed items; if `opts.placeMode` is set, clicking an empty cell calls `opts.onPlaceCell(x, y)`.

- [ ] **Step 1: Write the failing tests**

`potato-pet/js/room.tests.js`:

```js
window.__pushTests(function roomTests() {
  const mk = (stars) => ({ stars: stars, room: { theme: "meadow", owned: ["rug"], placed: [] } });

  assert("catalog >= 10", App.room.CATALOG.length >= 10);
  App.world.STARTERS.forEach(s =>
    assert("starter " + s + " in catalog", App.room.CATALOG.some(c => c.id === s)));

  const cheap = App.room.CATALOG.find(c => !App.world.STARTERS.includes(c.id));
  let w = mk(cheap.price);
  assertEq("canBuy with enough stars", App.room.canBuy(w, cheap.id), true);
  assertEq("buy succeeds", App.room.buy(w, cheap.id), { ok: true });
  assertEq("stars deducted", w.stars, 0);
  assert("now owned", w.room.owned.includes(cheap.id));
  assertEq("cannot rebuy", App.room.canBuy(w, cheap.id), false);
  assertEq("buy fails when broke", App.room.buy(w, cheap.id), { ok: false });

  w = mk(0);
  assertEq("place needs ownership",
    App.room.place(w, "lamp", 0, 0), { ok: false, reason: "not-owned" });
  assertEq("place in bounds ok", App.room.place(w, "rug", 3, 3), { ok: true });
  assertEq("cell now occupied", App.room.cellOccupied(w, 3, 3), true);
  assertEq("out of bounds rejected",
    App.room.place(w, "rug", 12, 0), { ok: false, reason: "out-of-bounds" });
  // moving the same item: only one placement exists
  App.room.place(w, "rug", 5, 5);
  assertEq("item placed once", w.room.placed.filter(p => p.item === "rug").length, 1);
  assertEq("old cell freed", App.room.cellOccupied(w, 3, 3), false);
  // occupied by a different item
  w.room.owned.push("lamp");
  App.room.place(w, "lamp", 6, 6);
  assertEq("occupied cell rejected",
    App.room.place(w, "rug", 6, 6), { ok: false, reason: "occupied" });
  App.room.pickUp(w, "rug");
  assertEq("pickUp removes placement", w.room.placed.some(p => p.item === "rug"), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Open `tests.html`. Expected: FAIL — `App.room` undefined.

- [ ] **Step 3: Implement `room.js`**

`potato-pet/js/room.js`:

```js
window.App = window.App || {};
App.room = (function () {
  const COLS = 12, ROWS = 8;
  const CATALOG = [
    { id: "rug",     label: "Cosy Rug",      price: 0,  kind: "floor" },
    { id: "lamp",    label: "Warm Lamp",     price: 0,  kind: "furniture" },
    { id: "plant",   label: "Leafy Plant",   price: 0,  kind: "furniture" },
    { id: "poster",  label: "Fun Poster",    price: 0,  kind: "wall" },
    { id: "beanbag", label: "Squishy Beanbag", price: 0, kind: "furniture" },
    { id: "bookshelf", label: "Bookshelf",   price: 12, kind: "furniture" },
    { id: "window",  label: "Sunny Window",  price: 15, kind: "wall" },
    { id: "ball",    label: "Bouncy Ball",   price: 6,  kind: "toy" },
    { id: "blocks",  label: "Building Blocks", price: 8, kind: "toy" },
    { id: "clock",   label: "Tick-Tock Clock", price: 10, kind: "wall" },
    { id: "table",   label: "Little Table",  price: 14, kind: "furniture" },
    { id: "cushion", label: "Star Cushion",  price: 5,  kind: "floor" }
  ];
  const byId = id => CATALOG.find(c => c.id === id);
  const priceOf = id => { const c = byId(id); return c ? c.price : Infinity; };
  const canBuy = (world, id) => !world.room.owned.includes(id) && world.stars >= priceOf(id);
  function buy(world, id) {
    if (!canBuy(world, id)) return { ok: false };
    world.stars -= priceOf(id);
    world.room.owned.push(id);
    return { ok: true };
  }
  const cellOccupied = (world, x, y) => world.room.placed.some(p => p.x === x && p.y === y);
  function place(world, id, x, y) {
    if (!world.room.owned.includes(id)) return { ok: false, reason: "not-owned" };
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return { ok: false, reason: "out-of-bounds" };
    if (world.room.placed.some(p => p.x === x && p.y === y && p.item !== id))
      return { ok: false, reason: "occupied" };
    world.room.placed = world.room.placed.filter(p => p.item !== id);
    world.room.placed.push({ item: id, x, y });
    return { ok: true };
  }
  function pickUp(world, id) {
    world.room.placed = world.room.placed.filter(p => p.item !== id);
  }
  function renderRoom(container, world, opts) {
    opts = opts || {};
    const cells = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const here = world.room.placed.find(p => p.x === x && p.y === y);
      cells.push(
        '<button class="cell" data-x="' + x + '" data-y="' + y + '">' +
        (here ? '<span class="deco" data-item="' + here.item + '">' +
                (byId(here.item) ? byId(here.item).label[0] : "?") + '</span>' : '') +
        '</button>');
    }
    container.innerHTML = '<div class="room theme-' + world.room.theme + '">' + cells.join("") + '</div>';
    if (opts.placeMode && opts.onPlaceCell) {
      container.querySelectorAll(".cell").forEach(btn => btn.addEventListener("click", () => {
        opts.onPlaceCell(+btn.dataset.x, +btn.dataset.y);
      }));
    }
  }
  return { COLS, ROWS, CATALOG, priceOf, canBuy, buy, cellOccupied, place, pickUp, renderRoom };
})();
```

- [ ] **Step 4: Add room styles to `styles.css`**

```css
.room {
  display: grid; grid-template-columns: repeat(12, 1fr); gap: 2px;
  background: #cd8c5c; padding: 6px; border-radius: 10px;
}
.room.theme-space   { background: #2a2350; }
.room.theme-beach   { background: #e8d6a0; }
.room.theme-bedroom { background: #b98cc0; }
.cell {
  aspect-ratio: 1; padding: 0; border-radius: 4px; border: 1px solid rgba(0,0,0,.15);
  background: rgba(255,255,255,.35); display: grid; place-items: center; font-size: 12px;
}
.deco { font-weight: 700; }
```

- [ ] **Step 5: Run tests to verify they pass**

Open `tests.html`. Expected: all room tests `ok`.

- [ ] **Step 6: Commit**

```bash
git add potato-pet/js/room.js potato-pet/js/room.tests.js potato-pet/tests.html potato-pet/styles.css
git commit -m "feat: room grid, star shop economy, and place/pick-up logic"
```

---

## Task 12: Start screen + creation flow + reroll

**Files:**
- Create: `potato-pet/js/startscreen.js`
- Modify: `potato-pet/styles.css` — add start-screen styles.

**Interfaces:**
- Consumes: `App.world.generateWorld`, `App.save.list/load/create`, `App.content.validateName`.
- Produces on `App.startscreen`:
  - `ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"`.
  - `randomCode() -> string` — 6 chars from `ALPHABET`, returned grouped `"XXX-XXX"`. (Phase 2 replaces the body with a `POST /world` call; signature stays.)
  - `render(container, { onReady }) -> void` — draws either the returning-player picker (cards from `App.save.list()` + an "Enter a code" field + "Make a new pet") or, on an empty device, goes straight to creation. `onReady(world)` is called once a world is chosen/created and named — the caller then boots the game with it.
  - Internal creation flow: generate code → preview (`generateWorld` → show species/theme/tint block) → **Reroll** (new code, new preview, unlimited) → **Keep** → name input (`validateName`, show `reason` inline) → `App.save.create(world)` → show the code big with "Write this down!" → `onReady(world)`.

- [ ] **Step 1: Implement `startscreen.js`**

`potato-pet/js/startscreen.js`:

```js
window.App = window.App || {};
App.startscreen = (function () {
  const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

  function randomCode() {
    let s = "";
    for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    return s.slice(0, 3) + "-" + s.slice(3);
  }

  async function render(container, { onReady }) {
    const saves = await App.save.list();
    if (saves.length === 0) return startCreation(container, onReady);

    container.innerHTML =
      '<h1>Potato Pet</h1><h2>Who\'s playing?</h2>' +
      '<div class="cards">' + saves.map(s =>
        '<button class="card" data-code="' + s.code + '">' +
        (s.name || "(unnamed)") + '<br><small>' + s.species + ' · ' + s.code + '</small></button>'
      ).join("") + '</div>' +
      '<p><input id="codein" placeholder="ABC-DEF" maxlength="7"> ' +
      '<button id="entercode">Enter a code</button></p>' +
      '<p><button id="makenew">Make a new pet</button></p>' +
      '<p><a href="tests.html">(logic tests)</a></p>';

    container.querySelectorAll(".card").forEach(b => b.addEventListener("click", async () => {
      const world = await safeLoad(b.dataset.code);
      if (world) onReady(world);
    }));
    container.querySelector("#entercode").addEventListener("click", async () => {
      const code = container.querySelector("#codein").value.trim().toUpperCase();
      if (!/^[A-Z0-9]{3}-?[A-Z0-9]{3}$/.test(code)) return alert("That code doesn't look right.");
      const norm = code.length === 6 ? code.slice(0,3) + "-" + code.slice(3) : code;
      let world = await safeLoad(norm);
      if (!world) { world = App.world.generateWorld(norm); world.pet.name = "Friend"; await App.save.create(world); }
      onReady(world);
    });
    container.querySelector("#makenew").addEventListener("click", () => startCreation(container, onReady));
  }

  async function safeLoad(code) {
    try { return await App.save.load(code); }
    catch (e) {
      if (String(e.message).includes("SAVE_CORRUPT")) {
        if (confirm("We couldn't read that pet. Start a fresh one for this code?")) {
          const w = App.world.generateWorld(code); w.pet.name = "Friend"; await App.save.create(w); return w;
        }
        return null;
      }
      throw e;
    }
  }

  function startCreation(container, onReady) {
    let code = randomCode();
    function paint() {
      const preview = App.world.generateWorld(code);
      const col = (App.sprites.manifest[preview.pet.species] || {}).placeholderColor || "#999";
      container.innerHTML =
        '<h1>Meet your new pet!</h1>' +
        '<div class="preview pixel" style="background:' + col +
          ';filter:hue-rotate(' + preview.pet.tint + 'deg)"></div>' +
        '<p>' + preview.pet.species + ' in a ' + preview.room.theme + ' room</p>' +
        '<p><strong>' + code + '</strong></p>' +
        '<p><button id="reroll">Reroll</button> <button id="keep">Keep this one</button></p>';
      container.querySelector("#reroll").addEventListener("click", () => { code = randomCode(); paint(); });
      container.querySelector("#keep").addEventListener("click", () => nameStep(container, code, onReady));
    }
    paint();
  }

  function nameStep(container, code, onReady) {
    container.innerHTML =
      '<h1>Name your pet</h1>' +
      '<p><input id="name" maxlength="16" placeholder="Type a name"></p>' +
      '<p id="nameerr" class="err" hidden></p>' +
      '<p><button id="confirm">That\'s the one!</button></p>';
    container.querySelector("#confirm").addEventListener("click", async () => {
      const res = App.content.validateName(container.querySelector("#name").value);
      const err = container.querySelector("#nameerr");
      if (!res.ok) {
        err.hidden = false;
        err.textContent = res.reason === "length"
          ? "Please use 1 to 16 letters." : "Let's pick a kinder name.";
        return;
      }
      const world = App.world.generateWorld(code);
      world.pet.name = res.value;
      await App.save.create(world);
      container.innerHTML =
        '<h1>All set!</h1><p>Your pet\'s code is:</p>' +
        '<p class="bigcode">' + code + '</p>' +
        '<p><strong>Write this down!</strong> You\'ll need it to visit ' + res.value + ' on another device later.</p>' +
        '<p><button id="go">Play</button></p>';
      container.querySelector("#go").addEventListener("click", () => onReady(world));
    });
  }

  return { ALPHABET, randomCode, render };
})();
```

- [ ] **Step 2: Add start-screen styles to `styles.css`**

```css
.cards { display: flex; flex-wrap: wrap; gap: 8px; }
.card { text-align: left; }
.preview { width: 140px; height: 140px; border-radius: 24px; margin: 12px 0; }
.bigcode { font-size: 2rem; letter-spacing: .1em; font-weight: 800; }
.err { color: #b00020; }
```

- [ ] **Step 3: Manual check**

Temporarily point `main.js` at the start screen:

```js
window.addEventListener("DOMContentLoaded", () => {
  App.startscreen.render(document.getElementById("app"), {
    onReady: world => { document.getElementById("app").textContent =
      "Ready: " + world.pet.name + " (" + world.code + ")"; }
  });
});
```

Open `index.html` in a fresh browser profile (or clear storage). Expected: creation flow appears; Reroll changes species/theme/code; a blocked name (`butt`) shows "Let's pick a kinder name."; empty name shows the length message; finishing shows the big code then "Ready: <name>". Reload → the returning-player picker now shows a card. Keep this `main.js` body — Task 13 builds on it.

- [ ] **Step 4: Commit**

```bash
git add potato-pet/js/startscreen.js potato-pet/styles.css potato-pet/js/main.js
git commit -m "feat: start screen, seeded creation flow with reroll, and name step"
```

---

## Task 13: Game screen wiring + tick loop + error overlay

**Files:**
- Modify: `potato-pet/js/main.js` — full boot: error handlers, route start→game, build the game UI, run the tick.
- Create: `potato-pet/js/gamescreen.js` — assembles pet + action buttons + shop + games panels.
- Modify: `potato-pet/styles.css` — layout for the action bar and panels.

**Interfaces:**
- Consumes: everything built so far.
- Produces on `App.gamescreen`:
  - `boot(container, world) -> void` — renders the persistent layout: the pet stage (`App.pet.mount`), a star counter, an action bar (Feed / Bed / Hide & Seek / Decorate / Learn / Tell me something), and a panel area. Wires each action to the matching module, persists via `App.save.set(world)` after any state change, and calls `refresh()`.
  - `refresh() -> void` — re-derives mood (`App.state.deriveMood`), calls `App.pet.render(mood)`, updates the star counter, disables the Bed button when `!App.interactions.canSleep(world)`.
- `main.js` behaviour:
  - On `error` / `unhandledrejection` → show `#overlay` with "Uh oh, <name> tripped! 🩹" + a Reload button (`location.reload()`). Never rethrow to the user.
  - On `DOMContentLoaded` → `App.startscreen.render(app, { onReady: world => { App.state.world = world; App.gamescreen.boot(app, world); startTick(); } })`.
  - `startTick()` → every 15000 ms: `App.state.tickNeeds(world, Date.now())`, `App.gamescreen.refresh()`, `App.save.set(world)`. Also run one `tickNeeds` immediately on boot (handles time away).

- [ ] **Step 1: Implement `gamescreen.js`**

`potato-pet/js/gamescreen.js`:

```js
window.App = window.App || {};
App.gamescreen = (function () {
  let container = null, world = null, hideRound = null;

  function boot(el, w) {
    container = el; world = w;
    el.innerHTML =
      '<header class="hud"><span id="stars">★ 0</span>' +
      '<button id="rename" title="rename">✏️</button></header>' +
      '<div id="stage"></div>' +
      '<nav class="actions">' +
        '<button data-act="feed">Feed</button>' +
        '<button data-act="bed">Bed</button>' +
        '<button data-act="hide">Hide &amp; Seek</button>' +
        '<button data-act="decorate">Decorate</button>' +
        '<button data-act="learn">Learn</button>' +
        '<button data-act="fact">Tell me something</button>' +
      '</nav><section id="panel"></section>';
    App.pet.mount(document.getElementById("stage"), world);
    App.state.tickNeeds(world, Date.now());
    el.querySelectorAll(".actions button").forEach(b =>
      b.addEventListener("click", () => onAction(b.dataset.act)));
    el.querySelector("#rename").addEventListener("click", renamePrompt);
    App.pet.speak(pick(App.content.greetings));
    refresh();
  }

  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function persist() { App.save.set(world); }

  function refresh() {
    document.getElementById("stars").textContent = "★ " + world.stars;
    App.pet.render(App.state.deriveMood(world));
    const bed = container.querySelector('[data-act="bed"]');
    if (bed) bed.disabled = !App.interactions.canSleep(world);
  }

  function onAction(act) {
    const panel = document.getElementById("panel");
    panel.innerHTML = "";
    if (act === "feed") {
      panel.innerHTML = App.interactions.FOODS.map(f =>
        '<button data-food="' + f + '">' + f + '</button>').join("");
      panel.querySelectorAll("[data-food]").forEach(b => b.addEventListener("click", () => {
        App.interactions.feed(world, b.dataset.food); persist(); refresh(); panel.innerHTML = "";
      }));
    } else if (act === "bed") {
      const r = App.interactions.putToBed(world);
      if (r.ok) { persist(); refresh(); }
    } else if (act === "hide") {
      hideRound = App.interactions.newHideRound(world);
      panel.innerHTML = '<p>Find me!</p>' + hideRound.spots.map(i =>
        '<button data-spot="' + i + '">spot ' + (i + 1) + '</button>').join("");
      panel.querySelectorAll("[data-spot]").forEach(b => b.addEventListener("click", () => {
        const res = App.interactions.guessSpot(hideRound, world, +b.dataset.spot);
        if (res.found) { persist(); refresh(); panel.innerHTML = "<p>Yay! You found me!</p>"; }
        else { b.disabled = true; }
      }));
    } else if (act === "decorate") {
      renderShop(panel);
    } else if (act === "learn") {
      renderLearnMenu(panel);
    } else if (act === "fact") {
      const f = App.facts.tellSomething(world);
      App.pet.speak(f.text, 6000); persist();
    }
  }

  function renderShop(panel) {
    panel.innerHTML = '<h3>Star Shop</h3>' + App.room.CATALOG.map(c => {
      const owned = world.room.owned.includes(c.id);
      return '<button data-buy="' + c.id + '"' + (owned || !App.room.canBuy(world, c.id) ? ' disabled' : '') +
        '>' + c.label + (owned ? ' ✓' : ' — ★' + c.price) + '</button>';
    }).join("") + '<div id="roomwrap"></div><p><button id="placemode">Place items</button></p>';
    App.room.renderRoom(document.getElementById("roomwrap"), world, {});
    panel.querySelectorAll("[data-buy]").forEach(b => b.addEventListener("click", () => {
      if (App.room.buy(world, b.dataset.buy).ok) { persist(); refresh(); renderShop(panel); }
    }));
    panel.querySelector("#placemode").addEventListener("click", () => enterPlaceMode(panel));
  }

  function enterPlaceMode(panel) {
    const owned = world.room.owned.slice();
    let selected = owned[0];
    panel.innerHTML = '<h3>Place items</h3><p>Pick an item, then tap a square. Tap a placed item to pick it up.</p>' +
      owned.map(id => '<button data-sel="' + id + '">' + id + '</button>').join("") +
      '<div id="roomwrap"></div><p><button id="doneplace">Done</button></p>';
    const draw = () => App.room.renderRoom(document.getElementById("roomwrap"), world, {
      placeMode: true,
      onPlaceCell: (x, y) => {
        const hit = world.room.placed.find(p => p.x === x && p.y === y);
        if (hit) App.room.pickUp(world, hit.item);
        else App.room.place(world, selected, x, y);
        persist(); draw();
      }
    });
    panel.querySelectorAll("[data-sel]").forEach(b => b.addEventListener("click", () => { selected = b.dataset.sel; }));
    panel.querySelector("#doneplace").addEventListener("click", () => renderShop(panel));
    draw();
  }

  function renderLearnMenu(panel) {
    panel.innerHTML =
      '<h3>Learn together</h3>' +
      '<button id="math">Math Dash (level ' + world.learn.game.mathLevel + ')</button> ' +
      '<button id="spell">Spelling Pop (level ' + world.learn.game.spellingLevel + ')</button>';
    panel.querySelector("#math").addEventListener("click", () => playRound(panel, "math"));
    panel.querySelector("#spell").addEventListener("click", () => playRound(panel, "spell"));
  }

  function playRound(panel, kind) {
    const key = kind === "math" ? "mathLevel" : "spellingLevel";
    const level = world.learn.game[key];
    const rand = App.rng.mulberry32(Date.now() >>> 0);
    const round = App.games.runRound(kind === "math" ? "math" : "spelling", level, rand);
    let i = 0, correct = 0, streak = 0, best = 0;
    const next = () => {
      if (i >= round.questions.length) return finish();
      const q = round.questions[i];
      const prompt = kind === "math" ? q.prompt : "Which spelling is right?";
      const opts = kind === "math" ? q.options : q.options;
      const answer = kind === "math" ? q.answer : q.word;
      panel.innerHTML = '<p>Question ' + (i + 1) + ' / ' + round.questions.length + '</p><h3>' + prompt + '</h3>' +
        (kind === "spelling" ? '<p><em>(listen)</em></p>' : '') +
        opts.map(o => '<button data-opt="' + o + '">' + o + '</button>').join("");
      if (kind === "spelling" && window.speechSynthesis) {
        try { speechSynthesis.speak(new SpeechSynthesisUtterance(q.word)); } catch (_) {}
      }
      panel.querySelectorAll("[data-opt]").forEach(b => b.addEventListener("click", () => {
        const ok = String(b.dataset.opt) === String(answer);
        if (ok) { correct++; streak++; best = Math.max(best, streak); App.pet.speak("Yes! 🎉"); }
        else { streak = 0; App.pet.speak("Good try — next one!"); }
        i++; next();
      }));
    };
    const finish = () => {
      const gained = App.games.scoreRound(correct, best);
      world.stars += gained;
      world.learn.game.bestStreak = Math.max(world.learn.game.bestStreak, best);
      persist(); refresh();
      const offer = App.games.shouldOfferLevelUp([{ correct: correct, total: round.questions.length },
        { correct: correct, total: round.questions.length }]);
      panel.innerHTML = '<h3>Round done!</h3><p>' + correct + ' / ' + round.questions.length +
        ' right · +★' + gained + '</p>' +
        (offer ? '<p><button id="levelup">Try a harder level</button></p>' : '') +
        '<p><button id="again">Play again</button> <button id="back">Back</button></p>';
      if (offer) panel.querySelector("#levelup").addEventListener("click", () => {
        world.learn.game[key] = Math.min(kind === "math" ? 4 : 3, level + 1); persist(); renderLearnMenu(panel);
      });
      panel.querySelector("#again").addEventListener("click", () => playRound(panel, kind));
      panel.querySelector("#back").addEventListener("click", () => renderLearnMenu(panel));
    };
    next();
  }

  function renamePrompt() {
    const raw = prompt("New name for your pet:");
    if (raw == null) return;
    const res = App.content.validateName(raw);
    if (!res.ok) { alert(res.reason === "length" ? "1 to 16 letters please." : "Let's pick a kinder name."); return; }
    world.pet.name = res.value; persist();
  }

  return { boot, refresh };
})();
```

- [ ] **Step 2: Implement full `main.js`**

`potato-pet/js/main.js`:

```js
window.App = window.App || {};

function showOverlay(msg) {
  const o = document.getElementById("overlay");
  o.innerHTML = "<div><p>" + msg + "</p><button onclick=\"location.reload()\">Reload</button></div>";
  o.hidden = false;
}
window.addEventListener("error", () => {
  const name = App.state.world && App.state.world.pet ? App.state.world.pet.name : "Your pet";
  showOverlay("Uh oh, " + (name || "your pet") + " tripped! 🩹");
});
window.addEventListener("unhandledrejection", () => {
  const name = App.state.world && App.state.world.pet ? App.state.world.pet.name : "Your pet";
  showOverlay("Uh oh, " + (name || "your pet") + " tripped! 🩹");
});

let tickHandle = null;
function startTick() {
  clearInterval(tickHandle);
  tickHandle = setInterval(() => {
    if (!App.state.world) return;
    App.state.tickNeeds(App.state.world, Date.now());
    App.gamescreen.refresh();
    App.save.set(App.state.world);
  }, 15000);
}

window.addEventListener("DOMContentLoaded", () => {
  const app = document.getElementById("app");
  App.startscreen.render(app, {
    onReady: world => {
      App.state.world = world;
      App.gamescreen.boot(app, world);
      startTick();
      if (location.search.indexOf("dev") !== -1 && App.devpanel) App.devpanel.mount(world);
    }
  });
});
```

- [ ] **Step 3: Add `gamescreen.js` to `index.html`**

Insert `<script src="js/gamescreen.js"></script>` right before `js/startscreen.js`.

- [ ] **Step 4: Add layout styles to `styles.css`**

```css
.hud { display: flex; justify-content: space-between; align-items: center; font-size: 1.3rem; font-weight: 800; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
#panel { min-height: 80px; display: flex; flex-wrap: wrap; gap: 8px; }
```

- [ ] **Step 5: Manual check (TESTING.md walk)**

Open `index.html` in a fresh profile. Walk: create + name a pet → Feed (star goes up, chomp anim) → let it get tired or use `?dev` → Bed (button disables when fresh) → Hide & Seek (8 spots, wrong disables that button, right ends round) → Decorate (buy something you can afford, Place items, drop it, pick it up) → Learn → Math Dash (5 questions, wrong resets streak, stars awarded) → Spelling Pop (hear the word if the device speaks) → "Tell me something" (fact in the bubble) → reload the page → pet, stars, room all persisted → open in a second browser, enter the code → same starting species/room.

- [ ] **Step 6: Commit**

```bash
git add potato-pet/js/gamescreen.js potato-pet/js/main.js potato-pet/index.html potato-pet/styles.css
git commit -m "feat: game screen wiring, 15s tick loop, and friendly error overlay"
```

---

## Task 14: Dev panel + Backup/Restore

**Files:**
- Create: `potato-pet/js/devpanel.js`
- Create: `potato-pet/js/backup.js`
- Create: `potato-pet/js/backup.tests.js`
- Modify: `potato-pet/tests.html` — add `<script src="js/backup.tests.js"></script>`.
- Modify: `potato-pet/index.html` — add `<script src="js/backup.js"></script>` before `gamescreen.js`, and `<script src="js/devpanel.js"></script>` stays before `main.js` (already present).

**Interfaces:**
- Consumes: `App.save.set`, `App.state.tickNeeds`, `App.gamescreen.refresh`.
- Produces on `App.backup`:
  - `exportString(world) -> string` — `btoa(unescape(encodeURIComponent(JSON.stringify(world))))`.
  - `importString(text) -> { ok: boolean, world?: world, reason?: string }` — base64-decode → `JSON.parse` → shape check (`version`, `pet`, `room`, `learn` all present). `reason` is `"decode"` if base64/JSON fails, `"shape"` if the object is missing required keys.
- Produces on `App.devpanel`:
  - `mount(world) -> void` — only called when the URL contains `dev`. Appends a fixed-position panel with buttons: **skip 1 day**, **skip 1 week** (subtract from `pet.lastTick` then `tickNeeds(world, Date.now())` + `refresh`), **+100 stars**, **force mood** (cycles by pushing one need down), **reset this pet** (`App.save.remove(code)` then `location.reload()`), **corrupt save** (write junk to the raw world key then reload), **show backup string** (`prompt` with `App.backup.exportString`).

- [ ] **Step 1: Write the failing tests (backup only)**

`potato-pet/js/backup.tests.js`:

```js
window.__pushTests(function backupTests() {
  const world = {
    version: 1, code: "BAK-001", savedAt: 0,
    pet: { species: "cat", name: "Nyan", adoptedAt: 1, tint: 10,
           needs: { hunger: 100, energy: 100, fun: 100 }, lastTick: 1 },
    stars: 3, room: { theme: "space", owned: ["rug"], placed: [] },
    learn: { factsSeen: [1], game: { mathLevel: 1, spellingLevel: 1, bestStreak: 0 } }
  };
  const str = App.backup.exportString(world);
  assert("export is a non-empty string", typeof str === "string" && str.length > 0);
  const back = App.backup.importString(str);
  assertEq("round-trips", back.ok && back.world.pet.name, "Nyan");

  assertEq("garbage rejected",
    App.backup.importString("!!!not base64!!!").reason, "decode");
  const badShape = btoa(JSON.stringify({ hello: 1 }));
  assertEq("bad shape rejected", App.backup.importString(badShape).reason, "shape");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Open `tests.html`. Expected: FAIL — `App.backup` undefined.

- [ ] **Step 3: Implement `backup.js`**

`potato-pet/js/backup.js`:

```js
window.App = window.App || {};
App.backup = (function () {
  function exportString(world) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(world))));
  }
  function importString(text) {
    let json;
    try { json = decodeURIComponent(escape(atob(String(text).trim()))); }
    catch (_) { return { ok: false, reason: "decode" }; }
    let world;
    try { world = JSON.parse(json); } catch (_) { return { ok: false, reason: "decode" }; }
    if (!world || typeof world !== "object" ||
        world.version == null || !world.pet || !world.room || !world.learn) {
      return { ok: false, reason: "shape" };
    }
    return { ok: true, world: world };
  }
  return { exportString, importString };
})();
```

- [ ] **Step 4: Run tests to verify they pass**

Open `tests.html`. Expected: all backup tests `ok`.

- [ ] **Step 5: Implement `devpanel.js`**

`potato-pet/js/devpanel.js`:

```js
window.App = window.App || {};
App.devpanel = (function () {
  function mount(world) {
    const p = document.createElement("div");
    p.id = "devpanel";
    p.style.cssText = "position:fixed;right:6px;bottom:6px;background:#fff;border:2px solid #000;" +
      "padding:6px;font:11px monospace;display:flex;flex-direction:column;gap:4px;z-index:9999";
    const btn = (label, fn) => {
      const b = document.createElement("button"); b.textContent = label;
      b.style.font = "11px monospace"; b.style.padding = "2px 4px";
      b.addEventListener("click", fn); p.appendChild(b);
    };
    const bump = () => { App.state.tickNeeds(world, Date.now()); App.gamescreen.refresh(); App.save.set(world); };
    btn("skip 1 day",  () => { world.pet.lastTick -= 86400000; bump(); });
    btn("skip 1 week", () => { world.pet.lastTick -= 7 * 86400000; bump(); });
    btn("+100 stars",  () => { world.stars += 100; App.gamescreen.refresh(); App.save.set(world); });
    btn("force mood",  () => {
      const n = world.pet.needs; const k = ["hunger","energy","fun"][Math.floor(Math.random()*3)];
      n[k] = 26; App.gamescreen.refresh(); App.save.set(world);
    });
    btn("show backup", () => window.prompt("Backup string:", App.backup.exportString(world)));
    btn("corrupt save", () => {
      localStorage.setItem("potato-pet:world:" + world.code, "{broken");
      location.reload();
    });
    btn("reset pet", async () => { await App.save.remove(world.code); location.reload(); });
    document.body.appendChild(p);
  }
  return { mount };
})();
```

- [ ] **Step 6: Add Restore entry point to the game screen**

In `gamescreen.js`, extend `renderShop`'s trailing markup with a Backup/Restore pair (small change — add after `#placemode`):

```js
// inside renderShop, append to panel.innerHTML before wiring:
//   '<p><button id="backupbtn">Backup</button> <button id="restorebtn">Restore</button></p>'
// then wire:
panel.querySelector("#backupbtn").addEventListener("click", () =>
  window.prompt("Copy this and keep it safe:", App.backup.exportString(world)));
panel.querySelector("#restorebtn").addEventListener("click", async () => {
  const text = window.prompt("Paste your backup string:");
  if (!text) return;
  const res = App.backup.importString(text);
  if (!res.ok) { alert("That backup didn't look right."); return; }
  await App.save.set(res.world);
  location.reload();
});
```

- [ ] **Step 7: Manual check**

Open `index.html?dev`. Expected: dev panel bottom-right. "skip 1 week" drops needs toward 25 (never below), mood updates. "+100 stars" updates the HUD. "corrupt save" reloads into the "we couldn't read that pet" prompt (from Task 12's `safeLoad`). In Decorate, Backup shows a string; Restore with a wrong string alerts "didn't look right", with a valid one reloads to the restored state.

- [ ] **Step 8: Commit**

```bash
git add potato-pet/js/devpanel.js potato-pet/js/backup.js potato-pet/js/backup.tests.js potato-pet/js/gamescreen.js potato-pet/index.html potato-pet/tests.html
git commit -m "feat: dev panel (time-skip, stars, corrupt) + backup/restore string"
```

---

## Task 15: Docs — TESTING.md and README.md

**Files:**
- Create: `potato-pet/TESTING.md`
- Create: `potato-pet/README.md`

**Interfaces:** none (documentation).

- [ ] **Step 1: Write `TESTING.md`**

`potato-pet/TESTING.md`:

```markdown
# Testing Potato Pet (Phase 1)

## Automated (pure logic)
Open `tests.html` in a browser. Every line should say `ok` and the footer
should read `N / N passed`. Re-run after ANY change to a `js/*.js` file.

## Manual checklist (run after any change to the game screen)
1. Open `index.html` in a fresh browser profile (or clear site data).
2. Make a new pet — Reroll a few times, then Keep. Names: try `butt`
   (blocked), empty (length error), then a real name.
3. The big code screen appears — note the code.
4. Feed: star count rises, pet does a chomp.
5. Add `?dev`, click "skip 1 week": needs drop toward 25, never below.
6. Bed: enabled only when energy is 80 or lower; refills to full.
7. Hide & Seek: 8 spots; a wrong spot disables just that button;
   the right spot ends the round with +4 stars.
8. Decorate: buy an item you can afford (disabled if you can't);
   Place items → drop it on a square → tap it to pick it up.
9. Learn → Math Dash: 5 questions, a wrong answer resets the streak,
   stars awarded at the end.
10. Learn → Spelling Pop: the word is spoken (if the device has a voice);
    a wrong option never blocks finishing.
11. "Tell me something": a fact appears in the speech bubble.
12. Reload the page: pet, stars, room layout all persist.
13. Open `index.html` in a second browser, choose "Enter a code", type
    the code: same starting species and room theme.
14. In Decorate, Backup shows a string; Restore with junk says
    "didn't look right"; Restore with that string reloads unchanged.
15. `?dev` → "corrupt save" → reload lands on
    "we couldn't read that pet" with a fresh-start option (no silent wipe).
```

- [ ] **Step 2: Write `README.md`**

`potato-pet/README.md`:

```markdown
# Potato Pet

A gentle browser virtual pet for a 10-year-old. Phase 1: fully local, no server.

## Run it
- **Easiest:** open `index.html` by double-clicking it.
- **With auto-reload:** in VS Code, install the "Live Server" extension,
  right-click `index.html` → "Open with Live Server".

## Run the logic tests
Open `tests.html`. All lines should say `ok`.

## Add content (no coding beyond editing lists)
Everything the child sees as words lives in `js/content.js`:
- `facts` — add `{ id: <next number>, text: "...", topic: "animals|food|space|body|world" }`
- `spellingLists` — add lowercase words under level `1`, `2`, or `3`
- `affirmations`, `greetings`, `moodLines` — add strings

Math questions are generated in `js/games.js` (`makeMathQuestion`).
Decoration items are the `CATALOG` array in `js/room.js`.

## Tune the game feel
`js/games.js` has two deliberately simple stubs to adjust:
- `scoreRound(correctCount, bestStreakInRound)` — stars per round
- `shouldOfferLevelUp(history)` — when to offer a harder level
`js/state.js` top constants control need decay (`DECAY_PER_DAY`, `NEED_FLOOR`).

## Dev tools
Open `index.html?dev` for a panel: skip time, add stars, force a mood,
corrupt/reset the save, show the backup string.

## What's next (later phases)
- Phase 2: Cloudflare D1 sync so a code restores the pet on any device.
- Phase 3: real CC0 pixel-art sprites in place of the coloured blocks.
- Phase 4: deploy to Cloudflare Pages.
```

- [ ] **Step 3: Commit**

```bash
git add potato-pet/TESTING.md potato-pet/README.md
git commit -m "docs: testing checklist and README (run, content, tuning, dev tools)"
```

---

## Self-Review

**1. Spec coverage**

| Spec section | Task(s) |
|---|---|
| §3 no-build, `App` global, ordered scripts | 1, Global Constraints |
| §4 file structure | File Structure section + all tasks |
| §5.1 world object (+ `pet.tint`, a spec-consistent addition per §6/§14) | 4 |
| §5.3 versioning / migration | 3 |
| §6 code format, seeded world, creation flow, reroll, start screen | 4 (seed), 12 (flow) |
| §6 "make a new pet requires internet" | Phase 2 — Phase 1 generates codes locally (noted in Global Constraints & Task 12 interface) |
| §7 tickNeeds (floor 25, negative→0, ~10/day), no sickness/death, derived mood | 5 |
| §7 talking (greetings/affirmations/moodLines, on load/after action/idle) | 6 (data), 9 (`speak`), 13 (greeting on boot, lines on actions) |
| §7 stars economy (earn trickle, games are income, no negative) | 10, 11, 13 |
| §8 feed (+30 cap 100, +1★), bed (energy≤80 gate, =100, +1★), hide-and-seek (**8 spots**, +2–5★), name (pencil, blocklist+length) | 10, 13 |
| §9 room 12×8, Star Shop, place mode, one item per cell, cosmetic | 11 |
| §10.1 facts (`{id,text,topic}`, ≥40, no-repeat, fact-of-the-day) | 6, 8 |
| §10.2 Math Dash & Spelling Pop (MCQ, no timers/lives, streak resets, offered level-up) | 7, 13 |
| §10.2 `scoreRound` / `shouldOfferLevelUp` stubs for maintainer | 7 |
| §11 `save.js` async API `list/load/set/create/remove` | 3 |
| §11 local keys `potato-pet:index`, `potato-pet:world:<code>` | 3 |
| §11 D1 sync, `save.load`/`save.set` network algorithms, offline indicator | **Phase 2 — out of scope for this plan** |
| §12 Backup / Restore (base64, parse + shape check) | 14 |
| §13 error handling (overlay, corrupt→offer fresh, degrade to keep playing, stars≥0, input validation) | 12 (`safeLoad`), 13 (overlay), 6 (name), 14 (restore shape) |
| §13 missing sprite → placeholder block | 9 |
| §13 no `speechSynthesis` → text only | 13 (`try/catch` around `speak`) |
| §14 art pipeline, sprite sheets, hue-rotate tint | 9 (manifest + placeholder + `hue-rotate`); real sheets are **Phase 3** |
| §15 dev panel, `tests.html`, `TESTING.md` | 14, 1 (+ every task's `*.tests.js`), 15 |
| §16 deferred decisions | Surfaced as stubs/constants in 5, 7, 10 |

**Phase-2 items intentionally excluded** (they get their own plan): D1 schema, `functions/`, `wrangler.toml`, `config.js` real value, server-side code generation, local-first sync/merge, `pendingSync` offline indicator. `config.js` ships as an inert stub in Task 1 so the seam exists.

**2. Placeholder scan**

- `content.js` ships 5 example facts with an explicit instruction to extend to 40, and Task 6 Step 4 makes the test fail until it's done — this is a guided data-entry step, not a code placeholder.
- `scoreRound` / `shouldOfferLevelUp` are shipped as working, tested placeholders with documented behaviour, explicitly called out as maintainer tuning points (spec §16). Not "TODO" — they run.
- No "TBD", "implement later", "add error handling", or code steps without code found.

**3. Type consistency**

- `world` shape identical across Tasks 3, 4, 5, 8, 10, 11, 14 (`pet.needs.{hunger,energy,fun}`, `pet.lastTick`, `pet.tint`, `room.owned`, `room.placed:[{item,x,y}]`, `learn.factsSeen`, `learn.game.{mathLevel,spellingLevel,bestStreak}`).
- `App.save` methods (`list/load/set/create/remove`) named consistently in Tasks 3, 12, 13, 14.
- `App.pet` methods (`mount/render/playAnim/speak`) consistent in Tasks 9, 10, 13.
- `App.room` methods (`CATALOG/priceOf/canBuy/buy/cellOccupied/place/pickUp/renderRoom`) consistent in Tasks 11, 13.
- `App.interactions` (`feed/canSleep/putToBed/newHideRound/guessSpot`, `SPOT_COUNT`, `FOODS`) consistent in Tasks 10, 13.
- `App.games` (`runRound/makeMathQuestion/makeSpellingQuestion/scoreRound/shouldOfferLevelUp`, `QUESTIONS_PER_ROUND`) consistent in Tasks 7, 13.
- `SAVE_CORRUPT` error string identical in Tasks 3 and 12.

No mismatches found.
