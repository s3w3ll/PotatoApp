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
