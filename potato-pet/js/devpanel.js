window.App = window.App || {};
App.devpanel = (function () {
  function mount(world) {
    const p = document.createElement("div");
    p.id = "devpanel";
    p.style.cssText = "position:fixed;right:6px;bottom:6px;background:#fff;border:2px solid #000;" +
      "padding:6px;font:11px monospace;display:flex;flex-direction:column;gap:4px;z-index:9999";
    const btn = (label, fn) => {
      const b = document.createElement("button"); b.textContent = label;
      b.style.font = "11px monospace"; b.style.padding = "2px 4px";
      b.addEventListener("click", fn); p.appendChild(b);
    };
    const bump = () => { App.state.tickNeeds(world, Date.now()); App.gamescreen.refresh(); App.save.set(world); };
    btn("skip 1 day",  () => { world.pet.lastTick -= 86400000; bump(); });
    btn("skip 1 week", () => { world.pet.lastTick -= 7 * 86400000; bump(); });
    btn("+100 stars",  () => { world.stars += 100; App.gamescreen.refresh(); App.save.set(world); });
    btn("force mood",  () => {
      const n = world.pet.needs; const k = ["hunger","energy","fun"][Math.floor(Math.random()*3)];
      n[k] = 26; App.gamescreen.refresh(); App.save.set(world);
    });
    btn("show backup string", () => window.prompt("Backup string:", App.backup.exportString(world)));
    btn("corrupt save", () => {
      localStorage.setItem("potato-pet:world:" + world.code, "{broken");
      location.reload();
    });
    btn("reset this pet", async () => { await App.save.remove(world.code); location.reload(); });
    const backup = App.save._readBackup(world.code);
    if (backup && backup.world) {
      const when = new Date(backup.replacedAt).toLocaleString();
      btn("restore previous state (" + when + ")", async () => {
        if (!window.confirm("Replace the current pet with the backup from " + when + "?")) return;
        const restored = backup.world;
        restored.savedAt = Date.now();
        await App.save.set(restored);
        location.reload();
      });
    }
    document.body.appendChild(p);
  }
  return { mount };
})();
