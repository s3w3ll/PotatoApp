window.App = window.App || {};
App.pet = (function () {
  const SCALE = 1.5;
  let el = null, bubble = null, bubbleTimer = null, world = null;
  let stepTimer = null, ambient = "idle", col = 0;
  let onPetCb = null, onMoveCb = null, interactive = true;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  function sheetGeom(species) {
    const m = App.sprites.manifest[species] || { cell: 32, cols: 2, rows: 4 };
    return {
      cell: m.cell * SCALE,
      bgw: m.cols * m.cell * SCALE,
      bgh: m.rows * m.cell * SCALE
    };
  }

  function stop() { if (stepTimer) { clearInterval(stepTimer); stepTimer = null; } }

  function runAnim(name, loop, done) {
    if (!el || el.classList.contains("fallback")) { if (done) done(); return; }
    const a = App.sprites.animFor(world.pet.species, name);
    const g = sheetGeom(world.pet.species);
    stop();
    col = 0;
    const place = () => {
      el.style.backgroundPositionX = -(col * g.cell) + "px";
      el.style.backgroundPositionY = -(a.row * g.cell) + "px";
    };
    place();
    stepTimer = setInterval(() => { col = (col + 1) % a.frames; place(); }, Math.max(60, 1000 / a.fps));
    if (!loop) {
      const ms = Math.max(400, (a.frames / a.fps) * 1000);
      setTimeout(() => { stop(); runAmbient(); if (done) done(); }, ms);
    }
  }

  function runAmbient() { runAnim(ambient, true); }

  function mount(container, w, opts) {
    opts = opts || {};
    onPetCb = opts.onPet || null;
    onMoveCb = opts.onMove || null;
    interactive = true;
    world = w;
    stop();
    container.innerHTML =
      '<div class="stage">' +
        '<div class="pet pixel" data-mood="happy">' +
          '<div class="speech" hidden></div>' +
        '</div>' +
      '</div>';
    el = container.querySelector(".pet");
    bubble = el.querySelector(".speech");
    wireInput();
    const m = App.sprites.manifest[world.pet.species] || { placeholderColor: "#999" };
    const g = sheetGeom(world.pet.species);
    el.style.width = el.style.height = (m.cell ? m.cell * SCALE : 96) + "px";
    el.style.backgroundRepeat = "no-repeat";
    el.style.backgroundSize = g.bgw + "px " + g.bgh + "px";
    const v = App.sprites.variantFor(world.pet.tint);
    const src = m.sheet ? m.sheet(v) : null;
    if (!src) { fallback(m); return; }
    const img = new Image();
    img.onload = () => { el.style.backgroundImage = "url(" + src + ")"; ambient = "idle"; runAmbient(); };
    img.onerror = () => { fallback(m); };
    img.src = src;
  }

  function fallback(m) {
    if (!el) return;
    el.classList.add("fallback");
    el.style.background = m.placeholderColor || "#999";
    el.style.filter = "hue-rotate(" + ((world.pet.tint || 0) % 360) + "deg)";
    console.warn("pet sprite missing, using placeholder block");
  }

  function render(mood) {
    if (!el) return;
    el.setAttribute("data-mood", mood);
    const want = mood === "sleepy" ? "sleep" : "idle";
    if (want !== ambient) { ambient = want; if (!el.classList.contains("fallback")) runAmbient(); }
  }

  function playAnim(name, done) { runAnim(name, false, done); }

  // Move the pet to an arbitrary spot in the room (percent of the room box);
  // home() clears it and lets the stylesheet put the pet back centre-front.
  function place(leftPct, bottomPct) {
    if (!el) return;
    el.style.left = leftPct + "%";
    el.style.bottom = bottomPct + "%";
  }
  function home() {
    if (!el) return;
    el.style.left = "";
    el.style.bottom = "";
  }

  // Direct pet interaction: a tap fires opts.onPet, a drag past a few pixels
  // moves the sprite around the floor and fires opts.onMove(left, bottom) on
  // release. setInteractive(false) suspends both (Hide & Seek, tucked in bed).
  function setInteractive(on) {
    interactive = !!on;
    if (el) el.classList.toggle("nodrag", !on);
  }

  function wireInput() {
    if (!el) return;
    let startX = 0, startY = 0, moved = false, activeId = null;

    el.addEventListener("pointerdown", e => {
      if (!interactive) return;
      startX = e.clientX; startY = e.clientY; moved = false; activeId = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
    });

    el.addEventListener("pointermove", e => {
      if (activeId !== e.pointerId || !onMoveCb) return;
      if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) < 6) return;
      moved = true;
      el.classList.add("dragging");
      const box = el.parentElement.getBoundingClientRect();
      el.style.left = clamp((e.clientX - box.left) / box.width * 100, 4, 96) + "%";
      el.style.bottom = clamp((box.bottom - e.clientY) / box.height * 100, 2, 42) + "%";
    });

    const finish = e => {
      if (activeId !== e.pointerId) return;
      activeId = null;
      try { el.releasePointerCapture(e.pointerId); } catch (_) {}
      el.classList.remove("dragging");
      if (moved) {
        if (onMoveCb) onMoveCb(parseFloat(el.style.left), parseFloat(el.style.bottom));
      } else if (interactive && onPetCb) {
        onPetCb();
      }
    };
    el.addEventListener("pointerup", finish);
    el.addEventListener("pointercancel", finish);
  }

  // A little heart that floats up off the pet when it's patted.
  function heart() {
    if (!el) return;
    const h = document.createElement("span");
    h.className = "heart";
    h.textContent = "💗";
    el.appendChild(h);
    setTimeout(() => h.remove(), 900);
  }

  // Drop a food sprite in front of the pet for the eat animation, then let it
  // shrink away. Lives as a child of .pet so it tracks the pet if it moves.
  function showFood(foodId, ms) {
    if (!el) return;
    const life = ms || 1200;
    const existing = el.querySelector(".food");
    if (existing) existing.remove();
    const food = document.createElement("span");
    food.className = "food pixel";
    food.style.backgroundImage = "url(assets/sprites/food/" + foodId + ".png)";
    el.appendChild(food);
    setTimeout(() => { food.classList.add("gone"); }, Math.max(200, life - 300));
    setTimeout(() => { food.remove(); }, life);
  }

  function speak(text, ms) {
    if (!bubble) return;
    bubble.textContent = text;
    bubble.style.setProperty("--bub-shift", "0px");
    bubble.hidden = false;
    // keep the bubble inside the room; if the centred bubble would clip past
    // an edge, nudge it in (the tail shifts back the other way in CSS).
    const room = el && el.closest(".room");
    if (room) {
      const b = bubble.getBoundingClientRect();
      const r = room.getBoundingClientRect();
      let shift = 0;
      if (b.left < r.left + 4) shift = (r.left + 4) - b.left;
      else if (b.right > r.right - 4) shift = (r.right - 4) - b.right;
      if (shift) bubble.style.setProperty("--bub-shift", Math.round(shift) + "px");
    }
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => { bubble.hidden = true; }, ms || 3500);
  }

  return { mount, render, playAnim, speak, place, home, showFood, heart, setInteractive };
})();
