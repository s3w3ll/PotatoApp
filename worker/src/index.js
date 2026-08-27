const ORIGIN = "https://tato.forgesync.co.nz";
const CORS = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Methods": "GET, PUT, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};
const CODE_RE = /^[A-HJKMNP-Z2-9]{3}-[A-HJKMNP-Z2-9]{3}$/;
const MAX_BODY = 32768;
const REQUIRED = ["version", "pet", "room", "learn"];

let schemaReady;
function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = env.DB.exec(
      "CREATE TABLE IF NOT EXISTS worlds (code TEXT PRIMARY KEY, data TEXT NOT NULL, version INTEGER NOT NULL, updated_at INTEGER NOT NULL);"
    );
  }
  return schemaReady;
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json" }, CORS),
  });
}
function empty(status) { return new Response(null, { status, headers: CORS }); }

function normalizeCode(raw) {
  let c = decodeURIComponent(raw || "").toUpperCase();
  if (/^[A-HJKMNP-Z2-9]{6}$/.test(c)) c = c.slice(0, 3) + "-" + c.slice(3);
  return c;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;

    if (method === "OPTIONS") return empty(204);

    const m = url.pathname.match(/^\/world\/(.+)$/);
    if (!m) return json({ error: "not-found" }, 404);
    const code = normalizeCode(m[1]);
    if (!CODE_RE.test(code)) return json({ error: "bad-code" }, 400);

    await ensureSchema(env);

    if (method === "GET" || method === "HEAD") {
      const row = await env.DB
        .prepare("SELECT data, version, updated_at FROM worlds WHERE code = ?")
        .bind(code).first();
      if (!row) return method === "HEAD" ? empty(404) : json({ error: "not-found" }, 404);
      if (method === "HEAD") return empty(200);
      return json({ data: row.data, version: row.version, updated_at: row.updated_at });
    }

    if (method === "PUT") {
      const text = await request.text();
      if (text.length > MAX_BODY) return json({ error: "too-large" }, 413);
      let body;
      try { body = JSON.parse(text); } catch (_) { return json({ error: "bad-json" }, 422); }
      if (!body || typeof body !== "object") return json({ error: "bad-shape" }, 422);
      for (const k of REQUIRED) {
        if (!(k in body) || body[k] == null) return json({ error: "missing-" + k }, 422);
      }
      if (typeof body.version !== "number") return json({ error: "bad-version" }, 422);

      const now = Date.now();
      await env.DB.prepare(
        "INSERT INTO worlds (code, data, version, updated_at) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(code) DO UPDATE SET data = excluded.data, version = excluded.version, updated_at = excluded.updated_at"
      ).bind(code, text, body.version, now).run();
      return json({ updated_at: now });
    }

    return json({ error: "method-not-allowed" }, 405);
  },
};
