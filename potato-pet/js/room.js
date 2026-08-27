window.App = window.App || {};
App.room = (function () {
  const COLS = 12, ROWS = 8;
  const CATALOG = [
    { id: "rug",     label: "Cosy Rug",      price: 0,  kind: "floor" },
    { id: "lamp",    label: "Warm Lamp",     price: 0,  kind: "furniture" },
    { id: "plant",   label: "Leafy Plant",   price: 0,  kind: "furniture" },
    { id: "poster",  label: "Fun Poster",    price: 0,  kind: "wall" },
    { id: "beanbag", label: "Squishy Beanbag", price: 0, kind: "furniture" },
    { id: "bookshelf", label: "Bookshelf",   price: 12, kind: "furniture" },
    { id: "window",  label: "Sunny Window",  price: 15, kind: "wall" },
    { id: "ball",    label: "Bouncy Ball",   price: 6,  kind: "toy" },
    { id: "blocks",  label: "Building Blocks", price: 8, kind: "toy" },
    { id: "clock",   label: "Tick-Tock Clock", price: 10, kind: "wall" },
    { id: "table",   label: "Little Table",  price: 14, kind: "furniture" },
    { id: "cushion", label: "Star Cushion",  price: 5,  kind: "floor" }
  ];
  const byId = id => CATALOG.find(c => c.id === id);
  const priceOf = id => { const c = byId(id); return c ? c.price : Infinity; };
  const canBuy = (world, id) => !world.room.owned.includes(id) && world.stars >= priceOf(id);
  function buy(world, id) {
    if (!canBuy(world, id)) return { ok: false };
    world.stars -= priceOf(id);
    world.room.owned.push(id);
    return { ok: true };
  }
  const cellOccupied = (world, x, y) => world.room.placed.some(p => p.x === x && p.y === y);
  function place(world, id, x, y) {
    if (!world.room.owned.includes(id)) return { ok: false, reason: "not-owned" };
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return { ok: false, reason: "out-of-bounds" };
    if (world.room.placed.some(p => p.x === x && p.y === y && p.item !== id))
      return { ok: false, reason: "occupied" };
    world.room.placed = world.room.placed.filter(p => p.item !== id);
    world.room.placed.push({ item: id, x, y });
    return { ok: true };
  }
  function pickUp(world, id) {
    world.room.placed = world.room.placed.filter(p => p.item !== id);
  }
  function renderRoom(container, world, opts) {
    opts = opts || {};
    const cells = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const here = world.room.placed.find(p => p.x === x && p.y === y);
      cells.push(
        '<button class="cell" data-x="' + x + '" data-y="' + y + '">' +
        (here ? '<span class="deco" data-item="' + here.item + '">' +
                (byId(here.item) ? byId(here.item).label[0] : "?") + '</span>' : '') +
        '</button>');
    }
    container.innerHTML = '<div class="room theme-' + world.room.theme + '">' + cells.join("") + '</div>';
    if (opts.placeMode && opts.onPlaceCell) {
      container.querySelectorAll(".cell").forEach(btn => btn.addEventListener("click", () => {
        opts.onPlaceCell(+btn.dataset.x, +btn.dataset.y);
      }));
    }
  }
  return { COLS, ROWS, CATALOG, priceOf, canBuy, buy, cellOccupied, place, pickUp, renderRoom };
})();
