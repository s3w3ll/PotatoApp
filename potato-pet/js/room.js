window.App = window.App || {};
App.room = (function () {
  const COLS = 12, ROWS = 8;
  // set: which vibe an item belongs to, shown as a subheading in the shop.
  // Any item can still go in any room — set is presentation only.
  const CATALOG = [
    { id: "rug",       label: "Cosy Rug",        price: 0,  kind: "floor",     set: "classic" },
    { id: "lamp",      label: "Warm Lamp",       price: 0,  kind: "furniture", set: "classic" },
    { id: "plant",     label: "Leafy Plant",     price: 0,  kind: "furniture", set: "classic" },
    { id: "poster",    label: "Fun Poster",      price: 0,  kind: "wall",      set: "classic" },
    { id: "beanbag",   label: "Squishy Beanbag", price: 0,  kind: "furniture", set: "classic" },
    { id: "bookshelf", label: "Bookshelf",       price: 12, kind: "furniture", set: "classic" },
    { id: "window",    label: "Sunny Window",    price: 15, kind: "wall",      set: "classic" },
    { id: "ball",      label: "Bouncy Ball",     price: 6,  kind: "toy",       set: "classic" },
    { id: "blocks",    label: "Building Blocks", price: 8,  kind: "toy",       set: "classic" },
    { id: "clock",     label: "Tick-Tock Clock", price: 10, kind: "wall",      set: "classic" },
    { id: "table",     label: "Little Table",    price: 14, kind: "furniture", set: "classic" },
    { id: "cushion",   label: "Star Cushion",    price: 5,  kind: "floor",     set: "classic" },

    { id: "starlamp",  label: "Star Lamp",       price: 18, kind: "furniture", set: "space" },
    { id: "planetrug", label: "Planet Rug",      price: 16, kind: "floor",     set: "space" },
    { id: "rocket",    label: "Rocket Toy",      price: 22, kind: "toy",       set: "space" },
    { id: "galaxyposter", label: "Galaxy Poster", price: 12, kind: "wall",     set: "space" },

    { id: "palm",      label: "Palm Plant",      price: 15, kind: "furniture", set: "beach" },
    { id: "seashell",  label: "Seashell",        price: 6,  kind: "floor",     set: "beach" },
    { id: "sandcastle", label: "Sandcastle",     price: 10, kind: "toy",       set: "beach" },
    { id: "surfboard", label: "Surfboard",       price: 20, kind: "furniture", set: "beach" },

    { id: "fairylights", label: "Fairy Lights",  price: 14, kind: "wall",      set: "garden" },
    { id: "terrarium", label: "Terrarium",       price: 18, kind: "furniture", set: "garden" },
    { id: "toadstool", label: "Toadstool",       price: 8,  kind: "floor",     set: "garden" },
    { id: "birdcage",  label: "Birdcage",        price: 24, kind: "furniture", set: "garden" },

    { id: "tv",       label: "Television", price: 18, kind: "furniture", set: "gadgets", interactive: true, effect: "tv" },
    { id: "stereo",   label: "Stereo",     price: 16, kind: "furniture", set: "gadgets", interactive: true, effect: "notes" },
    { id: "lavalamp", label: "Lava Lamp",  price: 20, kind: "furniture", set: "gadgets", interactive: true, effect: "lava" }
  ];
  const SETS = [
    { id: "classic", label: "Classic" },
    { id: "space",   label: "Space" },
    { id: "beach",   label: "Beach" },
    { id: "garden",  label: "Garden" },
    { id: "gadgets", label: "Gadgets" }
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
  const isInteractive = id => { const c = byId(id); return c ? c.interactive === true : false; };
  function toggleItem(world, id) {
    if (!isInteractive(id)) return { ok: false };
    const p = world.room.placed.find(pl => pl.item === id);
    if (!p) return { ok: false };
    p.on = !p.on;
    return { ok: true, on: p.on };
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
  return { COLS, ROWS, CATALOG, SETS, priceOf, canBuy, buy, cellOccupied, place, pickUp,
           isInteractive, toggleItem, renderRoom };
})();
