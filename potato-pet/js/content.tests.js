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
