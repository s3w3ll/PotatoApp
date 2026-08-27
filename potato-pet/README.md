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
