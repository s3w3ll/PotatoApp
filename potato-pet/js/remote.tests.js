window.__pushTests(async function remoteTests() {
  const R = App.remote;
  const origFetch = R._fetch;
  const origBase = App.config.apiBase;
  App.config.apiBase = "https://api.test";

  const ok = (body, status = 200) => ({
    ok: status >= 200 && status < 300, status,
    json: async () => body, text: async () => JSON.stringify(body),
  });
  const noBody = (status) => ({ ok: status >= 200 && status < 300, status,
    json: async () => ({}), text: async () => "" });

  // --- available() ---
  App.config.apiBase = "";
  assert("available() false when apiBase empty", R.available() === false);
  await assertThrowsAsync("getWorld rejects offline when unavailable",
    () => R.getWorld("ABC-DEF"), "offline");
  App.config.apiBase = "https://api.test";
  assert("available() true when apiBase set", R.available() === true);

  // --- getWorld ---
  let seen = null;
  R._fetch = async (u, init) => { seen = { u, init };
    return ok({ data: JSON.stringify({ version: 1, pet: {}, room: {}, learn: {} }),
               version: 1, updated_at: 42 }); };
  const g = await R.getWorld("ABC-DEF");
  assert("getWorld hits /world/:code", /\/world\/ABC-DEF$/.test(seen.u));
  assert("getWorld method GET", (seen.init && seen.init.method || "GET") === "GET");
  assertEq("getWorld parses data to object", g.data.version, 1);
  assertEq("getWorld maps updated_at -> updatedAt", g.updatedAt, 42);

  R._fetch = async () => ok({}, 404);
  assertEq("getWorld 404 -> null", await R.getWorld("ABC-DEF"), null);

  R._fetch = async () => ok({}, 500);
  await assertThrowsAsync("getWorld 500 -> RemoteError http", () => R.getWorld("X"), "");
  try { R._fetch = async () => ok({}, 500); await R.getWorld("X"); }
  catch (e) { assert("500 kind=http status=500", e.kind === "http" && e.status === 500); }

  R._fetch = async () => ok({ nope: true }, 200);
  try { await R.getWorld("X"); assert("bad body should throw", false); }
  catch (e) { assert("unparseable body -> bad-response", e.kind === "bad-response"); }

  // --- timeout ---
  R.TIMEOUT_MS = 20;
  R._fetch = (u, init) => new Promise((_, rej) => {
    init.signal.addEventListener("abort", () => {
      const e = new Error("aborted"); e.name = "AbortError"; rej(e);
    });
  });
  try { await R.getWorld("X"); assert("timeout should throw", false); }
  catch (e) { assert("abort -> kind=timeout", e.kind === "timeout"); }
  R.TIMEOUT_MS = 5000;

  // --- offline (fetch rejects) ---
  R._fetch = async () => { throw new TypeError("Failed to fetch"); };
  try { await R.getWorld("X"); assert("offline should throw", false); }
  catch (e) { assert("fetch reject -> kind=offline", e.kind === "offline"); }

  // --- putWorld ---
  const world = { version: 1, code: "ABC-DEF", pet: {}, room: {}, learn: {} };
  R._fetch = async (u, init) => { seen = { u, init }; return ok({ updated_at: 99 }); };
  const p = await R.putWorld("ABC-DEF", world);
  assert("putWorld method PUT", seen.init.method === "PUT");
  assert("putWorld sends JSON content-type",
    /application\/json/.test(seen.init.headers["Content-Type"] || seen.init.headers["content-type"]));
  assertEq("putWorld body is the world", JSON.parse(seen.init.body).code, "ABC-DEF");
  assertEq("putWorld returns updatedAt", p.updatedAt, 99);

  R._fetch = async () => ok({}, 422);
  try { await R.putWorld("X", world); assert("422 should throw", false); }
  catch (e) { assert("putWorld 422 -> http/422", e.kind === "http" && e.status === 422); }

  // --- probe ---
  R._fetch = async (u, init) => { seen = { u, init }; return noBody(200); };
  assertEq("probe 200 -> true", await R.probe("ABC-DEF"), true);
  assert("probe method HEAD", seen.init.method === "HEAD");
  R._fetch = async () => noBody(404);
  assertEq("probe 404 -> false", await R.probe("ABC-DEF"), false);
  R._fetch = async () => noBody(503);
  try { await R.probe("X"); assert("probe 503 should throw", false); }
  catch (e) { assert("probe 503 -> http/503", e.kind === "http" && e.status === 503); }

  R._fetch = origFetch;
  App.config.apiBase = origBase;
});
