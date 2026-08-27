# Potato Pet — Phase 2: Cloud Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A child types their 6-character code on any device and their saved pet, room, and learning progress are there — while the game stays instant and fully playable with no network.

**Architecture:** A new transport-only module `js/remote.js` talks to a standalone Cloudflare Worker backed by D1. `js/save.js` becomes the orchestrator around its existing `localStorage` reads/writes: newest-wins reconcile on load, a one-slot local backup of any overwritten save, a 30-second debounced push, and a retry-until-clean dirty queue. The rest of the game never learns sync exists — `App.save`'s public method surface is unchanged. The Worker and its CI deploy live in a new top-level `worker/` directory; npm/test tooling is confined there.

**Tech Stack:** Vanilla ES5-style browser JS (no build, no framework, no modules, ordered `<script>` tags, one global `App`). Node (`node:vm`, `node:test`) for headless test runs. Cloudflare Workers (Module Worker) + D1 (SQLite). `wrangler` for local dev/test and deploy. GitHub Actions for CI.

**Spec:** `docs/superpowers/specs/2026-08-27-potato-pet-phase2-cloud-sync.md` (read it alongside this plan — the plan argues from it).

## Global Constraints

Every task's requirements implicitly include this section.

- **No build step for the game.** No framework, no bundler, no npm for anything under `potato-pet/`. No ES modules. Each file starts `window.App = window.App || {};` then attaches its API to `App`. Scripts load via ordered `<script>` tags. `index.html` must still work opened directly from `file://`.
- **npm / test tooling is confined to `worker/`.** Nothing under `potato-pet/` or the repo root gains a `package.json` or `node_modules` dependency. The one exception is the repo already has none; keep it that way outside `worker/`.
- **`App.save` public surface is call-site compatible.** `list`, `load`, `set`, `remove` keep their existing signatures and stay `async`. `create` stays `async` and now resolves to `{ ok: true } | { ok: false, reason: "code-taken" }`; Phase 1 call sites ignored its return value, and the only caller that will read it is `startscreen.js` (Task 6).
- **`js/remote.js` never touches `localStorage` or `App.state`.** `js/save.js` never calls `fetch`. This boundary is load-bearing and tested.
- **The child never sees a sync error, spinner, or "connection lost" banner.** Every `RemoteError` is caught inside `save.js`. The only sync-related thing a child can encounter is the rare creation-time code reroll (Task 6).
- **Worker CORS is a single hard-coded origin:** `https://tato.forgesync.co.nz`. No wildcard, no `Origin` reflection.
- **Worker `PUT` guards:** body over `32768` bytes → `413`; non-JSON body → `422`; parsed body that is not a non-null object or is missing any of `version` / `pet` / `room` / `learn`, or whose `version` is not a number → `422`; `:code` not matching the code format → `400`. The Worker stamps `updated_at` from its own clock (`Date.now()`) on every write — never from client data.
- **Code format:** 6 characters from the alphabet `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (no `0 1 I L O`), displayed and transmitted grouped as `XXX-XXX`. Validation regex for a normalized code: `^[A-HJKMNP-Z2-9]{3}-[A-HJKMNP-Z2-9]{3}$`.
- **All 1200 Phase 1 logic tests stay green** after every task. New tests are added, none are deleted or weakened.
- **TDD + frequent commits.** Each task: failing test → run it fail → minimal implementation → run it pass → commit. Tasks 6 and 7 touch only DOM-wiring code that Phase 1 established has no unit tests; those tasks substitute an explicit manual-verification step for the test steps and say so.
- **Match the surrounding code style:** IIFE returning an API object, 2-space indent, semicolons, terse helpers, `const`/`let`, no TypeScript, no JSDoc noise.

---

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `potato-pet/run-suite.mjs` | Headless Node runner that loads the same modules as `tests.html` in a `vm` sandbox and runs every `*.tests.js`. The green-baseline command for every later task. |
| `potato-pet/js/remote.js` | `App.remote` — transport only: `available`, `getWorld`, `putWorld`, `probe`, a `_fetch` seam, `RemoteError`. No storage, no state. |
| `potato-pet/js/remote.tests.js` | Tests for `remote.js` using a fake `_fetch`. |
| `worker/src/index.js` | The Module Worker: routes `GET`/`PUT`/`HEAD`/`OPTIONS` on `/world/:code`, D1 access, CORS, guards, lazy schema. |
| `worker/wrangler.toml` | Worker name, entrypoint, `compatibility_date`, D1 binding. |
| `worker/schema.sql` | `CREATE TABLE worlds …` — applied to the remote DB during setup; the Worker also ensures it lazily. |
| `worker/package.json` | `wrangler` dev-dependency; `test` script (`node --test test/`). |
| `worker/test/worker.test.js` | `node:test` suite driving the Worker via `unstable_dev` + local D1. |
| `worker/.gitignore` | `node_modules/`, `.wrangler/`, `.dev.vars`. |
| `worker/SETUP.md` | One-time click-path: Cloudflare account, `d1 create`, apply schema, API token, GitHub secret, paste `apiBase`. |
| `.github/workflows/deploy-worker.yml` | CI: on push touching `worker/**`, run `wrangler deploy`. |

**Modified files:**

| Path | Change |
|---|---|
| `potato-pet/js/config.js` | Comment clarifying `apiBase` (`""` = local-only); value stays `""` in the repo, set by the maintainer post-deploy. |
| `potato-pet/js/save.js` | Orchestration: reconcile on `load`, backup slot, debounced push, dirty/pending queue, `checkCode`, `create` result, `_`-prefixed test helpers. |
| `potato-pet/js/save.tests.js` | New cases for reconcile, backup, debounce, dirty-clear rules, `checkCode`, `create`. |
| `potato-pet/js/startscreen.js` | Creation flow handles `create` → `{ ok: false, reason: "code-taken" }` by rerolling once with a calm note. |
| `potato-pet/js/devpanel.js` | "Restore previous pet state" button, shown only when a backup slot exists. |
| `potato-pet/index.html` | Add `<script src="js/remote.js"></script>` immediately after `js/config.js`. |
| `potato-pet/tests.html` | Add `remote.js` to the module block (after `config.js`) and `remote.tests.js` to the test-file block (after `save.tests.js`). |
| `potato-pet/TESTING.md` | New "Phase 2 — cross-device sync" manual section. |
| `potato-pet/README.md` | Update "What's next", add a short sync note and the headless-test command. |

**Untouched:** `main.js`, `gamescreen.js`, `state.js`, `world.js`, `rng.js`, `content.js`, `games.js`, `facts.js`, `interactions.js`, `room.js`, `backup.js`, `pet.js`, `sprites.js`, `styles.css`, `.github/workflows/deploy-pages.yml`.

---

## Design notes that bind multiple tasks

**Timestamp normalization (Tasks 3–4).** After any reconcile that changes local state, the local blob's `savedAt` is set to equal the server's `updated_at` for that version, so the *next* comparison on any device is an exact tie ("in sync") rather than a skew-driven false "local newer":
- server wins → `world = server.data; world.savedAt = server.updatedAt;` then raw-write.
- push succeeds → `world.savedAt = result.updatedAt;` then raw-write; update `lastPushedSerial`.

**Raw write vs `set()` (Task 3).** The reconcile "server wins" path must NOT call `set()` — `set()` re-stamps `savedAt = Date.now()` and schedules a push, which would immediately shove the just-pulled world back up. Task 3 adds a private `writeLocalRaw(world)` that does `localStorage.setItem(worldKey(world.code), JSON.stringify(world))` + `upsertIndex(world)` and nothing else.

**Deterministic push in tests (Task 4).** `set()` arms a real `setTimeout`. Tests never wait on wall-clock: `save.js` exposes `_flushPush()` → `Promise` that performs any pending push now and clears the timer, and `_resetSync()` that clears `lastPushedSerial`, the timer, and the in-memory pending set (not `localStorage`). Both are `_`-prefixed and for tests/dev only.

**`RemoteError` handling map (Tasks 2–4), from spec §9:**

| `err.kind` | `load` / `checkCode` | pending push after `set` |
|---|---|---|
| `offline`, `timeout` | fall back to local / return `"unknown"` | keep dirty, retry later |
| `http` with `status` 429 or 5xx | fall back to local / `"unknown"` | keep dirty, retry later |
| `http` with `status` 4xx (≠429) | fall back to local / `"unknown"` | `console.error`, then **clear dirty** (resend can't succeed) |
| `bad-response` | fall back to local / `"unknown"` | `console.error`, then **clear dirty** |

---

### Task 1: Headless test runner + green baseline

**Files:**
- Create: `potato-pet/run-suite.mjs`
- (verifies, does not modify) `potato-pet/js/*.js`, `potato-pet/js/*.tests.js`

**Interfaces:**
- Consumes: the module load order in `potato-pet/tests.html` (lines 11–21 module block; lines 52–61 test-file block) and the harness helpers in its inline `<script>` (`assert`, `assertEq`, `assertThrows`, `assertThrowsAsync`, `window.__pushTests`, `runTests`).
- Produces: a `node potato-pet/run-suite.mjs` command that exits `0` when all tests pass, `1` otherwise, printing `FAIL <name>` lines and a `<pass> / <total> passed` summary. Every later task uses this as its test command.

- [ ] **Step 1: Write the runner**

Create `potato-pet/run-suite.mjs`. It mirrors `tests.html`: a `vm` sandbox with browser-ish globals, load the module block, install harness helpers, load the test-file block, run.

```js
// Headless run of the Potato Pet hand-rolled suite. Mirrors potato-pet/tests.html:
// same module load order, same harness helpers, same *.tests.js files.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const jsdir = path.join(HERE, 'js');

// --- minimal browser-ish globals ---
const store = new Map();
const localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear(),
};
const listeners = {};
const windowObj = {
  addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
  dispatchEvent: ev => { (listeners[ev.type] || []).forEach(fn => fn(ev)); },
};
const documentObj = {
  addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
  hidden: false,
};
const TESTS = [];
const sandbox = {
  window: windowObj, document: documentObj, localStorage,
  btoa: s => Buffer.from(s, 'binary').toString('base64'),
  atob: s => Buffer.from(s, 'base64').toString('binary'),
  Math, Date, JSON, Object, Array, Set, Map, String, Number, Boolean, Error,
  isNaN, parseInt, parseFloat, console, URL,
  setTimeout, clearTimeout, queueMicrotask,
  AbortController, AbortSignal,
  fetch: () => { throw new Error('real fetch must never be called in the suite'); },
  __pushTests: fn => TESTS.push(fn),
};
// Browser scripts do `window.App = window.App || {}` then use bare `App`;
// in a vm sandbox those are different bindings, so share ONE object.
const appObj = {};
sandbox.App = appObj;
sandbox.window.App = appObj;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
sandbox.window.__pushTests = sandbox.__pushTests;

function load(file) {
  const code = fs.readFileSync(path.join(jsdir, file), 'utf8');
  vm.runInContext(code, sandbox, { filename: file });
}

// module block — keep in sync with tests.html
[
  'config.js', 'rng.js', 'remote.js', 'save.js', 'world.js', 'state.js',
  'content.js', 'games.js', 'facts.js', 'interactions.js', 'room.js', 'backup.js',
].forEach(load);

// harness helpers — mirror the inline <script> in tests.html
const results = [];
sandbox.assert = (name, cond) => results.push([name, !!cond]);
sandbox.assertEq = (name, a, e) =>
  results.push([name + '  (got ' + JSON.stringify(a) + ')',
                JSON.stringify(a) === JSON.stringify(e)]);
sandbox.assertThrows = (name, fn, msg) => {
  try { fn(); results.push([name + ' — expected throw', false]); }
  catch (e) { results.push([name, !msg || String(e.message).includes(msg)]); }
};
sandbox.assertThrowsAsync = async (name, fn, msg) => {
  try { await fn(); results.push([name + ' — expected throw', false]); }
  catch (e) { results.push([name, !msg || String(e.message).includes(msg)]); }
};

// test-file block — keep in sync with tests.html
[
  'rng.tests.js', 'save.tests.js', 'world.tests.js', 'state.tests.js',
  'content.tests.js', 'games.tests.js', 'facts.tests.js',
  'interactions.tests.js', 'room.tests.js', 'backup.tests.js',
].forEach(f => {
  if (fs.existsSync(path.join(jsdir, f))) load(f);
});

const run = async () => {
  for (const t of TESTS) {
    try { await t(); } catch (e) { results.push(['THREW: ' + e.message, false]); }
  }
  const pass = results.filter(r => r[1]).length;
  results.filter(r => !r[1]).forEach(f => console.log('FAIL ' + f[0]));
  console.log(`\n${pass} / ${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
};
run();
```

Notes for the implementer:
- `remote.js` and `remote.tests.js` do not exist yet — the `module block` list names `remote.js`, so **for this task only**, temporarily omit `'remote.js',` from the module list OR create a one-line stub `potato-pet/js/remote.js` containing `window.App = window.App || {};` and commit it with the runner. Prefer the stub: it keeps the runner's list final. Task 2 replaces the stub body.
- `remote.tests.js` is guarded by `fs.existsSync`, so its absence is fine now.
- The module list and test-file list MUST match `tests.html` exactly; any later task that adds a file to one adds it to both places.

- [ ] **Step 2: Run it and confirm the baseline**

Run: `node potato-pet/run-suite.mjs`
Expected: `1200 / 1200 passed`, exit `0`. (If the count differs from 1200, stop and reconcile with `tests.html` before continuing — the runner is wrong, not the tests.)

- [ ] **Step 3: Commit**

```bash
git add potato-pet/run-suite.mjs potato-pet/js/remote.js
git commit -m "test: add headless Node runner for the logic suite

Mirrors tests.html module + test-file load order in a vm sandbox so
every Phase 2 task has a 'node run-suite.mjs' green-baseline command.
Includes a one-line remote.js stub that Task 2 fills in."
```

---

### Task 2: `js/remote.js` — transport module

**Files:**
- Modify: `potato-pet/js/remote.js` (replace the stub)
- Create: `potato-pet/js/remote.tests.js`
- Modify: `potato-pet/js/config.js` (comment only)
- Modify: `potato-pet/index.html` (add script tag)
- Modify: `potato-pet/tests.html` (add to both blocks)

**Interfaces:**
- Consumes: `App.config.apiBase` (string, may be `""`).
- Produces:
  - `App.remote.available()` → `boolean` — `!!(App.config && App.config.apiBase)`.
  - `App.remote.getWorld(code)` → `Promise<{ data: object, version: number, updatedAt: number } | null>`. `null` on HTTP 404. Throws `RemoteError` otherwise (see below). `data` is the **parsed** world object.
  - `App.remote.putWorld(code, world)` → `Promise<{ updatedAt: number }>`. Throws `RemoteError` on any non-2xx.
  - `App.remote.probe(code)` → `Promise<boolean>` — `true` on 200, `false` on 404, throws `RemoteError` otherwise.
  - `App.remote._fetch` — defaults to a function delegating to `window.fetch`; tests overwrite it.
  - `App.remote.TIMEOUT_MS` — `5000`.
  - `RemoteError` — thrown value with `.name === "RemoteError"`, `.kind ∈ {"offline","timeout","http","bad-response"}`, and `.status` (number) when `kind === "http"`. Exposed as `App.remote.RemoteError`.

- [ ] **Step 1: Write the failing tests**

Create `potato-pet/js/remote.tests.js`:

```js
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
```

- [ ] **Step 2: Add `remote.js` / `remote.tests.js` to `tests.html`**

In `potato-pet/tests.html`, add after line 11 (`<script src="js/config.js"></script>`):
```html
<script src="js/remote.js"></script>
```
and after the `save.tests.js` line in the test-file block:
```html
<script src="js/remote.tests.js"></script>
```
(The `run-suite.mjs` lists already include both from Task 1.)

- [ ] **Step 3: Run tests, verify the new ones FAIL**

Run: `node potato-pet/run-suite.mjs`
Expected: FAILs referencing `remoteTests` (stub `App.remote` has no methods), all 1200 Phase 1 tests still pass.

- [ ] **Step 4: Implement `js/remote.js`**

Replace the stub with:

```js
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
```

- [ ] **Step 5: Update `config.js` comment**

`potato-pet/js/config.js` becomes:
```js
window.App = window.App || {};
// apiBase: your deployed Worker URL (see worker/SETUP.md) enables cross-device sync.
// "" = local-only; the game never touches the network. Set this after the first deploy.
App.config = { apiBase: "" };
```

- [ ] **Step 6: Wire `index.html`**

In `potato-pet/index.html`, add immediately after line 13 (`<script src="js/config.js"></script>`):
```html
<script src="js/remote.js"></script>
```

- [ ] **Step 7: Run tests, verify all pass**

Run: `node potato-pet/run-suite.mjs`
Expected: `12xx / 12xx passed` (1200 + the new `remoteTests` assertions), exit `0`.
Also open `potato-pet/tests.html` in a browser once: last line green, count matches.

- [ ] **Step 8: Commit**

```bash
git add potato-pet/js/remote.js potato-pet/js/remote.tests.js potato-pet/js/config.js potato-pet/index.html potato-pet/tests.html
git commit -m "feat: add App.remote transport module

fetch wrapper with a 5s AbortController timeout, getWorld/putWorld/probe,
and a normalized RemoteError (offline|timeout|http|bad-response). No
storage, no state. Wired into index.html and both test harnesses."
```

---

### Task 3: `save.js` — reconcile on load + backup slot

**Files:**
- Modify: `potato-pet/js/save.js`
- Modify: `potato-pet/js/save.tests.js`

**Interfaces:**
- Consumes: `App.remote.available()`, `App.remote.getWorld(code)`, `App.remote.RemoteError` (Task 2). Existing `save.js` internals: `worldKey`, `readIndex`/`writeIndex`/`upsertIndex`, `validShape`, `migrate`, `module.CURRENT_VERSION`.
- Produces (private, for Tasks 4–5 and tests):
  - `writeLocalRaw(world)` — `localStorage.setItem(worldKey(world.code), JSON.stringify(world))` + `upsertIndex(world)`, nothing else (no `savedAt` re-stamp, no push).
  - `backupKey(code)` → `"potato-pet:backup:" + code`.
  - `localTimestamp(world)` → `world && typeof world.savedAt === "number" ? world.savedAt : 0`.
  - `App.save._readBackup(code)` → `{ world, replacedAt } | null` (used by devpanel Task 7 and tests).
- Produces (behavioural): `load(code)` reconciles with the server when `App.remote.available()`; on "server newer" it writes `potato-pet:backup:<code>` = `{ world: <old local>, replacedAt: Date.now() }` before overwriting local, normalizes `savedAt` to the server's `updatedAt`, and returns the server world. On remote error or unavailable, `load` returns exactly what Phase 1 returned.

- [ ] **Step 1: Write the failing tests**

Append to `potato-pet/js/save.tests.js` a new `window.__pushTests(async function saveSyncLoadTests() { ... })` block:

```js
window.__pushTests(async function saveSyncLoadTests() {
  const CODE = "SYN-C01";
  const mk = (savedAt, name) => ({
    version: App.save.CURRENT_VERSION, code: CODE, savedAt: savedAt,
    pet: { species: "cat", name: name, adoptedAt: 1, tint: 0,
           needs: { hunger: 50, energy: 50, fun: 50 }, lastTick: 1 },
    stars: 0, room: { theme: "meadow", owned: [], placed: [] },
    learn: { factsSeen: [], game: { mathLevel: 1, spellingLevel: 1, bestStreak: 0 } },
  });

  // fake remote
  const realRemote = App.remote;
  function fakeRemote(over) {
    return Object.assign({
      available: () => true,
      getWorld: async () => null,
      putWorld: async () => ({ updatedAt: Date.now() }),
      probe: async () => false,
      RemoteError: realRemote.RemoteError,
    }, over);
  }

  // --- server newer -> local backed up, server world adopted ---
  App.save._resetSync && App.save._resetSync();
  await App.save.remove(CODE);
  localStorage.removeItem("potato-pet:backup:" + CODE);
  App.remote = fakeRemote({
    getWorld: async () => ({ data: mk(500, "Server"), version: 1, updatedAt: 900 }),
  });
  await App.save.set(mk(100, "Local"));          // local savedAt gets stamped to now...
  // force local to look older than the server:
  const older = mk(1, "Local"); older.savedAt = 1;
  localStorage.setItem("potato-pet:world:" + CODE, JSON.stringify(older));
  const got = await App.save.load(CODE);
  assertEq("server-newer: adopts server world", got.pet.name, "Server");
  assertEq("server-newer: savedAt normalized to server updatedAt", got.savedAt, 900);
  const bk = App.save._readBackup(CODE);
  assert("server-newer: backup slot holds old local", bk && bk.world.pet.name === "Local");
  assert("server-newer: backup has replacedAt", bk && typeof bk.replacedAt === "number");

  // --- local newer -> server untouched, code marked pending ---
  App.save._resetSync();
  await App.save.remove(CODE);
  let putCalls = 0;
  App.remote = fakeRemote({
    getWorld: async () => ({ data: mk(10, "Server"), version: 1, updatedAt: 10 }),
    putWorld: async () => { putCalls++; return { updatedAt: 12345 }; },
  });
  const localNew = mk(1, "LocalNew"); localNew.savedAt = 99999;
  localStorage.setItem("potato-pet:world:" + CODE, JSON.stringify(localNew));
  const got2 = await App.save.load(CODE);
  assertEq("local-newer: keeps local", got2.pet.name, "LocalNew");
  assert("local-newer: code is pending", App.save._pending().indexOf(CODE) !== -1);

  // --- remote unavailable -> Phase 1 behaviour exactly ---
  App.save._resetSync();
  App.remote = fakeRemote({ available: () => false });
  await App.save.remove(CODE);
  assertEq("unavailable: missing code still returns null", await App.save.load(CODE), null);
  localStorage.setItem("potato-pet:world:" + CODE, JSON.stringify(mk(5, "Solo")));
  assertEq("unavailable: returns local unchanged", (await App.save.load(CODE)).pet.name, "Solo");

  // --- getWorld throws -> local returned, no throw escapes ---
  App.save._resetSync();
  App.remote = fakeRemote({
    getWorld: async () => { throw realRemote.RemoteError("offline"); },
  });
  localStorage.setItem("potato-pet:world:" + CODE, JSON.stringify(mk(7, "Offline")));
  assertEq("getWorld throws: returns local", (await App.save.load(CODE)).pet.name, "Offline");

  App.remote = realRemote;
  App.save._resetSync();
  await App.save.remove(CODE);
  localStorage.removeItem("potato-pet:backup:" + CODE);
});
```

(This block references `App.save._resetSync`, `App.save._pending`, `App.save._readBackup` — all delivered here and in Task 4. `_resetSync` and `_pending` are introduced fully in Task 4; in this task provide minimal versions: `_resetSync()` clears the in-memory pending set and any timer; `_pending()` returns the pending codes as an array. Task 4 extends them.)

- [ ] **Step 2: Run tests, verify FAIL**

Run: `node potato-pet/run-suite.mjs`
Expected: `saveSyncLoadTests` FAILs; 1200 Phase 1 + `remoteTests` still pass.

- [ ] **Step 3: Implement in `save.js`**

Rework the IIFE. Full new file:

```js
window.App = window.App || {};
App.save = (function () {
  const module = { CURRENT_VERSION: 1 };
  const INDEX_KEY = "potato-pet:index";
  const worldKey = code => "potato-pet:world:" + code;
  const backupKey = code => "potato-pet:backup:" + code;
  const PENDING_KEY = "potato-pet:pending";
  const migrations = {}; // migrations[n] : (world@vN) -> world@v(N+1)

  // ---- sync state (module-level, session) ----
  let pushTimer = null;
  let pendingSet = new Set(readPendingRaw());
  let lastPushedSerial = {};   // code -> JSON string of last world sent OK

  function readPendingRaw() {
    try { return JSON.parse(localStorage.getItem(PENDING_KEY)) || []; }
    catch (_) { return []; }
  }
  function writePending() {
    localStorage.setItem(PENDING_KEY, JSON.stringify(Array.from(pendingSet)));
  }
  function markDirty(code) { pendingSet.add(code); writePending(); }
  function clearDirty(code) { pendingSet.delete(code); writePending(); }

  function migrate(world) {
    while (world.version < module.CURRENT_VERSION) {
      const step = migrations[world.version];
      if (!step) throw new Error("SAVE_NO_MIGRATION_" + world.version);
      world = step(world);
    }
    return world;
  }
  function readIndex() {
    try { return JSON.parse(localStorage.getItem(INDEX_KEY)) || []; }
    catch (_) { return []; }
  }
  function writeIndex(list) { localStorage.setItem(INDEX_KEY, JSON.stringify(list)); }
  function upsertIndex(world) {
    const list = readIndex().filter(e => e.code !== world.code);
    list.push({ code: world.code, name: world.pet.name, species: world.pet.species });
    writeIndex(list);
  }
  function validShape(w) {
    return w && typeof w === "object" && w.pet && w.room && w.learn;
  }
  function localTimestamp(w) {
    return w && typeof w.savedAt === "number" ? w.savedAt : 0;
  }
  function writeLocalRaw(world) {
    localStorage.setItem(worldKey(world.code), JSON.stringify(world));
    upsertIndex(world);
  }
  function readLocal(code) {
    const raw = localStorage.getItem(worldKey(code));
    if (raw == null) return null;
    let world;
    try { world = JSON.parse(raw); } catch (_) { throw new Error("SAVE_CORRUPT"); }
    if (!validShape(world)) throw new Error("SAVE_CORRUPT");
    return world;
  }

  async function list() { return readIndex(); }

  async function load(code) {
    let local = readLocal(code);          // may throw SAVE_CORRUPT (Phase 1 contract)
    if (local && local.version < module.CURRENT_VERSION) {
      local = migrate(local);
      await set(local);                   // persists + schedules a push (Phase 1 + Task 4)
    }

    if (!App.remote || !App.remote.available()) return local;

    let server;
    try { server = await App.remote.getWorld(code); }
    catch (_) { return local; }           // offline/timeout/http/bad-response -> local wins

    if (!server) {                        // no row yet
      if (local) markDirty(code);
      return local;
    }
    const lt = localTimestamp(local);
    if (server.updatedAt > lt) {          // server wins
      if (local) {
        localStorage.setItem(backupKey(code),
          JSON.stringify({ world: local, replacedAt: Date.now() }));
      }
      const adopted = server.data;
      adopted.savedAt = server.updatedAt; // normalize so next compare is a tie
      writeLocalRaw(adopted);
      lastPushedSerial[code] = JSON.stringify(adopted);
      clearDirty(code);
      return adopted;
    }
    if (lt > server.updatedAt) {          // local wins
      markDirty(code);
      return local;
    }
    return local;                         // tie -> in sync
  }

  async function set(world) {
    world.savedAt = Date.now();
    localStorage.setItem(worldKey(world.code), JSON.stringify(world));
    upsertIndex(world);
    schedulePush(world);                  // Task 4
    return world;
  }

  async function create(world) {          // Task 5 adds checkCode + result object
    await set(world);
    return { ok: true };
  }

  async function remove(code) {
    localStorage.removeItem(worldKey(code));
    localStorage.removeItem(backupKey(code));
    clearDirty(code);
    delete lastPushedSerial[code];
    writeIndex(readIndex().filter(e => e.code !== code));
  }

  // ---- push scheduling: minimal here, completed in Task 4 ----
  function schedulePush(world) {
    markDirty(world.code);
  }
  async function flushPush() { /* Task 4 */ }
  function resetSync() {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    pendingSet = new Set();
    lastPushedSerial = {};
    writePending();
  }

  return Object.assign(module, {
    list, load, set, create, remove,
    _migrate: migrate, _migrations: migrations,
    _readBackup: code => {
      try { return JSON.parse(localStorage.getItem(backupKey(code))); }
      catch (_) { return null; }
    },
    _pending: () => Array.from(pendingSet),
    _resetSync: resetSync,
    _flushPush: flushPush,
  });
})();
```

Implementer note: this task leaves `schedulePush` as "just mark dirty" and `flushPush` empty — Task 4 fills them. That keeps Task 3's diff about reconcile only. The `saveSyncLoadTests` "local-newer: code is pending" assertion passes because `set()` → `schedulePush()` → `markDirty()`.

- [ ] **Step 4: Run tests, verify all pass**

Run: `node potato-pet/run-suite.mjs`
Expected: all green including `saveSyncLoadTests`. The Phase 1 `saveTests` block still passes unchanged (its `set`/`load`/migration paths are untouched in behaviour).

- [ ] **Step 5: Commit**

```bash
git add potato-pet/js/save.js potato-pet/js/save.tests.js
git commit -m "feat: reconcile local save against the server on load

Newest-wins by timestamp at whole-world granularity; the overwritten
local save is stashed in potato-pet:backup:<code> with a replacedAt
stamp. Remote errors and 'remote unavailable' fall back to exact Phase 1
behaviour. Adds writeLocalRaw + sync-state scaffolding for Task 4."
```

---

### Task 4: `save.js` — debounced push, pending queue, flush on hide

**Files:**
- Modify: `potato-pet/js/save.js`
- Modify: `potato-pet/js/save.tests.js`

**Interfaces:**
- Consumes: `App.remote.available()`, `App.remote.putWorld(code, world)` → `{ updatedAt }`, `App.remote.RemoteError`. Private helpers from Task 3: `markDirty`, `clearDirty`, `pendingSet`, `lastPushedSerial`, `writeLocalRaw`, `worldKey`.
- Produces:
  - `schedulePush(world)` — dedupes by `JSON.stringify(world) === lastPushedSerial[code]` (skip if equal); else `markDirty(code)` and arm a single `setTimeout(doPush, PUSH_INTERVAL_MS)` if none armed.
  - `doPush()` — for each dirty code with a local world: `putWorld`; on success normalize `savedAt` to the returned `updatedAt` via `writeLocalRaw`, set `lastPushedSerial[code]`, `clearDirty(code)`; on `RemoteError` apply the handling map (keep dirty for offline/timeout/429/5xx; `console.error` + `clearDirty` for other 4xx and `bad-response`).
  - `App.save._flushPush()` → `Promise` — clears the timer and runs `doPush()` now.
  - `PUSH_INTERVAL_MS` — `30000`. Exposed read-only as `App.save._PUSH_INTERVAL_MS` for reference.
  - A one-time `visibilitychange` (document) + `pagehide` (window) listener, registered on the first `schedulePush`, that calls `doPush()` when `document.hidden` / on pagehide. Errors swallowed.

- [ ] **Step 1: Write the failing tests**

Append `window.__pushTests(async function saveSyncPushTests() { ... })` to `save.tests.js`:

```js
window.__pushTests(async function saveSyncPushTests() {
  const CODE = "PSH-001";
  const realRemote = App.remote;
  const base = () => ({
    version: App.save.CURRENT_VERSION, code: CODE, savedAt: 0,
    pet: { species: "frog", name: "P", adoptedAt: 1, tint: 0,
           needs: { hunger: 50, energy: 50, fun: 50 }, lastTick: 1 },
    stars: 0, room: { theme: "meadow", owned: [], placed: [] },
    learn: { factsSeen: [], game: { mathLevel: 1, spellingLevel: 1, bestStreak: 0 } },
  });
  const fake = (over) => Object.assign({
    available: () => true,
    getWorld: async () => null,
    putWorld: async () => ({ updatedAt: 777 }),
    probe: async () => false,
    RemoteError: realRemote.RemoteError,
  }, over);

  // debounce: N rapid sets -> at most one putWorld
  App.save._resetSync();
  await App.save.remove(CODE);
  let puts = [];
  App.remote = fake({ putWorld: async (c, w) => { puts.push(JSON.parse(JSON.stringify(w))); return { updatedAt: 777 }; } });
  const w = base();
  await App.save.set(w); w.stars = 1;
  await App.save.set(w); w.stars = 2;
  await App.save.set(w);
  await App.save._flushPush();
  assertEq("debounce collapses to one push", puts.length, 1);
  assertEq("push sends the latest world", puts[0].stars, 2);
  assert("push clears pending", App.save._pending().indexOf(CODE) === -1);
  assertEq("push normalizes savedAt to server updatedAt",
    JSON.parse(localStorage.getItem("potato-pet:world:" + CODE)).savedAt, 777);

  // unchanged world -> zero pushes
  App.save._resetSync();
  puts = [];
  await App.save.set(w);            // stars still 2, but _resetSync cleared lastPushedSerial
  await App.save._flushPush();      // this one pushes (serial unknown after reset)
  puts = [];
  await App.save.set(w);            // identical world now
  await App.save._flushPush();
  assertEq("identical world -> no push", puts.length, 0);

  // 5xx -> stays dirty
  App.save._resetSync();
  await App.save.remove(CODE);
  App.remote = fake({ putWorld: async () => { throw realRemote.RemoteError("http", 503); } });
  await App.save.set(base());
  await App.save._flushPush();
  assert("5xx keeps code pending", App.save._pending().indexOf(CODE) !== -1);

  // 422 -> logged + dirty cleared
  App.save._resetSync();
  await App.save.remove(CODE);
  let errs = 0; const origErr = console.error; console.error = () => { errs++; };
  App.remote = fake({ putWorld: async () => { throw realRemote.RemoteError("http", 422); } });
  await App.save.set(base());
  await App.save._flushPush();
  console.error = origErr;
  assert("422 was logged", errs > 0);
  assert("422 clears pending (no doomed retry)", App.save._pending().indexOf(CODE) === -1);

  App.remote = realRemote;
  App.save._resetSync();
  await App.save.remove(CODE);
});
```

- [ ] **Step 2: Run tests, verify FAIL**

Run: `node potato-pet/run-suite.mjs` — `saveSyncPushTests` FAILs (`_flushPush` is a no-op, so nothing pushes).

- [ ] **Step 3: Implement in `save.js`**

Replace the "push scheduling: minimal here" block with the real one:

```js
  // ---- push scheduling ----
  const PUSH_INTERVAL_MS = 30000;
  let hideHooked = false;

  function serial(world) { return JSON.stringify(world); }

  function schedulePush(world) {
    if (lastPushedSerial[world.code] === serial(world)) return;
    markDirty(world.code);
    hookHide();
    if (!pushTimer) {
      pushTimer = setTimeout(function () { pushTimer = null; doPush(); }, PUSH_INTERVAL_MS);
    }
  }

  function hookHide() {
    if (hideHooked || typeof document === "undefined") return;
    hideHooked = true;
    const flush = function () { doPush(); };
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) flush();
    });
    if (typeof window !== "undefined") window.addEventListener("pagehide", flush);
  }

  async function doPush() {
    if (!App.remote || !App.remote.available()) return;
    const codes = Array.from(pendingSet);
    for (const code of codes) {
      const local = safeReadLocal(code);
      if (!local) { clearDirty(code); continue; }
      let result;
      try {
        result = await App.remote.putWorld(code, local);
      } catch (err) {
        if (err && err.kind === "http" && err.status !== 429 && err.status < 500) {
          console.error("potato-pet sync: push rejected", err.status, err);
          clearDirty(code);
        } else if (err && err.kind === "bad-response") {
          console.error("potato-pet sync: bad push response", err);
          clearDirty(code);
        } // offline / timeout / 429 / 5xx: leave dirty, retry later
        continue;
      }
      local.savedAt = result.updatedAt;
      writeLocalRaw(local);
      lastPushedSerial[code] = serial(local);
      clearDirty(code);
    }
  }

  function safeReadLocal(code) {
    try { return readLocal(code); } catch (_) { return null; }
  }

  async function flushPush() {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    await doPush();
  }
```

Update the returned object: add `_PUSH_INTERVAL_MS: PUSH_INTERVAL_MS`. Keep `_flushPush: flushPush` (now real). `resetSync` stays as in Task 3 but also does not need to touch `hideHooked`.

- [ ] **Step 4: Run tests, verify all pass**

Run: `node potato-pet/run-suite.mjs` — all green. Also `potato-pet/tests.html` in a browser once.

- [ ] **Step 5: Manual sanity in the game (no network)**

Open `potato-pet/index.html` from `file://` (so `apiBase` is `""`). Adopt a pet, click around. Expected: no console errors, no network attempts, game behaves exactly as Phase 1. (With `apiBase` empty, `doPush` returns immediately.)

- [ ] **Step 6: Commit**

```bash
git add potato-pet/js/save.js potato-pet/js/save.tests.js
git commit -m "feat: debounced background push with a retry-until-clean queue

set() schedules a push at most once per 30s, deduped by serialized
world; a pending set (mirrored to potato-pet:pending) is drained on the
timer, on tab-hide, and on the next load. 4xx (non-429) and bad
responses are logged and dropped instead of retried forever."
```

---

### Task 5: `save.js` — `checkCode` + `create` collision result

**Files:**
- Modify: `potato-pet/js/save.js`
- Modify: `potato-pet/js/save.tests.js`

**Interfaces:**
- Consumes: `App.remote.available()`, `App.remote.probe(code)` → `boolean` / throws `RemoteError`.
- Produces:
  - `App.save.checkCode(code)` → `Promise<"free" | "taken" | "unknown">`. `"unknown"` when `!App.remote.available()` or `probe` throws.
  - `App.save.create(world)` → `Promise<{ ok: true } | { ok: false, reason: "code-taken" }>`. On `checkCode(world.code) === "taken"` it returns `{ ok: false, reason: "code-taken" }` and writes nothing. `"free"` and `"unknown"` both proceed: `set(world)` then `{ ok: true }`.

- [ ] **Step 1: Write the failing tests**

Append `window.__pushTests(async function saveCheckCodeTests() { ... })`:

```js
window.__pushTests(async function saveCheckCodeTests() {
  const realRemote = App.remote;
  const CODE = "CHK-001";
  const world = {
    version: App.save.CURRENT_VERSION, code: CODE, savedAt: 0,
    pet: { species: "donut", name: "C", adoptedAt: 1, tint: 0,
           needs: { hunger: 50, energy: 50, fun: 50 }, lastTick: 1 },
    stars: 0, room: { theme: "meadow", owned: [], placed: [] },
    learn: { factsSeen: [], game: { mathLevel: 1, spellingLevel: 1, bestStreak: 0 } },
  };
  const fake = (over) => Object.assign({
    available: () => true, getWorld: async () => null,
    putWorld: async () => ({ updatedAt: 1 }), probe: async () => false,
    RemoteError: realRemote.RemoteError,
  }, over);

  App.save._resetSync();
  await App.save.remove(CODE);

  App.remote = fake({ available: () => false });
  assertEq("checkCode unknown when unavailable", await App.save.checkCode(CODE), "unknown");

  App.remote = fake({ probe: async () => false });
  assertEq("checkCode free when probe false", await App.save.checkCode(CODE), "free");

  App.remote = fake({ probe: async () => true });
  assertEq("checkCode taken when probe true", await App.save.checkCode(CODE), "taken");

  App.remote = fake({ probe: async () => { throw realRemote.RemoteError("timeout"); } });
  assertEq("checkCode unknown when probe throws", await App.save.checkCode(CODE), "unknown");

  // create: taken -> {ok:false}, nothing written
  App.remote = fake({ probe: async () => true });
  const r1 = await App.save.create(world);
  assertEq("create taken -> ok false", r1, { ok: false, reason: "code-taken" });
  assertEq("create taken wrote nothing", localStorage.getItem("potato-pet:world:" + CODE), null);

  // create: free -> {ok:true}, world written
  App.remote = fake({ probe: async () => false });
  const r2 = await App.save.create(world);
  assertEq("create free -> ok true", r2, { ok: true });
  assert("create free wrote the world",
    JSON.parse(localStorage.getItem("potato-pet:world:" + CODE)).pet.name === "C");

  // create: unknown (offline) -> still proceeds
  App.save._resetSync();
  await App.save.remove(CODE);
  App.remote = fake({ available: () => false });
  const r3 = await App.save.create(world);
  assertEq("create unknown -> ok true", r3, { ok: true });

  App.remote = realRemote;
  App.save._resetSync();
  await App.save.remove(CODE);
});
```

Also update the **Phase 1** `saveTests` block: it calls `await App.save.create` nowhere (it uses `set`), so no change needed there. Confirm by re-reading `save.tests.js` before editing.

- [ ] **Step 2: Run tests, verify FAIL**

Run: `node potato-pet/run-suite.mjs` — `saveCheckCodeTests` FAILs (`checkCode` undefined; `create` returns a world, not `{ ok }`).

- [ ] **Step 3: Implement in `save.js`**

Replace `create` and add `checkCode`:

```js
  async function checkCode(code) {
    if (!App.remote || !App.remote.available()) return "unknown";
    try { return (await App.remote.probe(code)) ? "taken" : "free"; }
    catch (_) { return "unknown"; }
  }

  async function create(world) {
    if ((await checkCode(world.code)) === "taken") {
      return { ok: false, reason: "code-taken" };
    }
    await set(world);
    return { ok: true };
  }
```

Add `checkCode` to the returned object's method list.

- [ ] **Step 4: Run tests, verify all pass**

Run: `node potato-pet/run-suite.mjs` — all green.

- [ ] **Step 5: Commit**

```bash
git add potato-pet/js/save.js potato-pet/js/save.tests.js
git commit -m "feat: best-effort code-uniqueness check at creation

save.checkCode(code) -> free|taken|unknown via a HEAD probe; create()
returns {ok:false,reason:'code-taken'} on a live collision and writes
nothing, and proceeds on free or unknown (offline)."
```

---

### Task 6: `startscreen.js` — reroll on `code-taken`

**Files:**
- Modify: `potato-pet/js/startscreen.js`

**Interfaces:**
- Consumes: `App.save.create(world)` → `{ ok: true } | { ok: false, reason: "code-taken" }` (Task 5); existing `App.world.generateWorld`, `App.content.validateName`, `randomCode`.
- Produces: no new API. The creation flow, on `create` returning `{ ok: false }`, generates a fresh code, tells the child calmly, and returns them to the preview step for the new code.

> Phase 1 established `startscreen.js` has no unit tests (it is DOM string-building). This task substitutes a manual-verification step for the test steps, and the task reviewer checks the code path by reading.

- [ ] **Step 1: Edit `nameStep` in `startscreen.js`**

Current `nameStep` (lines 72–97) ends its confirm handler with:
```js
      const world = App.world.generateWorld(code);
      world.pet.name = res.value;
      await App.save.create(world);
      container.innerHTML =
        '<h1>All set!</h1><p>Your pet\'s code is:</p>' +
        '<p class="bigcode">' + code + '</p>' +
        '<p><strong>Write this down!</strong> You\'ll need it to visit ' + res.value + ' on another device later.</p>' +
        '<p><button id="go">Play</button></p>';
      container.querySelector("#go").addEventListener("click", () => onReady(world));
```

Replace from `const world = App.world.generateWorld(code);` to the end of the handler with:

```js
      const world = App.world.generateWorld(code);
      world.pet.name = res.value;
      const result = await App.save.create(world);
      if (!result.ok && result.reason === "code-taken") {
        const fresh = randomCode();
        container.innerHTML =
          '<h1>Almost!</h1>' +
          '<p>That code was already taken — here\'s a new one.</p>' +
          '<p><strong>' + fresh + '</strong></p>' +
          '<p><button id="again">OK</button></p>';
        container.querySelector("#again").addEventListener("click",
          () => startCreation(container, onReady, fresh));
        return;
      }
      container.innerHTML =
        '<h1>All set!</h1><p>Your pet\'s code is:</p>' +
        '<p class="bigcode">' + code + '</p>' +
        '<p><strong>Write this down!</strong> You\'ll need it to visit ' + res.value + ' on another device later.</p>' +
        '<p><button id="go">Play</button></p>';
      container.querySelector("#go").addEventListener("click", () => onReady(world));
```

- [ ] **Step 2: Let `startCreation` accept a seed code**

Current signature (line 54): `function startCreation(container, onReady) {` with `let code = randomCode();` on line 55.

Change to:
```js
  function startCreation(container, onReady, seedCode) {
    let code = seedCode || randomCode();
```
Everything else in `startCreation` is unchanged (it already reads/reassigns `code` via the Reroll button).

- [ ] **Step 3: Manual verification**

Because `checkCode` needs a live server to ever return `"taken"`, verify the happy path here and the reroll path in Task 8's integration check:
- Open `potato-pet/index.html` from `file://` (no server, so `create` → `checkCode` → `"unknown"` → proceeds). Make a new pet end-to-end: preview → Reroll a few times → Keep → name → "All set!" shows the code → Play boots the game.
- Read the new `nameStep` branch: on `{ ok: false, reason: "code-taken" }` it must NOT fall through to "All set!"; it shows "Almost!" and the OK button calls `startCreation(container, onReady, fresh)`.
Expected: happy path unchanged from Phase 1; no console errors.

- [ ] **Step 4: Run the logic suite (unchanged, must stay green)**

Run: `node potato-pet/run-suite.mjs`
Expected: same green count as after Task 5.

- [ ] **Step 5: Commit**

```bash
git add potato-pet/js/startscreen.js
git commit -m "feat: reroll the code if creation hits a live collision

nameStep handles App.save.create -> {ok:false,reason:'code-taken'} by
generating a fresh code, showing a calm 'that one was taken' screen, and
restarting the preview step seeded with the new code."
```

---

### Task 7: `devpanel.js` — restore previous pet state

**Files:**
- Modify: `potato-pet/js/devpanel.js`

**Interfaces:**
- Consumes: `App.save._readBackup(code)` → `{ world, replacedAt } | null` (Task 3); existing `App.save.set`, `App.state`, `App.gamescreen`.
- Produces: no new API. One extra button in the dev panel, shown only when `App.save._readBackup(world.code)` is non-null.

> Like Task 6, `devpanel.js` has no unit tests (Phase 1 precedent — it is a fixed-position debug panel gated behind `?dev`). Manual-verification step substitutes for test steps.

- [ ] **Step 1: Add the button in `mount`**

In `potato-pet/js/devpanel.js`, after the existing `btn("reset this pet", …)` line (line 26) and before `document.body.appendChild(p);`, add:

```js
    const backup = App.save._readBackup(world.code);
    if (backup && backup.world) {
      const when = new Date(backup.replacedAt).toLocaleString();
      btn("restore previous state (" + when + ")", async () => {
        if (!window.confirm("Replace the current pet with the backup from " + when + "?")) return;
        const restored = backup.world;
        restored.savedAt = Date.now();
        await App.save.set(restored);
        location.reload();
      });
    }
```

- [ ] **Step 2: Manual verification**

- Open `potato-pet/index.html?dev`. With no backup slot for the current code, the "restore previous state" button is absent.
- In the browser console: `localStorage.setItem("potato-pet:backup:" + App.state.world.code, JSON.stringify({ world: App.state.world, replacedAt: Date.now() }))`, then reload `?dev`. The button appears with a date. Click it → confirm → page reloads → game still boots.
Expected: no console errors; button visibility tracks the backup slot.

- [ ] **Step 3: Run the logic suite**

Run: `node potato-pet/run-suite.mjs` — unchanged green count.

- [ ] **Step 4: Commit**

```bash
git add potato-pet/js/devpanel.js
git commit -m "feat: dev-panel button to restore the pre-sync backup

Shown only when potato-pet:backup:<code> exists; confirms, writes the
backed-up world through save.set (fresh savedAt so it re-syncs), reloads."
```

---

### Task 8: The Cloudflare Worker + tests

**Files:**
- Create: `worker/src/index.js`
- Create: `worker/wrangler.toml`
- Create: `worker/schema.sql`
- Create: `worker/package.json`
- Create: `worker/test/worker.test.js`
- Create: `worker/.gitignore`

**Interfaces:**
- Consumes: nothing from the game. Environment binding `env.DB` (D1).
- Produces: an HTTP contract the game's `App.remote` depends on:
  - `GET /world/:code` → `200 { data: <string>, version: <number>, updated_at: <number> }` (JSON; `data` is the stored world string, NOT re-parsed) or `404`.
  - `HEAD /world/:code` → `200` (no body) or `404`.
  - `PUT /world/:code` with a JSON world body → `200 { updated_at: <number> }`. Guards: `413` body > 32768 bytes; `422` non-JSON / not an object / missing `version|pet|room|learn` / `version` not a number; `400` bad `:code`.
  - `OPTIONS /world/:code` → `204` with CORS headers.
  - Any other method → `405`.
  - Every response (success and error) carries: `Access-Control-Allow-Origin: https://tato.forgesync.co.nz`, `Access-Control-Allow-Methods: GET, PUT, HEAD, OPTIONS`, `Access-Control-Allow-Headers: Content-Type`, `Access-Control-Max-Age: 86400`.
  - `updated_at` is always `Date.now()` measured in the Worker.

- [ ] **Step 1: Scaffold the `worker/` config files**

`worker/package.json`:
```json
{
  "name": "potato-pet-api",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/",
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "wrangler": "^3.80.0"
  }
}
```

`worker/wrangler.toml`:
```toml
name = "potato-pet-api"
main = "src/index.js"
compatibility_date = "2024-11-01"

[[d1_databases]]
binding = "DB"
database_name = "potato-pet"
# Replaced with the real id during setup (see SETUP.md). A placeholder is
# fine for local `wrangler dev` / `unstable_dev`, which use a local SQLite file.
database_id = "00000000-0000-0000-0000-000000000000"
```

`worker/schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS worlds (
  code       TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  version    INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

`worker/.gitignore`:
```
node_modules/
.wrangler/
.dev.vars
```

- [ ] **Step 2: Write the failing tests**

`worker/test/worker.test.js`:
```js
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
});

test("PUT non-JSON -> 422", async () => {
  const res = await worker.fetch(`/world/${CODE}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: "not json",
  });
  assert.equal(res.status, 422);
});

test("PUT missing a required key -> 422", async () => {
  const bad = goodWorld(); delete bad.learn;
  const res = await worker.fetch(`/world/${CODE}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bad),
  });
  assert.equal(res.status, 422);
});

test("PUT version not a number -> 422", async () => {
  const bad = { ...goodWorld(), version: "1" };
  const res = await worker.fetch(`/world/${CODE}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bad),
  });
  assert.equal(res.status, 422);
});

test("bad code format -> 400", async () => {
  assert.equal((await worker.fetch(`/world/not_a_code`)).status, 400);
});

test("OPTIONS -> 204 with all CORS headers", async () => {
  const res = await worker.fetch(`/world/${CODE}`, { method: "OPTIONS" });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-methods"), "GET, PUT, HEAD, OPTIONS");
  assert.equal(res.headers.get("access-control-allow-headers"), "Content-Type");
  assert.equal(res.headers.get("access-control-max-age"), "86400");
});

test("unsupported method -> 405", async () => {
  assert.equal((await worker.fetch(`/world/${CODE}`, { method: "POST" })).status, 405);
});
```

- [ ] **Step 3: `npm install` and run the tests to confirm they FAIL**

Run: `cd worker && npm install && npm test`
Expected: `unstable_dev` starts, `src/index.js` not found or all assertions fail. (If `unstable_dev` cannot start a local D1 with the placeholder `database_id`, that is the one likely blocker — see the implementer note at the end of this task.)

- [ ] **Step 4: Implement `worker/src/index.js`**

```js
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
```

- [ ] **Step 5: Run the tests to confirm they PASS**

Run: `cd worker && npm test`
Expected: all `node:test` cases pass.

- [ ] **Step 6: Confirm the game suite is still green**

Run: `node potato-pet/run-suite.mjs`
Expected: unchanged green count (this task touched nothing under `potato-pet/`).

- [ ] **Step 7: Commit**

```bash
git add worker/
git commit -m "feat: Cloudflare Worker + D1 backend for world sync

GET/PUT/HEAD/OPTIONS /world/:code against a D1 'worlds' table, one JSON
blob per row, server-stamped updated_at, single hard-coded CORS origin,
32KB body cap and shape validation on PUT, lazy CREATE TABLE. node:test
suite drives it through wrangler unstable_dev + local D1."
```

**Implementer note (likely ruling point):** if `unstable_dev` refuses to start with the placeholder `database_id`, options in order of preference: (a) generate a real throwaway UUID for the placeholder (a valid-looking id is often enough for local mode); (b) add `--local` / `local: true` explicitly to the `unstable_dev` opts; (c) if D1 local provisioning still fails, switch the test to bind a D1 via `getPlatformProxy()` from `wrangler` and pass a `Miniflare` D1 — keep the same assertions. Record whichever you used as a `Ruling:` in the ledger.

---

### Task 9: CI workflow to deploy the Worker

**Files:**
- Create: `.github/workflows/deploy-worker.yml`

**Interfaces:**
- Consumes: repo secret `CLOUDFLARE_API_TOKEN` (created during setup, Task 10); `worker/package.json`, `worker/wrangler.toml`.
- Produces: on every push to `main` that changes `worker/**`, a `wrangler deploy` run. Does not touch the game's Pages deploy.

> This file cannot be runtime-verified without pushing to GitHub. The task's deliverable is the reviewed YAML; the maintainer confirms it on the first real push (documented in `SETUP.md`).

- [ ] **Step 1: Write the workflow**

`.github/workflows/deploy-worker.yml`:
```yaml
name: Deploy Worker

on:
  push:
    branches: [main]
    paths: ['worker/**']
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: worker
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

- [ ] **Step 2: Lint-check the YAML locally**

Run: `node -e "const y=require('fs').readFileSync('.github/workflows/deploy-worker.yml','utf8'); if(!/paths: \['worker\/\*\*'\]/.test(y)) throw new Error('path filter missing'); console.log('ok')"`
Expected: `ok`. (No YAML parser is a repo dep; this is a smoke check. The reviewer reads the file.)

- [ ] **Step 3: Confirm `npm ci` will work in CI**

Run: `cd worker && npm install && test -f package-lock.json && echo "lockfile present"`
Expected: `lockfile present` — `npm ci` in the workflow needs `worker/package-lock.json` committed. If Task 8 did not commit it, commit it now with this task.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy-worker.yml worker/package-lock.json
git commit -m "ci: deploy the Worker on pushes touching worker/**

Separate from deploy-pages.yml; runs wrangler deploy with a
CLOUDFLARE_API_TOKEN repo secret. Game deploy is unaffected."
```

---

### Task 10: Documentation

**Files:**
- Create: `worker/SETUP.md`
- Modify: `potato-pet/TESTING.md`
- Modify: `potato-pet/README.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Write `worker/SETUP.md`**

```markdown
# Worker setup — do this once

The game runs fine without any of this (local-only). These steps turn on
cross-device sync: a pet code restores the pet on any device.

## 1. Cloudflare account + D1 database
1. Make a free account at https://dash.cloudflare.com.
2. Install the CLI and log in (from this `worker/` folder):
   npm install
   npx wrangler login
3. Create the database:
   npx wrangler d1 create potato-pet
4. Copy the printed `database_id` into `worker/wrangler.toml`, replacing
   the `00000000-...` placeholder. Commit that change.
5. Create the table in the real database:
   npx wrangler d1 execute potato-pet --remote --file=schema.sql

## 2. First deploy (from your machine, to confirm it works)
   npx wrangler deploy
Note the URL it prints, e.g. https://potato-pet-api.<your-subdomain>.workers.dev

## 3. Point the game at it
Edit `potato-pet/js/config.js`:
   App.config = { apiBase: "https://potato-pet-api.<your-subdomain>.workers.dev" };
Commit and push. The game redeploys itself (deploy-pages.yml).

## 4. Let CI deploy the Worker from now on
1. Cloudflare dashboard -> My Profile -> API Tokens -> Create Token
   -> "Edit Cloudflare Workers" template -> scope to your account -> create -> copy.
2. GitHub repo -> Settings -> Secrets and variables -> Actions
   -> New repository secret -> name `CLOUDFLARE_API_TOKEN` -> paste.
3. From now on, any push that changes `worker/**` redeploys the Worker
   (`.github/workflows/deploy-worker.yml`). Watch the first one under the
   repo's Actions tab.

## Quick check it's live
   curl -si https://potato-pet-api.<your-subdomain>.workers.dev/world/AAA-AAA
Expect `HTTP/2 404` and an `access-control-allow-origin` header.
```

- [ ] **Step 2: Add a Phase 2 section to `potato-pet/TESTING.md`**

Append:
```markdown

## Phase 2 — cross-device sync (needs `apiBase` set)

1. Adopt a pet in browser A. Write down the code. Decorate the room a bit.
2. Open browser B (or a private window). "Enter a code" -> type the code.
   The pet, stars, and room should match A.
3. In B: feed the pet, buy/place one decoration. Close the tab (or wait ~35s).
4. Reload A. B's changes appear. Open `index.html?dev` on A — a
   "restore previous state" button is now there; clicking it brings back
   A's pre-sync pet.
5. Turn off wifi. Play in A — everything still works, no errors, no spinners.
   Turn wifi back on, interact once, wait ~35s — the change reaches B on its
   next load.
6. Make a new pet while offline — it should still work (the code is not
   checked); it syncs on the next load.
```

- [ ] **Step 3: Update `potato-pet/README.md`**

- Change the intro line `Phase 1: fully local, no server.` to `Local-first; optional cloud sync via a short code (Phase 2).`
- Under "Run the logic tests", add:
  ```markdown
  Headless: `node run-suite.mjs` from this folder (needs Node 20+). Prints `N / N passed`.
  ```
- Replace the "What's next (later phases)" list with:
  ```markdown
  ## Cloud sync (optional)
  Off by default. To turn it on, follow `../worker/SETUP.md` and set
  `apiBase` in `js/config.js`. With it off, the game is 100% local.

  ## What's next
  - Phase 3: real CC0 pixel-art sprites in place of the coloured blocks.
  ```

- [ ] **Step 4: Verify nothing else broke**

Run: `node potato-pet/run-suite.mjs` and `cd worker && npm test`
Expected: both green.

- [ ] **Step 5: Commit**

```bash
git add worker/SETUP.md potato-pet/TESTING.md potato-pet/README.md
git commit -m "docs: Worker setup guide, Phase 2 manual test steps, README sync notes"
```

---

## Self-Review

**1. Spec coverage**

| Spec section | Task(s) |
|---|---|
| §2.1 standalone Worker + D1, GitHub Pages untouched | 8, 9 |
| §2.2 newest-wins + one-slot backup | 3, 7 |
| §2.3 best-effort code check, degrade offline | 5, 6 |
| §2.4 CI deploys the Worker | 9, 10 |
| §2.5 Approach A — thin transport, save.js orchestrates | 2, 3, 4, 5 |
| §4 `js/remote.js` API (available/getWorld/putWorld/probe, RemoteError, _fetch, TIMEOUT_MS) | 2 |
| §5 `save.js` load reconcile, backup, `savedAt` normalization, raw write | 3 |
| §5 `save.js` set debounce, pending mirror, hide-flush, dirty rules | 4 |
| §5 `save.js` checkCode, create result, remove clears backup | 3 (remove), 5 |
| §6 config.js comment / value | 2 |
| §6 startscreen handles `{ok:false}` | 6 |
| §7 D1 schema | 8 |
| §7 endpoints GET/PUT/HEAD/OPTIONS, guards 413/422/400, 405 | 8 |
| §7 CORS single origin on every response | 8 |
| §7 Worker stamps updated_at | 8 |
| §8 deploy-worker.yml + SETUP.md | 9, 10 |
| §9 error-handling map (child sees nothing; 4xx clears dirty) | 2, 4 |
| §10 remote.tests.js, save.tests.js additions, worker tests, TESTING.md | 2, 3, 4, 5, 8, 10 |
| §10 headless runner carries remote.js | 1, 2 |
| §11 devpanel restore button | 7 |
| §12 file manifest | all; `run-suite.mjs` committed in Task 1 (spec left it optional) |
| §13 out of scope | respected — no merge, one backup slot, no server delete, `*.workers.dev` |
| §14 rollout / verify-done | Task 8 tests + Task 10 TESTING.md + SETUP.md curl check |

No gaps. One deliberate deviation from spec §6, recorded here: `config.js` keeps `apiBase: ""` in the repo (spec §6 showed a placeholder URL). Rationale: a committed non-resolving URL would make every game load wait for a 5 s timeout; `""` degrades cleanly and the maintainer sets the real URL in Task 10 / `SETUP.md`. Spec §9's "apiBase empty → local-only, nothing shown" already anticipates this.

**2. Placeholder scan** — no `TBD` / `TODO` / "add error handling" / "similar to Task N" / prose-only code steps. Every code step has real code. The `00000000-…` D1 id and `<your-subdomain>` are genuine user-supplied-later values, called out as such with the fill-in step in `SETUP.md`.

**3. Type consistency**

- `RemoteError` shape (`.name`, `.kind`, `.status`) — defined Task 2, consumed Tasks 3/4/5 via `err.kind` / `err.status` and `App.remote.RemoteError(kind, status)` in tests. Consistent.
- `getWorld` result `{ data, version, updatedAt }` (camel `updatedAt`) — Task 2 produces it; Task 3 reads `server.updatedAt` and `server.data`. Consistent. The Worker's wire format is `updated_at` (snake); `remote.js` is the only place that maps snake→camel. Task 8 tests assert the wire `updated_at`; Task 2 tests assert the mapping. Consistent.
- `putWorld` result `{ updatedAt }` — Task 2 produces; Task 4 reads `result.updatedAt`. Consistent.
- `checkCode` → `"free" | "taken" | "unknown"` — Task 5 produces; Task 6 checks `result.reason === "code-taken"` (from `create`, not `checkCode`). `create` → `{ ok, reason }` — Task 5 produces; Task 6 consumes. Consistent.
- `_readBackup(code)` → `{ world, replacedAt }` — Task 3 produces; Task 7 reads `backup.world` / `backup.replacedAt`. Consistent.
- `_resetSync` / `_pending` / `_flushPush` / `_PUSH_INTERVAL_MS` — introduced Task 3 (minimal) / Task 4 (full), used across `save.tests.js` blocks from Task 3 on. Consistent.
- `writeLocalRaw(world)` name — Task 3 defines and uses; Task 4 uses in `doPush`. Consistent.
- `startCreation(container, onReady, seedCode)` — Task 6 changes the signature and both call sites it adds; the existing call site in `render` (`makenew` handler) passes two args, `seedCode` is optional (`seedCode || randomCode()`). Consistent.

No mismatches found.
