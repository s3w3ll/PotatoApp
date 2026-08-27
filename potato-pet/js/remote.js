window.App = window.App || {};
App.remote = (function () {
  function RemoteError(kind, status) {
    const e = new Error("RemoteError:" + kind + (status ? ":" + status : ""));
    e.name = "RemoteError";
    e.kind = kind;
    if (status) e.status = status;
    return e;
  }

  const module = {
    TIMEOUT_MS: 5000,
    RemoteError: RemoteError,
    _fetch: function (u, init) { return window.fetch(u, init); },
  };

  function available() {
    return !!(App.config && App.config.apiBase);
  }

  function base() { return String(App.config.apiBase).replace(/\/+$/, ""); }
  function urlFor(code) { return base() + "/world/" + encodeURIComponent(code); }

  async function request(code, init) {
    if (!available()) throw RemoteError("offline");
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, module.TIMEOUT_MS);
    init = init || {};
    init.signal = ctrl.signal;
    try {
      return await module._fetch(urlFor(code), init);
    } catch (err) {
      if (err && err.name === "AbortError") throw RemoteError("timeout");
      throw RemoteError("offline");
    } finally {
      clearTimeout(timer);
    }
  }

  async function getWorld(code) {
    const res = await request(code, { method: "GET" });
    if (res.status === 404) return null;
    if (!res.ok) throw RemoteError("http", res.status);
    let body;
    try { body = await res.json(); } catch (_) { throw RemoteError("bad-response"); }
    let data;
    try { data = JSON.parse(body.data); } catch (_) { throw RemoteError("bad-response"); }
    if (!data || typeof data !== "object" || typeof body.updated_at !== "number") {
      throw RemoteError("bad-response");
    }
    return { data: data, version: body.version, updatedAt: body.updated_at };
  }

  async function putWorld(code, world) {
    const res = await request(code, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(world),
    });
    if (!res.ok) throw RemoteError("http", res.status);
    let body;
    try { body = await res.json(); } catch (_) { throw RemoteError("bad-response"); }
    if (typeof body.updated_at !== "number") throw RemoteError("bad-response");
    return { updatedAt: body.updated_at };
  }

  async function probe(code) {
    const res = await request(code, { method: "HEAD" });
    if (res.status === 404) return false;
    if (res.ok) return true;
    throw RemoteError("http", res.status);
  }

  return Object.assign(module, { available: available, getWorld: getWorld, putWorld: putWorld, probe: probe });
})();
