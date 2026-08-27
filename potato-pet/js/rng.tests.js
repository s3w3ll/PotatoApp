window.__pushTests(function rngTests() {
  // hashCode is deterministic and unsigned
  assertEq("hashCode stable", App.rng.hashCode("K7F-9Q2"), App.rng.hashCode("K7F-9Q2"));
  assert("hashCode unsigned", App.rng.hashCode("anything") >= 0);
  assert("hashCode differs for different input",
    App.rng.hashCode("AAA-AAA") !== App.rng.hashCode("AAA-AAB"));

  // mulberry32 same seed -> same first 5 values
  const a = App.rng.mulberry32(12345), b = App.rng.mulberry32(12345);
  const seqA = [a(), a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b(), b()];
  assertEq("mulberry32 deterministic", seqA, seqB);
  assert("mulberry32 in range", seqA.every(x => x >= 0 && x < 1));
  assert("mulberry32 not constant", new Set(seqA).size > 1);

  // pick / int
  const r = App.rng.mulberry32(1);
  assert("pick returns an element", ["x","y","z"].includes(App.rng.pick(r, ["x","y","z"])));
  const r2 = App.rng.mulberry32(2);
  const ints = Array.from({length: 200}, () => App.rng.int(r2, 3, 7));
  assert("int within bounds", ints.every(n => n >= 3 && n <= 7 && Number.isInteger(n)));
  assert("int hits both ends", ints.includes(3) && ints.includes(7));

  // seededFrom ties them together
  const s1 = App.rng.seededFrom("HELLO1"), s2 = App.rng.seededFrom("HELLO1");
  assertEq("seededFrom deterministic", [s1(), s1()], [s2(), s2()]);
});
