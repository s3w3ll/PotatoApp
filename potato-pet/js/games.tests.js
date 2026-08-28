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
        App.content.spellingLists[level].some(e => e.word === q.word));
      assert("spell L"+level+" has clue",
        typeof q.clue === "string" && q.clue.length > 0);
      assert("spell L"+level+" clue omits the answer",
        !q.clue.toLowerCase().includes(q.word.toLowerCase()));
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
