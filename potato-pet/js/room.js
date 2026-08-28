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
  // Presentation only — no buy/place/bounds logic lives here. Builds the room
  // shell once (framed box + wall band + a .pethost the pet is mounted into by
  // gamescreen), then refreshes just the decoration layer and the place-mode
  // grid on every call, so re-rendering during place mode never disturbs the pet.
  function renderRoom(container, world, opts) {
    opts = opts || {};
    const theme = world.room.theme;
    let room = container.querySelector(".room");
    if (!room || room.dataset.theme !== theme) {
      container.innerHTML =
        '<div class="room theme-' + theme + '" data-theme="' + theme + '"' +
          ' style="background-image:url(assets/sprites/room/floor-' + theme + '.png)">' +
        '<div class="wall" style="background-image:url(assets/sprites/room/wall-' + theme + '.png)"></div>' +
        '<div class="decolayer"></div>' +
        '<div class="gridlayer" hidden></div>' +
        '<div class="pethost"></div>' +
        '</div>';
      room = container.querySelector(".room");
    }

    room.querySelector(".decolayer").innerHTML = world.room.placed.map(p => {
      const c = byId(p.item);
      const letter = c ? c.label[0] : "?";
      const left = (p.x + 0.5) / COLS * 100;
      const top = (p.y + 0.5) / ROWS * 100;
      return '<span class="deco pixel" data-item="' + p.item +
        '" style="left:' + left + '%;top:' + top + '%;' +
        'background-image:url(assets/sprites/deco/' + p.item + '.png)">' + letter + '</span>';
    }).join("");

    // deco fallback: if a sprite 404s, reveal the letter
    room.querySelectorAll(".deco").forEach(sp => {
      const probe = new Image();
      probe.onerror = () => sp.classList.add("noimg");
      probe.src = "assets/sprites/deco/" + sp.dataset.item + ".png";
    });

    const grid = room.querySelector(".gridlayer");
    if (opts.placeMode) {
      const cells = [];
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++)
        cells.push('<button class="gcell" data-x="' + x + '" data-y="' + y + '"></button>');
      grid.innerHTML = cells.join("");
      grid.hidden = false;
      if (opts.onPlaceCell) {
        grid.querySelectorAll(".gcell").forEach(btn => btn.addEventListener("click", () => {
          opts.onPlaceCell(+btn.dataset.x, +btn.dataset.y);
        }));
      }
    } else {
      grid.innerHTML = "";
      grid.hidden = true;
    }
  }
  return { COLS, ROWS, CATALOG, priceOf, canBuy, buy, cellOccupied, place, pickUp, renderRoom };
})();
