# Potato Pet — Design Spec

**Date:** 2026-08-27
**Status:** Approved design, pre-implementation
**Audience:** A 10-year-old child (the player); a rusty-beginner parent (the maintainer)

---

## 1. Summary

A browser-based virtual pet, Tamagotchi-style but deliberately gentle. The child
opens a webpage, adopts a pixel-art creature (food-themed or animal-themed), names
it, and cares for it: feeds it, plays hide-and-seek, puts it to bed, and decorates
its room. The pet speaks in short, warm, growth-mindset lines. Two "learning"
activities — fun facts and gentle multiple-choice practice games (math, spelling) —
are the main way the child earns stars to spend on room decorations.

There is no losing. The pet never gets sick, never runs away, never dies. Time away
makes it mildly hungry or sleepy at worst; coming back is always a happy reunion.

Players are identified by a short shareable **code** — no accounts, no passwords,
no email. The code both *generates* the starting world (seeded) and is the *key*
the saved world is stored under. The game runs local-first (instant, offline-capable)
and syncs each world to a Cloudflare D1 database so it can be resumed on any device.

---

## 2. Goals and non-goals

### Goals

- A toy the child wants to return to daily, that feels kind.
- Learning (facts + practice) sits at the centre of the reward loop, not bolted on.
- The maintainer can run it locally by clicking "Go Live" in VS Code, and change
  content (facts, word lists, math problems) by editing plain arrays.
- Works on a tablet (touch-first, no typing required to play).
- Same pet resumable on a second device via a short code.
- Cheap: fits comfortably in Cloudflare's free tier.

### Non-goals (v1)

- No user accounts, profiles, friends lists, or chat.
- No real-money anything.
- No sound/music (only `speechSynthesis` for the spelling game).
- No multiplayer or shared/visitable rooms (typing a friend's code gives you the
  same *starting* world, not their live world).
- No leaderboards or cross-world queries.
- No native app; browser only.
- No build tooling for the game itself (no bundler, no framework, no npm for the
  front-end). Node is used only for the optional local sync dev server.

---

## 3. Tech approach

**Front-end:** plain HTML + CSS + JavaScript. Scripts loaded with ordinary
`<script>` tags in order; each file attaches its functions to one shared global
`App` object (`App.state`, `App.save`, `App.pet`, …). No ES modules — so
double-clicking `index.html` works, and so does static hosting. No framework, no
bundler, nothing to update.

**Why not a framework / build tool:** the maintainer is a rusty beginner who wants
the simplest possible "how do I run this." A build step is a recurring cost paid
every time they return to the project after months. The game is small enough to
hold in one's head without a framework's structure.

**Persistence:** local-first. `localStorage` is the source of truth for play
(instant, offline). `save.js` also syncs each world to Cloudflare D1 via Pages
Functions, newest-wins by timestamp, so a world resumes on any device.

**Art:** CC0 pixel-art sprite sheets (Kenney.nl, itch.io CC0 packs), animated by
stepping CSS `background-position`. `image-rendering: pixelated` for crisp scaling.

**Runtime targets:** current Chrome / Edge / Safari on desktop and tablet.

---

## 4. File / project structure

```
potato-pet/
  index.html          the page; loads scripts in order
  styles.css          all styling, incl. the pixel-art crispness rule
  js/
    config.js         App.config — API base URL (localhost vs prod)
    rng.js            seeded PRNG: hash(codeString) -> mulberry32
    world.js          generateWorld(code): seeded species/tint/theme/starter item
    state.js          the live world object + derived getters (mood)
    save.js           load / set / create / remove / list — the ONLY storage seam
    startscreen.js    "enter your code" / "make a new pet" screen + reroll
    pet.js            draw the pet sprite, animations, speech bubble
    sprites.js        per-species sprite-sheet manifest (rows, frames, fps)
    interactions.js   feed / put-to-bed / hide-and-seek
    room.js           decoration grid, place mode, the Star Shop
    games.js          the practice mini-games (Math Dash, Spelling Pop)
    facts.js          "tell me something" logic + fact-of-the-day
    content.js        plain data: affirmations, greetings, moodLines,
                      facts[], math question banks, spelling word lists
    devpanel.js       ?dev tools (skip time, add stars, force mood, corrupt save)
    main.js           boot: load save -> build screen -> start the tick
  assets/
    sprites/          the PNG sprite sheets
    sprites/LICENSE.txt   which pack each file came from
  functions/          Cloudflare Pages Functions (the API)
    world/[code].js   GET + PUT one world
    world.js          POST a new world -> returns a fresh unique code
  schema.sql          D1 table definition
  wrangler.toml       D1 binding (for `wrangler pages dev` and deploy)
  tests.html          hand-rolled assertions over the pure logic
  TESTING.md          manual post-change checklist
  README.md           how to run, how to deploy, how to add content
```

**Running it while building the game:** VS Code Live Server → "Go Live"
(double-click `index.html` also works).

**Running it while working on sync:** `npx wrangler pages dev` serves the site +
functions + a local D1 together. This is the only place Node is needed.

**Publishing:** connect the folder to a Cloudflare Pages project once; it deploys
on push/save. D1 binding configured in the Pages dashboard.

---

## 5. Data model

### 5.1 The world object (one per code)

```js
world = {
  version: 1,
  code: "K7F-9Q2",
  savedAt: 0,                 // epoch ms, stamped on every local write
  pet: {
    species: "turtle",        // chosen by the seed, not a menu
    name: "Shelly",           // child types this
    adoptedAt: 0,             // epoch ms
    needs: { hunger: 100, energy: 100, fun: 100 },  // 0..100, higher = happier
    lastTick: 0              // epoch ms of last needs update
  },
  stars: 0,                   // earned from care + games, spent in the shop
  room: {
    theme: "meadow",          // chosen by the seed
    owned: ["rug"],           // decoration ids bought
    placed: [ { item: "rug", x: 2, y: 3 } ]  // one item per cell
  },
  learn: {
    factsSeen: [],            // fact ids already shown
    game: { mathLevel: 1, spellingLevel: 1, bestStreak: 0 }
  }
}
```

- **Mood is never stored.** It is derived: whichever need is lowest names the mood
  (`hungry` / `sleepy` / `bored`), or `happy` if all are above a threshold. Mood
  selects the sprite animation and which speech lines are eligible.
- The whole object is the save payload: `JSON.stringify(world)` to store,
  `JSON.parse` to load, and the same string is the D1 row's `data` column.

### 5.2 D1 schema (`schema.sql`)

```sql
CREATE TABLE IF NOT EXISTS worlds (
  code       TEXT PRIMARY KEY,
  data       TEXT NOT NULL,      -- the world JSON, unchanged
  version    INTEGER NOT NULL,
  updated_at INTEGER NOT NULL    -- epoch ms, for newest-wins
);
```

One row per world. No normalized decoration/pet tables — the app only ever loads
or saves a whole world by primary key; it never queries across worlds. Revisit
only if a leaderboard or admin view is ever wanted.

### 5.3 Versioning / migration

- `world.version` is an integer; `CURRENT_VERSION` constant in `save.js`.
- On load, if `world.version < CURRENT_VERSION`, run `migrations` in order
  (`1->2`, `2->3`, …). Each migration is a small pure function that adds or renames
  fields with sensible defaults and bumps the version. Then the world is saved back.
- The Worker/Functions store `version` but do not interpret it — migration is
  entirely client-side.

---

## 6. The code (identity)

- **Format:** 6 characters from an unambiguous alphabet (no `0 O 1 I L`), shown
  grouped, e.g. `K7F-9Q2`. ~900 million combinations.
- **Generated server-side** on "Make a new pet" (`POST /world`), with a uniqueness
  check — retry on the rare primary-key collision.
- **Seeds the world:** `hash(code)` → 32-bit int → `mulberry32` PRNG →
  `generateWorld(code)` deterministically picks species, colour tint (CSS
  `hue-rotate` amount), room theme, and one starting decoration. Same code always
  produces the same starting world.
- **Is the storage key:** local key `potato-pet:world:<code>`; D1 primary key.
- **Security posture:** holding the code *is* the permission to read and overwrite
  that world. Acceptable for a low-stakes pet game. Mitigations: 6-char length,
  Worker rate-limiting (Cloudflare free feature), request-body size cap (~64 KB),
  rude-word filter on pet names (names live in shared storage).

### Creation flow

1. Child picks "Make a new pet" (requires internet — the server issues the code).
2. Server returns a fresh unique code; client runs `generateWorld(code)` and shows
   a preview: species, colour, room theme.
3. **Reroll** → `POST /world` again for a new code + preview. Unlimited before
   committing.
4. **Keep** → child names the pet (validated: length + rude-word blocklist).
5. The code is shown large with "Write this down!" and the game starts.
6. Reroll exists **only during creation** — never after (it would mean a new world).

### Start screen

- No worlds on this device → straight to "Make a new pet".
- Otherwise → a card per local pet ("Shelly the turtle"), an "Enter a code" field,
  and "Make a new pet".
- Entering a code: if it exists locally or in D1, load it (newest wins). If it
  exists nowhere, `generateWorld` builds that starting world locally (lets a child
  type a friend's code and get the same starting species/room; progress is separate
  until — and unless — a real shared-world feature is built).

---

## 7. Game loop & pet state

- **`tickNeeds(world, now)`**
  - `elapsed = max(0, now - pet.lastTick)` — negative (clock changed) treated as 0.
  - Each need decays at a rate tuned to ~10 points/day.
  - **Every need is floored at 25.** It can never go below. A week away →
    "a bit peckish", one feed → full.
  - Updates `pet.lastTick = now`.
  - Called once on load (this is how "time away" is handled) and every ~15s while
    the tab is open (visible drift + animation shifts).
- **No sickness, no death, no running away, ever.**
- **Mood** = derived from the lowest need each render (see 5.1).

### Talking

- `content.js`: `greetings[]`, `affirmations[]`, `moodLines.{hungry,sleepy,bored,happy}[]`.
- Speech bubble shows: on load (greeting), after every interaction (a reaction
  line), and roughly every 45s idle (a random affirmation).
- Lines are short, warm, growth-mindset flavoured, kid-appropriate.

### Stars economy

- **Earn:** feed / bed / hide-and-seek give a small trickle (1–2). Mini-games are
  the real income (roughly 5–15 per round, scaled by streak).
- **Spend:** room decorations in the Star Shop.
- Balance can never go negative; buy buttons disable below the item price.

---

## 8. Interactions

| Interaction | Behaviour | Effect |
|---|---|---|
| **Feed** | Food tray slides up; tap a food; pet plays an eat animation; happy line. Food types are cosmetic only. | `hunger += 30` (cap 100), +1 star |
| **Put to bed** | Tap bed; room dims; pet walks over; ~5s lullaby animation with "Zzz". Button disabled while `energy > 80` (no spamming). | `energy = 100`, +1 star |
| **Hide-and-seek** | Pet hides; room shows **8 hiding spots** with the pet barely peeking from one (seeded/random). Tap spots — wrong ones giggle, right one the pet pops out celebrating. One hide per round, endlessly replayable. | `fun += chunk`, +2–5 stars for a quick find |
| **Name** | Set during creation; changeable anytime via a pencil icon. | Rude-word blocklist + length check |

Every interaction resolves in under ~5 seconds — this is a toy, not an idle game;
the child should never wait real minutes.

---

## 9. Room & decorating

- Room is a fixed **12 × 8 grid**, drawn with the theme's floor and wall tiles.
- **Star Shop** panel: decoration items (furniture, wall hangings, rugs, toys) with
  star prices. Buying adds the item id to `room.owned`.
- **Place mode:** tap an owned item, tap a cell to drop it; tap a placed item to
  move it or return it to inventory. One item per cell, no rotation, no stacking.
- Everything cosmetic in v1 (no passive bonuses).
- `room.placed` fully describes the layout; the room rebuilds exactly on reload.

---

## 10. Learning

### 10.1 Fun facts

- `content.js` `facts[]`: `{ id, text, topic }`, topics like animals / food / space
  / body / world. One or two kid-sized sentences. ~40 to start; easy to append.
- **"Tell me something!"** button → the pet shares a fact whose id is not in
  `learn.factsSeen`; when all are seen, reshuffle. New id appended to `factsSeen`.
- **Fact of the day:** seeded by the calendar date, so it is stable all day.

### 10.2 Practice mini-games

Both framed as "your pet is learning too — help each other." Both: **no timers, no
lives, no losing.** The only pressure is a streak, which only grows or resets.
Level-up is *offered* after a couple of strong rounds and the child chooses it;
never forced, never auto-demoted.

**Math Dash**
- 5 questions per round, **multiple choice** (4 tappable options — no typing).
- Levels: add/subtract within 20 → within 100 → times tables → mixed incl. division.
- Right → pet cheers, streak grows. Wrong → "on to the next one," streak resets,
  **no penalty**.
- Stars = base + streak bonus (exact curve deferred to implementation — see §16).

**Spelling Pop**
- Word spoken via `speechSynthesis` (built-in; no files, no key) and flashed on
  screen, then the child **picks the correct spelling from 4 options**.
- Word lists by level, easy → tricky.
- No `speechSynthesis` on the device → show the word longer, skip audio.

Playing either game also nudges the `fun` need up.

Question/word banks live in `content.js` as plain arrays — the file the maintainer
or child edits most often.

---

## 11. Local-first + D1 sync

Every local write stamps `world.savedAt = Date.now()`. D1 rows carry `updated_at`.
That pair drives newest-wins.

### `save.js` public API (all `async` from day one)

| Call | Purpose |
|---|---|
| `save.list()` | codes on this device + each pet's name/species (for the picker) |
| `save.load(code)` | resolve one world (see algorithm below) |
| `save.set(world)` | stamp `savedAt`, write local now, debounce-push to D1 |
| `save.create(code, world)` | first save of a new pet |
| `save.remove(code)` | delete a pet locally (and from D1) |

Local keys: `potato-pet:index` (array of `{code, name, species}`) and
`potato-pet:world:<code>`.

**Making the functions `async` now, before the network exists,** means call sites
(`await save.load(code)`) do not change when the D1 implementation lands.

### `save.load(code)` algorithm

1. Read local copy (may be absent).
2. `GET /world/:code` with a ~4s timeout.
3. Remote exists and `remote.updated_at > local.savedAt` → use remote, overwrite local.
4. Only local exists → use it, push it up (covers "played offline, now online").
5. Only remote exists → use it, write local.
6. Neither → unknown code (offer `generateWorld` for a typed code, or treat as new).
7. Network failed → use local, continue offline.

### `save.set(world)` algorithm

1. Stamp `savedAt`, write local **immediately** (instant taps).
2. Debounce ~1.5s → `PUT /world/:code`. On failure, set `pendingSync` flag; retry
   on the next `set` or `load`.

### Conflicts

Whole-world newest-wins, no field merging. Adequate for one child on two devices.
Edge case: edits on device A while device B was offline with a faster clock can
lose a little progress. Backup / Restore (§12) is the escape hatch.

### Constraints

- **"Make a new pet" requires internet** (server issues the code). Existing pets
  work fully offline.
- A small unobtrusive "offline" indicator when `pendingSync` is set, so a parent
  can tell.

### API (Cloudflare Pages Functions, same origin as the site → no CORS config)

| Route | Method | Behaviour |
|---|---|---|
| `/world` | POST | generate a unique 6-char code, insert an initial row, return `{ code }` |
| `/world/:code` | GET | `SELECT data,version,updated_at FROM worlds WHERE code=?`; 404 if absent |
| `/world/:code` | PUT | `INSERT … ON CONFLICT(code) DO UPDATE SET data=?, version=?, updated_at=?`; reject bodies > ~64 KB |

Worker-level rate limiting enabled (Cloudflare free feature).

`js/config.js`: if `location.hostname === "localhost"` use the local dev API,
else the deployed origin.

---

## 12. Backup / Restore

- **Backup** button → shows the current world as one long text string
  (base64 of the JSON) to copy; a parent emails it to themselves.
- **Restore** → paste it back. The string must `JSON.parse` **and** pass a shape
  check (has `version`, `pet`, `room`, `learn`) before it replaces anything;
  otherwise "that backup didn't look right."
- ~20 lines of insurance against cleared browser data / sync conflicts.

---

## 13. Error handling

- Global `window.onerror` / `unhandledrejection` → friendly full-screen overlay
  ("Uh oh, Shelly tripped! 🩹" + Reload). Never a stack trace on screen.
- Corrupt local save → "we couldn't read that pet 😢 — start fresh or try another
  code?" Never a silent wipe.
- Sync/network errors → silent; retried; reflected only in the small offline
  indicator.
- Missing sprite sheet (404) or missing animation row → coloured placeholder block
  + `console.warn`; game continues. Missing animation falls back to `idle`.
- `speechSynthesis` unavailable → text-only spelling game.
- Stars cannot go negative; purchase buttons disable below price.
- All meaningful inputs validated (pet name: length + blocklist; Restore string:
  parse + shape check).

Design principle: **every failure degrades to "keep playing."**

---

## 14. Art pipeline

- **Packs:** Kenney.nl (Animal Pack, Food Kit, Furniture Kit), itch.io CC0 packs.
  CC0 = no attribution required; `assets/sprites/LICENSE.txt` records sources anyway.
- **Per species:** one sprite-sheet PNG, frames in a grid, fixed cell size
  (e.g. 64×64), one row per animation (idle, happy, eat, sleep, peek).
- **`sprites.js` manifest** per species: `{ sheet, frame, anims: { name: { row,
  frames, fps } } }`.
- **Render:** a `<div>` one cell wide, `background-image` = the sheet, step
  `background-position` across columns on a timer at the animation's fps.
  `image-rendering: pixelated`, scaled 3–4×.
- **Seed colour variety:** CSS `filter: hue-rotate(<seeded amount>)` yields several
  colour variants from one sheet.
- **Room:** theme = floor tile + wall tile + palette, drawn as a CSS grid of
  background tiles. Decorations = individual small PNGs placed in grid cells.
- **Fallbacks:** missing animation → `idle`; missing sheet → placeholder block.
- **Known friction:** mixing packs means slightly different pixel scales/styles.
  Mitigation: pick one primary creature pack; accept minor mixing for food/
  furniture, or rescale to a common cell. Placeholder coloured blocks in the exact
  sprite slots let the game be built and tested before art is finalised.

---

## 15. Testing

No test framework (would drag in Node/npm for the front-end).

1. **Dev panel** — `?dev` in the URL reveals buttons: skip 1 day, skip 1 week,
   +100 stars, reset this pet, force each mood, sync now, corrupt the save.
2. **`tests.html`** — a plain page running hand-written assertions (prints ✓/✗)
   over the pure logic:
   - `tickNeeds` floors at 25; negative elapsed → 0
   - `hash(code)` stable across calls
   - `generateWorld(code)` deterministic
   - save round-trip (`stringify` → `parse` → deep-equal)
   - every migration produces a world that passes the shape check
   - `scoreRound` math
3. **`TESTING.md`** — manual walk after any change: make a pet → feed → play both
   games → buy + place a decoration → reload (persists) → open in a second browser
   with the code (syncs) → go offline and play → restore a backup.

---

## 16. Decisions deferred to implementation

These are small, meaningful tuning calls best made with the child in mind. They
will be left as clearly-marked stubs for the maintainer to fill:

- **`scoreRound(results, streak)`** — stars per correct answer, streak bonus size.
- **`shouldOfferLevelUp(history)`** — how many strong rounds before offering a
  harder level.
- Exact need-decay rates (within the "~10 points/day, floored at 25" envelope).
- Hide-and-seek reward curve and whether spot count scales with anything.
- Starter content: the ~40 facts, initial math banks, initial spelling lists.

---

## 17. Build order (for the plan)

1. **Skeleton:** `index.html`, `styles.css`, `App` global, `main.js` boot, a static
   pet sprite on screen from one hard-coded sheet.
2. **Pure logic + `tests.html`:** `rng.js`, `hash`, `world.js`/`generateWorld`,
   `tickNeeds`, migrations. Assertions green.
3. **`save.js` local-only:** create / load / set / list / remove against
   `localStorage`; start screen + creation flow + reroll (code generated locally
   for now).
4. **Pet + interactions:** `pet.js` animation stepping, `sprites.js` manifest,
   feed / bed / hide-and-seek, speech bubbles, mood.
5. **Room:** grid render, Star Shop, place mode, persistence.
6. **Learning:** facts + fact-of-the-day; Math Dash; Spelling Pop; wire stars.
7. **Dev panel + error overlay + Backup/Restore.**
8. **Cloud:** `schema.sql`, `functions/`, `wrangler.toml`; switch `save.js` to
   local-first + D1 sync; `config.js`; server-side code generation replaces the
   local placeholder.
9. **Art pass:** real CC0 sheets swapped into the placeholder slots; `LICENSE.txt`.
10. **`TESTING.md` walk; deploy to Cloudflare Pages.**

Steps 1–7 produce a fully playable local game. Step 8 adds resume-anywhere.
