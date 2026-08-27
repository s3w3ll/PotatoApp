window.App = window.App || {};
App.facts = (function () {
  function tellSomething(world) {
    const all = App.content.facts;
    let unseen = all.filter(f => !world.learn.factsSeen.includes(f.id));
    if (unseen.length === 0) { world.learn.factsSeen = []; unseen = all.slice(); }
    const chosen = unseen[Math.floor(Math.random() * unseen.length)];
    world.learn.factsSeen.push(chosen.id);
    return chosen;
  }
  function factOfTheDay(date) {
    const d = date || new Date();
    const key = d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
    const all = App.content.facts;
    return all[App.rng.hashCode(key) % all.length];
  }
  return { tellSomething, factOfTheDay };
})();
