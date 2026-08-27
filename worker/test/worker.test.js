import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { unstable_dev } from "wrangler";

let worker;
const CODE = "ABC-DEF";
const goodWorld = () => ({
  version: 1, code: CODE, savedAt: 5,
  pet: { species: "cat", name: "T", needs: { hunger: 1, energy: 1, fun: 1 } },
  room: { theme: "meadow", owned: [], placed: [] },
  learn: { factsSeen: [], game: {} },
});

before(async () => {
  worker = await unstable_dev("src/index.js", {
    experimental: { disableExperimentalWarning: true },
  });
});
after(async () => { await worker.stop(); });

test("GET unknown code -> 404 with CORS", async () => {
  const res = await worker.fetch(`/world/${CODE}`);
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("access-control-allow-origin"), "https://tato.forgesync.co.nz");
});

test("PUT then GET round-trips data; updated_at is server-set", async () => {
  const body = JSON.stringify(goodWorld());
  const put = await worker.fetch(`/world/${CODE}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body,
  });
  assert.equal(put.status, 200);
  const putJson = await put.json();
  assert.equal(typeof putJson.updated_at, "number");

  const get = await worker.fetch(`/world/${CODE}`);
  assert.equal(get.status, 200);
  const j = await get.json();
  assert.equal(j.data, body);            // stored verbatim, not re-serialized
  assert.equal(j.version, 1);
  assert.equal(j.updated_at, putJson.updated_at);
});

test("HEAD reflects existence", async () => {
  assert.equal((await worker.fetch(`/world/${CODE}`, { method: "HEAD" })).status, 200);
  assert.equal((await worker.fetch(`/world/ZZZ-ZZZ`, { method: "HEAD" })).status, 404);
});

test("PUT oversized body -> 413", async () => {
  const big = JSON.stringify({ ...goodWorld(), pad: "x".repeat(33000) });
  const res = await worker.fetch(`/world/${CODE}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: big,
  });
  assert.equal(res.status, 413);
  assert.equal(res.headers.get("access-control-allow-origin"), "https://tato.forgesync.co.nz");
});

test("PUT non-JSON -> 422", async () => {
  const res = await worker.fetch(`/world/${CODE}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: "not json",
  });
  assert.equal(res.status, 422);
  assert.equal(res.headers.get("access-control-allow-origin"), "https://tato.forgesync.co.nz");
});

test("PUT missing a required key -> 422", async () => {
  const bad = goodWorld(); delete bad.learn;
  const res = await worker.fetch(`/world/${CODE}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bad),
  });
  assert.equal(res.status, 422);
  assert.equal(res.headers.get("access-control-allow-origin"), "https://tato.forgesync.co.nz");
});

test("PUT version not a number -> 422", async () => {
  const bad = { ...goodWorld(), version: "1" };
  const res = await worker.fetch(`/world/${CODE}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bad),
  });
  assert.equal(res.status, 422);
  assert.equal(res.headers.get("access-control-allow-origin"), "https://tato.forgesync.co.nz");
});

test("bad code format -> 400", async () => {
  const res = await worker.fetch(`/world/not_a_code`);
  assert.equal(res.status, 400);
  assert.equal(res.headers.get("access-control-allow-origin"), "https://tato.forgesync.co.nz");
});

test("OPTIONS -> 204 with all CORS headers", async () => {
  const res = await worker.fetch(`/world/${CODE}`, { method: "OPTIONS" });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-methods"), "GET, PUT, HEAD, OPTIONS");
  assert.equal(res.headers.get("access-control-allow-headers"), "Content-Type");
  assert.equal(res.headers.get("access-control-max-age"), "86400");
});

test("unsupported method -> 405", async () => {
  const res = await worker.fetch(`/world/${CODE}`, { method: "POST" });
  assert.equal(res.status, 405);
  assert.equal(res.headers.get("access-control-allow-origin"), "https://tato.forgesync.co.nz");
});
