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
    // Ruling R3: collision-skipping monotonic counter (prevents infinite loop)
    let k = 1;
    while (opts.size < count) {
      if (!opts.has(answer + k)) opts.add(answer + k);
      k++;
    }
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
    // Ruling R3: collision-skipping monotonic counter (prevents infinite loop)
    let k = 1;
    while (opts.size < 4) {
      const cand = word + "x".repeat(k);
      if (!opts.has(cand)) opts.add(cand);
      k++;
    }
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
