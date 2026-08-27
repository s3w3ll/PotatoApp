# Potato Pet

A gentle browser virtual pet for a 10-year-old. Local-first; optional cloud sync via a short code (Phase 2).

## Run it
- **Easiest:** open `index.html` by double-clicking it.
- **With auto-reload:** in VS Code, install the "Live Server" extension,
  right-click `index.html` → "Open with Live Server".

## Run the logic tests 
Open `tests.html`. All lines should say `ok`.
Headless: `node run-suite.mjs` from this folder (needs Node 20+). Prints `N / N passed`.

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

## Regenerate the art
The sprites in `assets/sprites/` are generated, not hand-drawn files.
Edit the pixel grids in `tools/gen-art.mjs`, then:
  cd tools && npm run gen
Output is deterministic — re-running with no edits changes nothing.
`node gen-art.mjs --preview` prints ASCII of every sprite without writing.

## Cloud sync (optional)
Off by default. To turn it on, follow `../worker/SETUP.md` and set
`apiBase` in `js/config.js`. With it off, the game is 100% local.

## What's next
- Phase 3 shipped generated pixel-art sprites for the pet, room, and
  decorations (see "Regenerate the art"). Every sprite still degrades to
  the old coloured-block / first-letter visual if an asset is missing.
