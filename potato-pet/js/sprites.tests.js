window.__pushTests(function spritesTests() {
  const S = App.sprites;
  App.world.SPECIES.forEach(sp => {
    const m = S.manifest[sp];
    assert("manifest has " + sp, !!m);
    assertEq(sp + " cell", m.cell, 32);
    assertEq(sp + " cols", m.cols, 2);
    assertEq(sp + " variants", m.variants, 4);
    assertEq(sp + " rows", m.rows, 4);
    assert(sp + " has placeholderColor", typeof m.placeholderColor === "string");
    assert(sp + " sheet is fn", typeof m.sheet === "function");
    assertEq(sp + " sheet(2)", m.sheet(2), "assets/sprites/pet/" + sp + "-2.png");
    ["idle", "happy", "eat", "sleep"].forEach((n, i) => {
      const a = m.anims[n];
      assert(sp + " anim " + n + " exists", !!a);
      assertEq(sp + " anim " + n + " row", a.row, i);
      assert(sp + " anim " + n + " frames num", typeof a.frames === "number" && a.frames > 0);
      assert(sp + " anim " + n + " fps num", typeof a.fps === "number" && a.fps > 0);
    });
  });

  // animFor fallback
  const sp0 = App.world.SPECIES[0];
  assertEq("animFor idle", App.sprites.animFor(sp0, "idle"), App.sprites.manifest[sp0].anims.idle);
  assertEq("animFor unknown anim -> idle", App.sprites.animFor(sp0, "zzz"), App.sprites.manifest[sp0].anims.idle);
  assertEq("animFor unknown species -> idle-shaped",
    App.sprites.animFor("nope", "idle"), App.sprites.manifest[sp0].anims.idle);
  assertEq("animFor peek falls back", App.sprites.animFor(sp0, "peek"), App.sprites.manifest[sp0].anims.idle);

  // variantFor
  [[0, 0], [89, 0], [90, 1], [180, 2], [270, 3], [359, 3], [360, 0], [450, 1], [-90, 3], [-1, 3]].forEach(([in_, out]) =>
    assertEq("variantFor(" + in_ + ")", App.sprites.variantFor(in_), out));
  assertEq("variantFor(NaN)", App.sprites.variantFor(NaN), 0);
  assertEq("variantFor(undefined)", App.sprites.variantFor(undefined), 0);
  assertEq("variantFor('x')", App.sprites.variantFor("x"), 0);
});
