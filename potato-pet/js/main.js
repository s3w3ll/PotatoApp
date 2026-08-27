window.App = window.App || {};
window.addEventListener("DOMContentLoaded", () => {
  App.startscreen.render(document.getElementById("app"), {
    onReady: world => { document.getElementById("app").textContent =
      "Ready: " + world.pet.name + " (" + world.code + ")"; }
  });
});
