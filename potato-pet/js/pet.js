window.App = window.App || {};
App.pet = (function () {
  const SCALE = 1.5;
  let el = null, bubble = null, bubbleTimer = null, world = null;
  let stepTimer = null, ambient = "idle", col = 0;

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

  function mount(container, w) {
    world = w;
    stop();
    container.innerHTML =
      '<div class="stage">' +
        '<div class="speech" hidden></div>' +
        '<div class="pet pixel" data-mood="happy"></div>' +
      '</div>';
    el = container.querySelector(".pet");
    bubble = container.querySelector(".speech");
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

  function speak(text, ms) {
    if (!bubble) return;
    bubble.textContent = text;
    bubble.hidden = false;
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => { bubble.hidden = true; }, ms || 3500);
  }

  return { mount, render, playAnim, speak };
})();
