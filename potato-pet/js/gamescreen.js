window.App = window.App || {};
App.gamescreen = (function () {
  let container = null, world = null, hideRound = null, hideMisses = 0;
  let inBedroom = false, tucked = false, petInBed = false;
  // bedroom anchor points (left%, bottom% of the room box)
  const DOOR_POS = { left: 82, bottom: 6 };
  const BED_POS = { left: 38, bottom: 11 };
  let inArrange = false;
  let lastCritical = [], lastNudgeAt = 0;
  const roundHistory = { math: [], spell: [] };
  // Spoken when a need bottoms out at 0 — a gentle "here's how to fix it".
  const CRITICAL_LINES = {
    hunger: "My tummy is so empty! Tap 🍎 Feed to help me.",
    energy: "I can barely keep my eyes open… tap 💤 Bed to tuck me in.",
    fun: "I'm so bored! Tap 🙈 Hide & Seek and play with me."
  };
  // hiding-spot anchor points: left% across the floor, bottom% = circle's
  // resting bottom edge above the floor. A gentle arc, all circles fully visible.
  const SPOT_ARC = [
    { l: 8, b: 4 }, { l: 29, b: 12 }, { l: 50, b: 17 }, { l: 71, b: 12 }, { l: 92, b: 4 }
  ];

  function boot(el, w) {
    container = el; world = w;
    el.innerHTML =
      '<header class="hud"><span id="stars">★ 0</span>' +
        '<div class="meters">' +
          '<div class="meter" data-need="hunger"><span class="mi">🍎</span><span class="mbar"><i></i></span></div>' +
          '<div class="meter" data-need="energy"><span class="mi">💤</span><span class="mbar"><i></i></span></div>' +
          '<div class="meter" data-need="fun"><span class="mi">🎮</span><span class="mbar"><i></i></span></div>' +
        '</div>' +
      '</header>' +
      '<div id="stage"></div>' +
      '<nav class="actions">' +
        '<button data-act="feed"><span class="ic">🍎</span>Feed</button>' +
        '<button data-act="bed"><span class="ic">💤</span>Bed</button>' +
        '<button data-act="hide"><span class="ic">🙈</span>Hide &amp; Seek</button>' +
        '<button data-act="decorate"><span class="ic">🎨</span>Decorate</button>' +
        '<button data-act="learn"><span class="ic">📚</span>Learn</button>' +
        '<button data-act="fact"><span class="ic">💬</span>Tell me something</button>' +
      '</nav><section id="panel" hidden></section>';
    const stage = document.getElementById("stage");
    showRoom();
    mountPet(stage.querySelector(".pethost"));
    // one-time catch-up for time the app was closed — the gentle offline rate
    App.state.tickNeeds(world, Date.now(), { offline: true });
    el.querySelectorAll(".actions button").forEach(b =>
      b.addEventListener("click", () => onAction(b.dataset.act)));
    App.pet.speak(pick(App.content.greetings));
    refresh();
  }

  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function persist() { App.save.set(world); }
  const clampPct = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  // Is element a's centre point sitting over element b (with a slop margin)?
  function hitOn(a, b, margin) {
    if (!a || !b) return false;
    const r = a.getBoundingClientRect(), t = b.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    return cx >= t.left - margin && cx <= t.right + margin &&
           cy >= t.top - margin && cy <= t.bottom + margin;
  }

  // ---- direct pet interaction (tap to pet, drag to move) ----
  function handlePet() {
    const r = App.interactions.petPet(world);
    App.pet.heart();
    App.pet.playAnim("happy");
    App.pet.speak(pick(App.content.petLines));
    if (r.starsGained) { persist(); refresh(); }
  }
  function handlePetMoved(left, bottom) {
    world.pet.pos = { left: left, bottom: bottom };
    persist();
  }
  // Mount the pet into a room host with interaction wired, and drop it back
  // wherever the child last left it.
  function mountPet(host) {
    App.pet.mount(host, world, { onPet: handlePet, onMove: handlePetMoved });
    if (world.pet.pos) App.pet.place(world.pet.pos.left, world.pet.pos.bottom);
  }

  function refresh() {
    document.getElementById("stars").textContent = "★ " + world.stars;
    renderMeters();
    nudgeIfCritical();
    App.pet.render(App.state.deriveMood(world));
    const bed = container.querySelector('[data-act="bed"]');
    if (bed) bed.disabled = !App.interactions.canSleep(world);
  }

  // When a need hits 0, tell the kid how to help — once on the way in, then
  // no more than every 2 minutes while it's still empty. Clears on recovery.
  function nudgeIfCritical() {
    const crit = App.state.criticalNeeds(world);
    const now = Date.now();
    const newly = crit.some(k => lastCritical.indexOf(k) === -1);
    lastCritical = crit;
    if (!crit.length) return;
    if (newly || now - lastNudgeAt > 120000) {
      App.pet.speak(CRITICAL_LINES[crit[0]]);
      lastNudgeAt = now;
    }
  }

  function renderMeters() {
    const status = App.state.needStatus(world);
    ["hunger", "energy", "fun"].forEach(k => {
      const m = container.querySelector('.meter[data-need="' + k + '"]');
      if (!m) return;
      const v = Math.max(0, Math.min(100, Math.round(world.pet.needs[k])));
      m.querySelector("i").style.width = v + "%";
      m.classList.toggle("low", status[k] === "low");
    });
  }

  function setActive(act) {
    container.querySelectorAll(".actions button").forEach(b =>
      b.classList.toggle("on", b.dataset.act === act));
  }
  function closeTray() {
    endHideRound();
    if (inBedroom) exitBedroom();
    if (inArrange) exitArrange();
    const panel = document.getElementById("panel");
    panel.innerHTML = ""; panel.hidden = true;
    setActive(null);
  }

  // ---- Bedtime: a hands-on bedroom scene ----
  // The child gets the pet into bed (tap it, or drag it onto the bed), then
  // drags the blanket over it. Each drop gives spoken + visual feedback. Once
  // tucked the pet sleeps with floating Zzz and a hopping sheep until tapped.
  function enterBedroom() {
    inBedroom = true; tucked = false; petInBed = false;
    const stage = document.getElementById("stage");
    stage.innerHTML =
      '<div class="room bedroom theme-bedroom" data-theme="bedroom"' +
        ' style="background-image:url(assets/sprites/room/floor-bedroom.png)">' +
        '<div class="wall" style="background-image:url(assets/sprites/room/wall-bedroom.png)"></div>' +
        '<div class="bed" style="background-image:url(assets/sprites/deco/bed.png)"></div>' +
        '<button class="blanket pixel" disabled style="background-image:url(assets/sprites/deco/blanket.png)"></button>' +
        '<div class="pethost"></div>' +
      '</div>';
    // In the bedroom a tap sends the pet to the bed and a drag lets the child
    // carry it there; neither touches world.pet.pos (the scene owns the layout).
    App.pet.mount(stage.querySelector(".pethost"), world, { onPet: petToBed, onMove: handleBedDrop });
    App.pet.place(DOOR_POS.left, DOOR_POS.bottom);
    wireBlanketDrag(stage.querySelector(".blanket"), stage.querySelector(".bedroom"));
    // tapping anywhere in the room wakes a tucked-in pet
    stage.querySelector(".bedroom").addEventListener("click", () => { if (tucked) wakeUp(); });
    bedroomPanel('<p>Tap me, or drag me onto the bed.</p>');
  }

  function bedroomPanel(inner) {
    const panel = document.getElementById("panel");
    panel.hidden = false;
    panel.innerHTML = '<h3>Bedtime</h3>' + inner + '<p><button id="bedback">Back</button></p>';
    panel.querySelector("#bedback").addEventListener("click", closeTray);
  }

  // Pet tapped in the bedroom: it slides itself onto the bed.
  function petToBed() {
    if (tucked || petInBed) return;
    App.pet.place(BED_POS.left, BED_POS.bottom);
    landOnBed();
  }

  // Pet drag released in the bedroom: land it if it's over the bed, else send
  // it back to the doorway with a nudge.
  function handleBedDrop() {
    if (tucked) return;
    const pet = document.querySelector("#stage .pet");
    const bed = document.querySelector("#stage .bed");
    if (hitOn(pet, bed, 30)) {
      App.pet.place(BED_POS.left, BED_POS.bottom);
      landOnBed();
    } else {
      App.pet.place(DOOR_POS.left, DOOR_POS.bottom);
      App.pet.speak(pick(App.content.sleepNudge));
    }
  }

  // Pet is now settled on the bed — praise, glow the scene, unlock the blanket.
  function landOnBed() {
    if (petInBed) return;
    petInBed = true;
    const scene = document.querySelector("#stage .bedroom");
    if (scene) scene.classList.add("petready");
    const blanket = document.querySelector("#stage .blanket");
    if (blanket) blanket.disabled = false;
    App.pet.speak(pick(App.content.sleepPraise));
    bedroomPanel('<p>Now drag the blanket over me.</p>');
  }

  // The blanket is a draggable button: a plain tap tucks; a drag tucks only if
  // it lands on the pet, otherwise it folds back and the pet gives a hint.
  function wireBlanketDrag(blanket, scene) {
    if (!blanket || !scene) return;
    let sx = 0, sy = 0, moved = false, id = null;
    blanket.addEventListener("pointerdown", e => {
      if (blanket.disabled) return;
      sx = e.clientX; sy = e.clientY; moved = false; id = e.pointerId;
      try { blanket.setPointerCapture(e.pointerId); } catch (_) {}
    });
    blanket.addEventListener("pointermove", e => {
      if (id !== e.pointerId) return;
      if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) < 6) return;
      moved = true;
      blanket.classList.add("dragging");
      const box = scene.getBoundingClientRect();
      blanket.style.left = clampPct((e.clientX - box.left) / box.width * 100, 6, 94) + "%";
      blanket.style.bottom = clampPct((box.bottom - e.clientY) / box.height * 100, 2, 62) + "%";
    });
    const done = e => {
      if (id !== e.pointerId) return;
      id = null;
      try { blanket.releasePointerCapture(e.pointerId); } catch (_) {}
      blanket.classList.remove("dragging");
      if (!moved) { tuckIn(); return; }
      const pet = document.querySelector("#stage .pet");
      if (hitOn(blanket, pet, 26)) {
        tuckIn();
      } else {
        blanket.style.left = ""; blanket.style.bottom = "";
        App.pet.speak(pick(App.content.sleepNudge));
      }
    };
    blanket.addEventListener("pointerup", done);
    blanket.addEventListener("pointercancel", done);
  }

  function tuckIn() {
    if (tucked || !petInBed) return;
    tucked = true;
    App.pet.setInteractive(false);
    const scene = document.querySelector("#stage .bedroom");
    if (scene) { scene.classList.remove("petready"); scene.classList.add("tucked"); }
    const blanket = document.querySelector("#stage .blanket");
    if (blanket) { blanket.style.left = ""; blanket.style.bottom = ""; blanket.disabled = true; }
    App.pet.render("sleepy");
    App.pet.speak(pick(App.content.bedtime));
    startSleepFx();
    bedroomPanel('<p>Shhh… tap me to wake me up.</p>');
  }

  // Floating Zzz + a sheep hopping past the bed while the pet sleeps.
  function startSleepFx() {
    const scene = document.querySelector("#stage .bedroom");
    if (!scene || scene.querySelector(".sleepfx")) return;
    const fx = document.createElement("div");
    fx.className = "sleepfx";
    fx.innerHTML =
      '<div class="zzz"><span>z</span><span>z</span><span>z</span></div>' +
      '<div class="sheep pixel" style="background-image:url(assets/sprites/deco/sheep.png)"></div>';
    scene.appendChild(fx);
  }
  function stopSleepFx() {
    const fx = document.querySelector("#stage .sleepfx");
    if (fx) fx.remove();
  }

  function wakeUp() {
    if (!tucked) return;
    tucked = false; petInBed = false;
    App.pet.setInteractive(true);
    stopSleepFx();
    const r = App.interactions.putToBed(world);
    persist();
    const scene = document.querySelector("#stage .bedroom");
    if (scene) scene.classList.remove("tucked");
    refresh();
    App.pet.playAnim("happy");
    App.pet.speak("Good morning!");
    bedroomPanel('<p>All rested! <strong>+★' + (r.ok ? r.starsGained : 0) + '</strong></p>');
  }

  function exitBedroom() {
    inBedroom = false; tucked = false; petInBed = false;
    stopSleepFx();
    const stage = document.getElementById("stage");
    stage.innerHTML = "";
    showRoom();
    mountPet(stage.querySelector(".pethost"));
    refresh();
  }

  // ---- Hide & Seek ----
  function endHideRound() {
    const layer = document.querySelector("#stage .room .hidelayer");
    if (layer) layer.remove();
    App.pet.setInteractive(true);
    if (world.pet.pos) App.pet.place(world.pet.pos.left, world.pet.pos.bottom);
    else App.pet.home();
  }

  function hidePromptHTML() {
    return '<h3>Hide &amp; Seek</h3><p>Tap where I\'m hiding!</p>' +
      '<p class="giggles">giggles heard: ' + hideMisses + '</p>';
  }

  function popSpot(el, after) {
    if (!el) { if (after) after(); return; }
    el.style.pointerEvents = "none";
    el.classList.add("pop");
    setTimeout(() => { el.remove(); if (after) after(); }, 260);
  }

  function onSpotClick(spot, el) {
    const layer = el.parentElement;
    const res = App.interactions.guessSpot(hideRound, world, spot);
    if (res.found) {
      App.interactions.spendEnergy(world, App.interactions.HIDE_ENERGY_COST);
      persist(); refresh();
      popSpot(el, () => {
        layer.querySelectorAll(".spot").forEach(s => popSpot(s));
        setTimeout(() => {
          endHideRound();
          const panel = document.getElementById("panel");
          panel.hidden = false;
          panel.innerHTML = '<h3>Hide &amp; Seek</h3><p>You found me! <strong>+★4</strong></p>' +
            '<p><button id="hideagain">Play again</button></p>';
          panel.querySelector("#hideagain").addEventListener("click", startHideRound);
        }, 300);
      });
      return;
    }
    hideMisses++;
    document.getElementById("panel").innerHTML = hidePromptHTML();
    popSpot(el, () => {
      const left = layer.querySelectorAll(".spot");
      if (left.length === 1) setTimeout(() => onSpotClick(+left[0].dataset.spot, left[0]), 350);
    });
  }

  function startHideRound() {
    endHideRound();
    App.pet.setInteractive(false);   // no petting/dragging while the pet is hiding
    hideRound = App.interactions.newHideRound(world);
    hideMisses = 0;
    const room = document.querySelector("#stage .room");
    const layer = document.createElement("div");
    layer.className = "hidelayer";
    layer.innerHTML = hideRound.spots.map(i => {
      const p = SPOT_ARC[i] || SPOT_ARC[0];
      return '<button class="spot s' + i + '" data-spot="' + i +
        '" style="left:' + p.l + '%;bottom:' + p.b + '%"></button>';
    }).join("");
    room.appendChild(layer);
    // Line the pet's feet up with the circle's bottom edge; the circle is
    // taller than the pet, so its top curve covers the pet's head. z-order
    // (.pethost z3 < .hidelayer z4) keeps the circle painted in front.
    const hp = SPOT_ARC[hideRound.hidingSpot] || SPOT_ARC[0];
    App.pet.place(hp.l, hp.b);
    // Flush layout so the .in transition animates from the off-screen start
    // state. rAF would be cleaner but never fires while the tab is backgrounded.
    void layer.offsetWidth;
    layer.querySelectorAll(".spot").forEach(s => s.classList.add("in"));
    layer.querySelectorAll(".spot").forEach(b =>
      b.addEventListener("click", () => onSpotClick(+b.dataset.spot, b)));
    const panel = document.getElementById("panel");
    panel.hidden = false;
    panel.innerHTML = hidePromptHTML();
  }
  function flash(act) {
    const b = container.querySelector('[data-act="' + act + '"]');
    if (!b) return;
    b.classList.add("on");
    setTimeout(() => b.classList.remove("on"), 450);
  }

  function onAction(act) {
    const panel = document.getElementById("panel");
    const btn = container.querySelector('[data-act="' + act + '"]');
    const instant = act === "fact";

    // re-tapping the open action collapses its tray
    if (!instant && btn && btn.classList.contains("on")) { closeTray(); return; }

    // leaving Hide & Seek / the bedroom / arrange mode for anything else
    // tears the scene down
    if (act !== "hide") endHideRound();
    if (inBedroom && act !== "bed") exitBedroom();
    if (inArrange && act !== "decorate") exitArrange();

    if (instant) {
      closeTray();
      flash(act);
      const f = App.facts.tellSomething(world);
      App.pet.speak(f.text, 6000); persist();
      return;
    }

    setActive(act);
    panel.hidden = false;
    panel.innerHTML = "";

    if (act === "feed") {
      panel.innerHTML = '<h3>Feed</h3><div class="opts">' + App.interactions.FOODS.map(f =>
        '<button data-food="' + f + '">' + f + '</button>').join("") + '</div>';
      panel.querySelectorAll("[data-food]").forEach(b => b.addEventListener("click", () => {
        App.interactions.feed(world, b.dataset.food); persist(); refresh(); closeTray();
      }));
    } else if (act === "bed") {
      if (!App.interactions.canSleep(world)) {
        panel.innerHTML = '<h3>Bedtime</h3><p>I\'m not sleepy yet!</p>';
        App.pet.speak("I'm not sleepy yet!");
      } else {
        enterBedroom();
      }
    } else if (act === "hide") {
      startHideRound();
    } else if (act === "decorate") {
      renderDecorate(panel, "shop");
    } else if (act === "learn") {
      renderLearnMenu(panel);
    }
  }

  // Decorate is one panel with a Shop / Arrange segmented toggle at the top.
  // Shop = buy things; Arrange = a place-mode grid over the room. Switching to
  // Shop (or leaving Decorate) drops the grid; the pet is never re-mounted.
  function plainRoom() {
    showRoom();
  }
  function showRoom() {
    App.room.renderRoom(document.getElementById("stage"), world, { onToggle: handleToggleItem });
  }
  function handleToggleItem(id) {
    if (!App.room.toggleItem(world, id).ok) return;
    persist();
    showRoom();
  }
  function exitArrange() {
    if (!inArrange) return;
    inArrange = false;
    plainRoom();
  }

  function renderDecorate(panel, tab) {
    tab = tab === "arrange" ? "arrange" : "shop";
    inArrange = tab === "arrange";
    panel.hidden = false;
    panel.innerHTML =
      '<div class="segmented">' +
        '<button data-tab="shop"'    + (tab === "shop"    ? ' class="on"' : "") + '>🛍 Shop</button>' +
        '<button data-tab="arrange"' + (tab === "arrange" ? ' class="on"' : "") + '>🎨 Arrange</button>' +
      '</div><div class="decobody"></div>';
    panel.querySelectorAll("[data-tab]").forEach(b =>
      b.addEventListener("click", () => renderDecorate(panel, b.dataset.tab)));
    const body = panel.querySelector(".decobody");
    if (tab === "arrange") fillArrange(body);
    else { plainRoom(); fillShop(panel, body); }
  }

  function fillShop(panel, body) {
    body.innerHTML = App.room.SETS.map(s => {
      const items = App.room.CATALOG.filter(c => c.set === s.id);
      if (!items.length) return "";
      return '<p class="setname">' + s.label + '</p>' + items.map(c => {
        const owned = world.room.owned.includes(c.id);
        return '<button data-buy="' + c.id + '"' +
          (owned || !App.room.canBuy(world, c.id) ? ' disabled' : '') + '>' +
          '<span class="shopicon pixel" style="background-image:url(assets/sprites/deco/' + c.id + '.png)"></span>' +
          c.label + (owned ? ' ✓' : ' — ★' + c.price) + '</button>';
      }).join("");
    }).join("") +
      '<p class="utilrow"><button id="backupbtn">Backup</button> <button id="restorebtn">Restore</button></p>';
    body.querySelectorAll("[data-buy]").forEach(b => b.addEventListener("click", () => {
      if (App.room.buy(world, b.dataset.buy).ok) { persist(); refresh(); fillShop(panel, body); }
    }));
    body.querySelector("#backupbtn").addEventListener("click", () =>
      window.prompt("Copy this and keep it safe:", App.backup.exportString(world)));
    body.querySelector("#restorebtn").addEventListener("click", async () => {
      const text = window.prompt("Paste your backup string:");
      if (!text) return;
      const res = App.backup.importString(text);
      if (!res.ok) { alert("That backup didn't look right."); return; }
      await App.save.set(res.world);
      location.reload();
    });
  }

  function fillArrange(body) {
    const stage = document.getElementById("stage");
    const owned = world.room.owned.slice();
    let selected = owned[0] || null;
    body.innerHTML =
      '<p>Pick an item, then tap a square in the room. Tap a placed item to pick it up.</p>' +
      '<div class="tray">' + owned.map(id =>
        '<span class="trayitem pixel' + (id === selected ? ' sel' : '') + '" data-sel="' + id +
        '" style="background-image:url(assets/sprites/deco/' + id + '.png)" title="' + id + '"></span>').join("") +
      '</div>';
    const draw = () => App.room.renderRoom(stage, world, {
      placeMode: true,
      onPlaceCell: (x, y) => {
        const hit = world.room.placed.find(p => p.x === x && p.y === y);
        if (hit) App.room.pickUp(world, hit.item);
        else if (selected) App.room.place(world, selected, x, y);
        persist(); draw();
      }
    });
    body.querySelectorAll("[data-sel]").forEach(b => b.addEventListener("click", () => {
      selected = b.dataset.sel;
      body.querySelectorAll(".trayitem").forEach(t => t.classList.toggle("sel", t.dataset.sel === selected));
    }));
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
      const prompt = kind === "math" ? q.prompt : q.clue;
      const opts = q.options;
      const answer = kind === "math" ? q.answer : q.word;
      panel.innerHTML = '<p>Question ' + (i + 1) + ' / ' + round.questions.length + '</p><h3>' + prompt + '</h3>' +
        (kind === "spell" ? '<p><em>Pick the correct spelling.</em></p>' : '') +
        opts.map(o => '<button data-opt="' + o + '">' + o + '</button>').join("");
      if (kind === "spell" && window.speechSynthesis) {
        try { speechSynthesis.speak(new SpeechSynthesisUtterance(q.clue)); } catch (_) {}
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
      App.interactions.spendEnergy(world, App.interactions.LEARN_ENERGY_COST);
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

  return { boot, refresh };
})();
