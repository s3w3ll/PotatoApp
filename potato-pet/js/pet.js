window.App = window.App || {};
App.pet = (function () {
  let el = null, bubble = null, bubbleTimer = null, world = null;

  function mount(container, w) {
    world = w;
    container.innerHTML =
      '<div class="stage">' +
        '<div class="speech" hidden></div>' +
        '<div class="pet pixel" data-mood="happy"></div>' +
      '</div>';
    el = container.querySelector(".pet");
    bubble = container.querySelector(".speech");
    const m = App.sprites.manifest[world.pet.species] || { placeholderColor: "#999" };
    el.style.background = m.placeholderColor;
    el.style.filter = "hue-rotate(" + (world.pet.tint || 0) + "deg)";
  }
  function render(mood) {
    if (el) el.setAttribute("data-mood", mood);
  }
  function playAnim(name, done) {
    if (!el) { if (done) done(); return; }
    const a = App.sprites.animFor(world.pet.species, name);
    const ms = Math.max(400, (a.frames / a.fps) * 1000);
    const cls = "anim-" + name;
    el.classList.add(cls);
    setTimeout(() => { el.classList.remove(cls); if (done) done(); }, ms);
  }
  function speak(text, ms) {
    if (!bubble) return;
    bubble.textContent = text;
    bubble.hidden = false;
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => { bubble.hidden = true; }, ms || 3500);
  }
  return { mount, render, playAnim, speak };
})();
