window.App = window.App || {};
App.gamescreen = (function () {
  let container = null, world = null, hideRound = null;
  const roundHistory = { math: [], spell: [] };

  function boot(el, w) {
    container = el; world = w;
    el.innerHTML =
      '<header class="hud"><span id="stars">★ 0</span>' +
      '<button id="rename" title="rename">✏️</button></header>' +
      '<div id="stage"></div>' +
      '<nav class="actions">' +
        '<button data-act="feed">Feed</button>' +
        '<button data-act="bed">Bed</button>' +
        '<button data-act="hide">Hide &amp; Seek</button>' +
        '<button data-act="decorate">Decorate</button>' +
        '<button data-act="learn">Learn</button>' +
        '<button data-act="fact">Tell me something</button>' +
      '</nav><section id="panel"></section>';
    App.pet.mount(document.getElementById("stage"), world);
    App.state.tickNeeds(world, Date.now());
    el.querySelectorAll(".actions button").forEach(b =>
      b.addEventListener("click", () => onAction(b.dataset.act)));
    el.querySelector("#rename").addEventListener("click", renamePrompt);
    App.pet.speak(pick(App.content.greetings));
    refresh();
  }

  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function persist() { App.save.set(world); }

  function refresh() {
    document.getElementById("stars").textContent = "★ " + world.stars;
    App.pet.render(App.state.deriveMood(world));
    const bed = container.querySelector('[data-act="bed"]');
    if (bed) bed.disabled = !App.interactions.canSleep(world);
  }

  function onAction(act) {
    const panel = document.getElementById("panel");
    panel.innerHTML = "";
    if (act === "feed") {
      panel.innerHTML = App.interactions.FOODS.map(f =>
        '<button data-food="' + f + '">' + f + '</button>').join("");
      panel.querySelectorAll("[data-food]").forEach(b => b.addEventListener("click", () => {
        App.interactions.feed(world, b.dataset.food); persist(); refresh(); panel.innerHTML = "";
      }));
    } else if (act === "bed") {
      const r = App.interactions.putToBed(world);
      if (r.ok) { persist(); refresh(); }
    } else if (act === "hide") {
      hideRound = App.interactions.newHideRound(world);
      panel.innerHTML = '<p>Find me!</p>' + hideRound.spots.map(i =>
        '<button data-spot="' + i + '">spot ' + (i + 1) + '</button>').join("");
      panel.querySelectorAll("[data-spot]").forEach(b => b.addEventListener("click", () => {
        const res = App.interactions.guessSpot(hideRound, world, +b.dataset.spot);
        if (res.found) { persist(); refresh(); panel.innerHTML = "<p>Yay! You found me!</p>"; }
        else { b.disabled = true; }
      }));
    } else if (act === "decorate") {
      renderShop(panel);
    } else if (act === "learn") {
      renderLearnMenu(panel);
    } else if (act === "fact") {
      const f = App.facts.tellSomething(world);
      App.pet.speak(f.text, 6000); persist();
    }
  }

  function renderShop(panel) {
    panel.innerHTML = '<h3>Star Shop</h3>' + App.room.CATALOG.map(c => {
      const owned = world.room.owned.includes(c.id);
      return '<button data-buy="' + c.id + '"' + (owned || !App.room.canBuy(world, c.id) ? ' disabled' : '') +
        '><span class="shopicon pixel" style="background-image:url(assets/sprites/deco/' + c.id + '.png)"></span>' +
        c.label + (owned ? ' ✓' : ' — ★' + c.price) + '</button>';
    }).join("") + '<div id="roomwrap"></div><p><button id="placemode">Place items</button></p>' +
      '<p><button id="backupbtn">Backup</button> <button id="restorebtn">Restore</button></p>';
    App.room.renderRoom(document.getElementById("roomwrap"), world, {});
    panel.querySelectorAll("[data-buy]").forEach(b => b.addEventListener("click", () => {
      if (App.room.buy(world, b.dataset.buy).ok) { persist(); refresh(); renderShop(panel); }
    }));
    panel.querySelector("#placemode").addEventListener("click", () => enterPlaceMode(panel));
    panel.querySelector("#backupbtn").addEventListener("click", () =>
      window.prompt("Copy this and keep it safe:", App.backup.exportString(world)));
    panel.querySelector("#restorebtn").addEventListener("click", async () => {
      const text = window.prompt("Paste your backup string:");
      if (!text) return;
      const res = App.backup.importString(text);
      if (!res.ok) { alert("That backup didn't look right."); return; }
      await App.save.set(res.world);
      location.reload();
    });
  }

  function enterPlaceMode(panel) {
    const owned = world.room.owned.slice();
    let selected = owned[0];
    panel.innerHTML = '<h3>Place items</h3><p>Pick an item, then tap a square. Tap a placed item to pick it up.</p>' +
      owned.map(id => '<button data-sel="' + id + '">' + id + '</button>').join("") +
      '<div id="roomwrap"></div><p><button id="doneplace">Done</button></p>';
    const draw = () => App.room.renderRoom(document.getElementById("roomwrap"), world, {
      placeMode: true,
      onPlaceCell: (x, y) => {
        const hit = world.room.placed.find(p => p.x === x && p.y === y);
        if (hit) App.room.pickUp(world, hit.item);
        else App.room.place(world, selected, x, y);
        persist(); draw();
      }
    });
    panel.querySelectorAll("[data-sel]").forEach(b => b.addEventListener("click", () => { selected = b.dataset.sel; }));
    panel.querySelector("#doneplace").addEventListener("click", () => renderShop(panel));
    draw();
  }

  function renderLearnMenu(panel) {
    panel.innerHTML =
      '<h3>Learn together</h3>' +
      '<button id="math">Math Dash (level ' + world.learn.game.mathLevel + ')</button> ' +
      '<button id="spell">Spelling Pop (level ' + world.learn.game.spellingLevel + ')</button>';
    panel.querySelector("#math").addEventListener("click", () => playRound(panel, "math"));
    panel.querySelector("#spell").addEventListener("click", () => playRound(panel, "spell"));
  }

  function playRound(panel, kind) {
    const key = kind === "math" ? "mathLevel" : "spellingLevel";
    const level = world.learn.game[key];
    const rand = App.rng.mulberry32(Date.now() >>> 0);
    const round = App.games.runRound(kind === "math" ? "math" : "spelling", level, rand);
    let i = 0, correct = 0, streak = 0, best = 0;
    const next = () => {
      if (i >= round.questions.length) return finish();
      const q = round.questions[i];
      const prompt = kind === "math" ? q.prompt : "Which spelling is right?";
      const opts = q.options;
      const answer = kind === "math" ? q.answer : q.word;
      panel.innerHTML = '<p>Question ' + (i + 1) + ' / ' + round.questions.length + '</p><h3>' + prompt + '</h3>' +
        (kind === "spell" ? '<p><em>(listen)</em></p>' : '') +
        opts.map(o => '<button data-opt="' + o + '">' + o + '</button>').join("");
      if (kind === "spell" && window.speechSynthesis) {
        try { speechSynthesis.speak(new SpeechSynthesisUtterance(q.word)); } catch (_) {}
      }
      panel.querySelectorAll("[data-opt]").forEach(b => b.addEventListener("click", () => {
        const ok = String(b.dataset.opt) === String(answer);
        if (ok) { correct++; streak++; best = Math.max(best, streak); App.pet.speak("Yes! 🎉"); }
        else { streak = 0; App.pet.speak("Good try — next one!"); }
        i++; next();
      }));
    };
    const finish = () => {
      const gained = App.games.scoreRound(correct, best);
      world.stars += gained;
      world.learn.game.bestStreak = Math.max(world.learn.game.bestStreak, best);
      persist(); refresh();
      roundHistory[kind].push({ correct: correct, total: round.questions.length });
      const offer = App.games.shouldOfferLevelUp(roundHistory[kind]);
      panel.innerHTML = '<h3>Round done!</h3><p>' + correct + ' / ' + round.questions.length +
        ' right · +★' + gained + '</p>' +
        (offer ? '<p><button id="levelup">Try a harder level</button></p>' : '') +
        '<p><button id="again">Play again</button> <button id="back">Back</button></p>';
      if (offer) panel.querySelector("#levelup").addEventListener("click", () => {
        world.learn.game[key] = Math.min(kind === "math" ? 4 : 3, level + 1); persist(); renderLearnMenu(panel);
      });
      panel.querySelector("#again").addEventListener("click", () => playRound(panel, kind));
      panel.querySelector("#back").addEventListener("click", () => renderLearnMenu(panel));
    };
    next();
  }

  function renamePrompt() {
    const raw = prompt("New name for your pet:");
    if (raw == null) return;
    const res = App.content.validateName(raw);
    if (!res.ok) { alert(res.reason === "length" ? "1 to 16 letters please." : "Let's pick a kinder name."); return; }
    world.pet.name = res.value; persist();
  }

  return { boot, refresh };
})();
