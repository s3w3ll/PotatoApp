window.App = window.App || {};

function showOverlay(msg) {
  const o = document.getElementById("overlay");
  o.innerHTML = "<div><p>" + msg + "</p><button onclick=\"location.reload()\">Reload</button></div>";
  o.hidden = false;
}
window.addEventListener("error", (e) => {
  e.preventDefault();
  const name = App.state.world && App.state.world.pet ? App.state.world.pet.name : "Your pet";
  showOverlay("Uh oh, " + (name || "your pet") + " tripped! 🩹");
});
window.addEventListener("unhandledrejection", (e) => {
  e.preventDefault();
  const name = App.state.world && App.state.world.pet ? App.state.world.pet.name : "Your pet";
  showOverlay("Uh oh, " + (name || "your pet") + " tripped! 🩹");
});

let tickHandle = null;
function startTick() {
  clearInterval(tickHandle);
  tickHandle = setInterval(() => {
    if (!App.state.world) return;
    // Paused while the tab is hidden — the gap is caught up (gently) on return.
    if (typeof document !== "undefined" && document.hidden) return;
    App.state.tickNeeds(App.state.world, Date.now());
    App.gamescreen.refresh();
    App.save.set(App.state.world);
  }, 15000);
}

// Coming back to a visible tab: catch up the hidden stretch at the offline rate,
// so a tab left in the background decays like the app was closed, not open.
document.addEventListener("visibilitychange", () => {
  if (document.hidden || !App.state.world) return;
  App.state.tickNeeds(App.state.world, Date.now(), { offline: true });
  App.gamescreen.refresh();
  App.save.set(App.state.world);
});

window.addEventListener("DOMContentLoaded", () => {
  const app = document.getElementById("app");
  App.startscreen.render(app, {
    onReady: world => {
      App.state.world = world;
      App.gamescreen.boot(app, world);
      startTick();
      if (location.search.indexOf("dev") !== -1 && App.devpanel) App.devpanel.mount(world);
    }
  });
});
