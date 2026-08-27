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

## Phase 2 — cross-device sync (needs `apiBase` set)

1. Adopt a pet in browser A. Write down the code. Decorate the room a bit.
2. Open browser B (or a private window). "Enter a code" -> type the code.
   The pet, stars, and room should match A.
3. In B: feed the pet, buy/place one decoration. Close the tab (or wait ~35s).
4. Reload A. B's changes appear. Open `index.html?dev` on A — a
   "restore previous state" button is now there; clicking it brings back
   A's pre-sync pet.
5. Turn off wifi. Play in A — everything still works, no errors, no spinners.
   Turn wifi back on, interact once, wait ~35s — the change reaches B on its
   next load.
6. Make a new pet while offline — it should still work (the code is not
   checked); it syncs on the next load.

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
