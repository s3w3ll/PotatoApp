# Interactive Base Items — Design

**Date:** 2026-08-29
**Status:** Approved for planning
**Branch:** `interactive-base-items`

## Context

The decorating feature (`js/room.js`, the Shop/Arrange panel in `js/gamescreen.js`,
sprites from `tools/gen-art.mjs`) currently supports 24 static decorations placed on a
12×8 grid. `world.room.placed` is a list of `{ item, x, y }`.

The goal is to move Potato Pet toward a base-builder in the spirit of the Secret Bases
in Pokémon Ruby/Sapphire: many more decorations, and items you can *interact* with —
a TV you turn on and off, a stereo that sheds dancing music notes while it plays.

That whole direction is three separable pieces:

- **A. Interactive-item framework** — placed items carry state (on/off), you toggle
  them in the room, the state animates and persists. This is the new architecture.
- **B. Content expansion** — dozens more decorations across themed sets. The bottleneck
  is pixel art (one grid per item in `gen-art.mjs`).
- **C. "Secret Base" structure** — multi-cell item footprints, wall vs floor zones,
  a decoration score / visitors.

**This spec covers A only**, plus three flagship interactive items. B and C get their
own specs on top of the seam this one creates.

## Decisions (from brainstorming)

- **Interaction UI:** tap a placed interactive item in the normal room view to toggle
  it. Place mode is unchanged (tap a cell to place / pick up). The pet is on its own
  layer, so drags don't conflict.
- **Flagship items:** TV, Stereo, Lava Lamp — all the same behaviour type (on/off
  toggle + CSS animation while on).
- **Pet reactions** (pet dances to the stereo, watches the TV): **deferred** to a
  later slice.
- **Persistence:** on/off state is saved like the rest of the world — localStorage +
  D1 sync. Leave the TV on, come back tomorrow or on another device, it's still on.
- **Gameplay effect:** none. Purely cosmetic, like real Secret Bases. No `state.js` or
  `interactions.js` changes.
- **Item size:** the flagship items stay one grid cell for now, same visual size as
  today's decorations. Making them render larger is folded into the deferred
  multi-cell work (C).
- **Architecture:** declarative — an `effect` field on the catalog entry plus a small
  `FX` overlay map in `renderRoom`. No new module. (Approaches considered: a
  `App.baseItems` registry module, and a separate `.fxlayer`; both rejected as
  more machinery than three CSS toggles need.)

## Data model

### CATALOG (`js/room.js`)

Interactive entries gain two fields:

```js
{ id: "tv", label: "Television", price: 18, kind: "furniture", set: "gadgets",
  interactive: true, effect: "tv" }
```

- `interactive: true` — marks the item as toggleable.
- `effect: "<name>"` — names the animation, and is the key into the `FX` map.

Non-interactive entries are untouched (no `interactive`, no `effect`).

New set for the shop grouping:

```js
SETS = [ …existing…, { id: "gadgets", label: "Gadgets" } ]
```

Three new CATALOG entries, all `set: "gadgets"`, all `interactive: true`:

| id         | label        | price | kind      | effect  |
|------------|--------------|-------|-----------|---------|
| `tv`       | Television   | 18    | furniture | `tv`    |
| `stereo`   | Stereo       | 16    | furniture | `notes` |
| `lavalamp` | Lava Lamp    | 20    | furniture | `lava`  |

Catalog size goes 24 → 27.

### Placed items (`world.room.placed`)

Each entry may gain an optional `on: true`:

```js
{ item: "tv", x: 3, y: 4, on: true }
```

- Absent `on` = off. A freshly placed interactive item has no `on`.
- **No `save.CURRENT_VERSION` bump.** Old saves have no `on` anywhere; the code reads
  missing as off. Same pattern already used for `pet.pos` and `pet.petLog`.
- `js/backup.js` export/import round-trips the field with no change (it serialises the
  whole world).
- D1 sync picks it up through the normal `App.save.set` → push path.

## `App.room` API additions

### `isInteractive(id) -> boolean`

`true` when the catalog entry for `id` has `interactive: true`. `false` for unknown ids.

### `toggleItem(world, id) -> { ok, on } | { ok: false }`

- If `id` is **placed** and **interactive**: flip its `on` (treating missing as
  `false`), return `{ ok: true, on: <new value> }`.
- Otherwise (not placed, or not interactive): return `{ ok: false }`, change nothing.

There is exactly one placement per item id (`place()` filters `p.item !== id`), so the
target placement is unambiguous.

### Unchanged

`buy`, `place`, `pickUp`, `priceOf`, `canBuy`, `cellOccupied` — no changes. Interactive
items buy and place exactly like any other.

## Rendering & interaction (`renderRoom`)

`renderRoom(container, world, opts)` stays "presentation only" — it wires DOM events to
callbacks the caller supplies, the way `opts.onPlaceCell` already works. It does not
call `toggleItem` itself.

### FX overlay map

A module-level constant in `js/room.js`:

```js
const FX = {
  tv:    '<span class="fx fx-tv"></span>',
  notes: '<span class="fx fx-notes"><i>♪</i><i>♫</i><i>♪</i></span>',
  lava:  '<span class="fx fx-lava"><i></i><i></i><i></i></span>',
};
```

### Decoration layer

When building `.decolayer` from `world.room.placed`, for an interactive item:

- add `data-interactive` to the `.deco` span, and class `on` when `p.on` is truthy
  (class `off` otherwise — kept for CSS/So the cursor rule can target either);
- when `on`, append `FX[effect]` inside the `.deco` span.

Non-interactive items render exactly as today.

### Pointer events

- `.decolayer` stays `pointer-events: none`.
- Interactive `.deco` spans get `pointer-events: auto` **only when `!opts.placeMode`**.
  In place mode they stay inert so the grid owns every tap (place / pick up).

### Toggle wiring

When `!opts.placeMode` **and** `opts.onToggle` is a function, `renderRoom` attaches a
`click` listener to every `[data-interactive]` span that calls
`opts.onToggle(span.dataset.item)`.

`renderRoom` rewrites `.decolayer` innerHTML on every call, so the spans (and their
listeners) are freshly created each render — no stale-listener accumulation. The normal
room view has no room-level click handler (only the bedroom scene does), so a toggle
tap has nothing to bubble into.

`opts.onToggle` is ignored in place mode.

## `gamescreen` wiring (`js/gamescreen.js`)

### `showRoom()` helper

```js
function showRoom() {
  App.room.renderRoom(document.getElementById("stage"), world, { onToggle: handleToggleItem });
}
```

Replaces the bare `App.room.renderRoom(stage, world, {})` calls that show the plain
room today:

- in `boot()` (after the shell is built),
- in `exitBedroom()`,
- in `plainRoom()` (used by `exitArrange()` and the Decorate → Shop tab).

Place-mode renders (`fillArrange`) and the bedroom scene are **not** routed through
`showRoom()` — they keep their current `renderRoom` calls.

### `handleToggleItem(id)`

```js
function handleToggleItem(id) {
  const r = App.room.toggleItem(world, id);
  if (!r.ok) return;
  persist();
  showRoom();          // re-render decolayer so the effect appears / disappears
}
```

`renderRoom` only rewrites `.decolayer` innerHTML (plus the grid); the room shell and
the mounted pet are left in place, so a toggle re-render is cheap and does not disturb
the pet or its position.

## Sprites (`tools/gen-art.mjs`)

Three new `DECO_ART` pixel-grid entries — `tv`, `stereo`, `lavalamp` — and their ids
added to the `DECO` list. `node tools/gen-art.mjs` regenerates
`potato-pet/assets/sprites/deco/*.png` (deterministic, no deps). These are the **off**
sprites; the **on** state is the CSS `.fx` overlay drawn on top. The existing
letter-fallback in `renderRoom` covers a missing PNG.

## CSS (`styles.css`)

- `.deco[data-interactive] { cursor: pointer; }` (normal view; place mode sets
  `pointer-events: none` so the cursor is moot there).
- `.fx` — absolute, fills the `.deco` box, `pointer-events: none`, sits above the
  sprite.
- `.fx-tv` — a bluish glow rectangle over the screen area; `@keyframes tv-flicker`
  pulses `opacity` / `filter: brightness()` on a short, slightly irregular loop.
- `.fx-notes i` — the note glyphs, absolutely placed near the top of the item;
  `@keyframes note-float` rises, drifts sideways, fades; each `i` gets a different
  `animation-delay` and slight `left` offset so they stagger.
- `.fx-lava i` — 2–3 rounded blobs inside the lamp body; `@keyframes lava-blob` eases
  each up and down with an offset phase.
- `@media (prefers-reduced-motion: reduce)` — effects render a **static** "on" state:
  the TV glow is shown but not pulsing, the lava blobs sit still, the music notes are
  hidden (a static note would just be clutter).

## Testing

### Headless (`js/room.tests.js`)

- CATALOG length is now 27; existing "ids unique / every item has a known set / a
  premium item exists / each set non-empty" assertions updated for the `gadgets` set.
- At least 3 CATALOG entries have `interactive: true`; every such entry also has a
  non-empty string `effect` and `set === "gadgets"`.
- `App.room.isInteractive("tv") === true`; `App.room.isInteractive("rug") === false`;
  `App.room.isInteractive("nope") === false`.
- Buy + place `tv`, then:
  - `toggleItem(world, "tv")` → `{ ok: true, on: true }`, and the placed entry's
    `on === true`;
  - `toggleItem(world, "tv")` again → `{ ok: true, on: false }`.
- `toggleItem(world, "tv")` when `tv` is **not placed** → `{ ok: false }`, nothing
  added to `placed`.
- Place `rug` (non-interactive), `toggleItem(world, "rug")` → `{ ok: false }`, and the
  `rug` placement never gains an `on` key.

### Browser verification

- Shop → buy TV, Stereo, Lava Lamp (grouped under "Gadgets").
- Arrange → place all three; back to the normal room.
- Tap each: TV screen glows/flickers, stereo sheds drifting notes, lamp blobs move.
  Tap again → each stops, sprite returns to plain.
- Reload → items left on are still on; items left off are still off.
- Enter Arrange again → tapping the items places/picks-up as before (no toggle);
  leave Arrange → toggling works again.
- Drag the pet around / pet it → unaffected by the interactive items.

## Files touched

| File | Change |
|------|--------|
| `potato-pet/js/room.js` | `interactive`/`effect` CATALOG fields; 3 new entries; `gadgets` SET; `FX` map; `isInteractive`; `toggleItem`; `renderRoom` interactive spans + pointer-events + `onToggle` wiring |
| `potato-pet/js/room.tests.js` | interactive-item + `toggleItem` assertions; catalog-count/set updates |
| `potato-pet/js/gamescreen.js` | `showRoom()` helper; `handleToggleItem`; route `boot`/`exitBedroom`/`plainRoom` through `showRoom()` |
| `potato-pet/styles.css` | `.deco[data-interactive]`; `.fx` + `.fx-tv`/`.fx-notes`/`.fx-lava`; keyframes; reduced-motion fallback |
| `tools/gen-art.mjs` | `tv`/`stereo`/`lavalamp` in `DECO` + `DECO_ART` |
| `potato-pet/assets/sprites/deco/{tv,stereo,lavalamp}.png` | regenerated |

No `save.js` version bump. No `state.js` / `interactions.js` changes.

## Out of scope (later specs)

- Bulk content expansion (many more decorations / themed sets).
- Multi-cell item footprints; wall vs floor placement zones; rendering items larger
  than one cell.
- A decoration score / base rating / visitors.
- Pet reactions to interactive items.
- Audio.
- Non-toggle behaviour types (ambient-always-on items, multi-state items).
