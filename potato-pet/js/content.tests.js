window.__pushTests(function contentTests() {
  const c = App.content;
  assert("greetings present", Array.isArray(c.greetings) && c.greetings.length >= 4);
  assert("affirmations present", c.affirmations.length >= 12);
  assert("petLines present",
    Array.isArray(c.petLines) && c.petLines.length >= 3 && c.petLines.every(s => s.length > 0));
  assert("sleepPraise present",
    Array.isArray(c.sleepPraise) && c.sleepPraise.length >= 2 && c.sleepPraise.every(s => s.length > 0));
  assert("sleepNudge present",
    Array.isArray(c.sleepNudge) && c.sleepNudge.length >= 2 && c.sleepNudge.every(s => s.length > 0));
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
    const words = list.map(e => e.word);
    assertEq("spelling L" + lvl + " no dupes", words.length, new Set(words).size);
    assert("spelling L" + lvl + " lowercase words", words.every(w => w === w.toLowerCase()));
    assert("spelling L" + lvl + " every entry has a clue",
      list.every(e => typeof e.clue === "string" && e.clue.length > 0));
    assert("spelling L" + lvl + " clue never contains its word",
      list.every(e => !e.clue.toLowerCase().includes(e.word.toLowerCase())));
    if (lvl === 3) assert("spelling L3 clues are fill-in-the-blank",
      list.every(e => e.clue.includes("___")));
  });

  assertEq("name ok", c.validateName("  Shelly "), { ok: true, value: "Shelly" });
  assertEq("name too long",
    c.validateName("x".repeat(17)), { ok: false, reason: "length" });
  assertEq("name empty", c.validateName("   "), { ok: false, reason: "length" });
  // pick a real entry from RUDE_WORDS so this stays in sync
  const bad = c.RUDE_WORDS[0];
  assertEq("name blocked", c.validateName(bad), { ok: false, reason: "blocked" });
});
