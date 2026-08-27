# Potato Pet — Phase 2: Cloud Sync Design Spec

**Date:** 2026-08-27
**Status:** Approved design, pre-implementation
**Parent spec:** `2026-08-27-potato-pet-design.md` (§5.1 world object, §5.2 D1 schema,
§11 local-first + D1 sync, §16 deferred decisions)
**Phase 1:** complete and merged to `main`; live at https://tato.forgesync.co.nz/

---

## 1. Context and goal

Phase 1 shipped a fully playable local game. `App.save` is the only module that
touches `localStorage`, and its whole public API (`list`, `load`, `set`, `create`,
`remove`) has been `async` since day one — the seam this phase fills.

**Goal:** a child types their 6-character code on any device and their pet — needs,
room, decorations, learning progress — is there. The game stays instant and fully
playable with no network. Sync is a background convenience, never a gate.

### What changed since the parent spec was written

The parent spec's §11 assumed the game and its API would both live on **Cloudflare
Pages**, so the API could be **Pages Functions** on the same origin (no CORS) and a
`POST /world` route could hand out server-assigned unique codes.

The game now deploys on **GitHub Pages**, which has no server-side code. This spec
supersedes §11's transport decisions accordingly:

| Parent spec §11 | This phase |
|---|---|
| API = Pages Functions, same origin, no CORS | API = a standalone Cloudflare Worker, cross-origin, one hard-coded CORS origin |
| `POST /world` returns a server-assigned unique code | Code is still generated on the device; creation does a best-effort `HEAD` existence check and degrades offline |
| Silent newest-wins | Newest-wins, and the losing local save is kept in a one-slot backup recoverable from the parent/dev panel |
| `PUT` body cap ~64 KB | 32 KB (a world blob is 2–4 KB; 32 KB is already a huge margin) |
| `remove` — server delete deferred (§16) | unchanged: `remove` stays local-only |

Everything in the parent spec not listed above still holds — the world object shape,
`world.savedAt` / `updated_at` as the newest-wins pair, the D1 table columns, the
zero-build front-end.

---

## 2. Decisions taken during brainstorming

1. **Backend host:** standalone Cloudflare Worker + D1. The game keeps hosting on
   GitHub Pages, untouched. No DNS or domain changes.
2. **Sync conflict model:** newest-wins at whole-world granularity (no field merge),
   plus a single-slot backup of the overwritten local save, restorable from the
   parent/dev panel.
3. **Code uniqueness:** best-effort. When online, creation checks the code with a
   `HEAD` request and rerolls on collision. When offline, it proceeds and reconciles
   on first sync. (30-char alphabet, 6 chars → ~729M codes; collision at
   family/friends scale is negligible.)
4. **Worker deployment:** a second GitHub Actions workflow runs `wrangler deploy` on
   pushes touching `worker/**`, authenticated by a `CLOUDFLARE_API_TOKEN` repo
   secret. "Push and forget," same model as the game deploy.
5. **Structure:** Approach A — a thin transport module (`js/remote.js`) with all
   orchestration staying in `js/save.js`. The rest of the game never learns sync
   exists.

---

## 3. Architecture overview

```
  Browser (GitHub Pages, https://tato.forgesync.co.nz)
  ┌─────────────────────────────────────────────────────┐
  │  game modules (main, gamescreen, state, …)           │
  │        │  App.save.{list,load,set,create,remove,      │
  │        │            checkCode}   ← unchanged surface  │
  │        ▼                                              │
  │  js/save.js  — orchestrator                           │
  │     • localStorage read/write (source of truth)       │
  │     • newest-wins reconcile + backup slot             │
  │     • debounced push, dirty-retry                     │
  │        │  App.remote.{getWorld,putWorld,probe}        │
  │        ▼                                              │
  │  js/remote.js — transport only (fetch + timeout)      │
  └────────┼────────────────────────────────────────────-┘
           │  HTTPS + CORS
           ▼
  Cloudflare Worker  (potato-pet-api.<subdomain>.workers.dev)
     GET / PUT / HEAD / OPTIONS  /world/:code
           │
           ▼
  Cloudflare D1   worlds(code PK, data, version, updated_at)
```

**Boundaries:**

- `js/remote.js` never touches `localStorage` or `App.state`. It knows URLs, HTTP,
  timeouts, and how to normalize failures. Testable with a fake `fetch`.
- `js/save.js` never calls `fetch`. It owns storage, the merge rule, the backup
  slot, and push scheduling. Testable with a fake `App.remote`.
- The Worker never trusts the client's timestamps for ordering — it stamps
  `updated_at` from its own clock on every write.

---

## 4. `js/remote.js` (new) — `App.remote`

Loaded by a `<script>` tag in `index.html` and `tests.html` **after `config.js`,
before `save.js`**.

```
App.remote = {
  available(): boolean
  getWorld(code): Promise<{ data, version, updatedAt } | null>
  putWorld(code, world): Promise<{ updatedAt }>
  probe(code): Promise<boolean>
  _fetch: window.fetch            // test seam, overridable
  TIMEOUT_MS: 5000
}
```

### Behaviour

- **`available()`** → `!!(App.config && App.config.apiBase)`. Every other method,
  when `available()` is false, rejects with `RemoteError{kind:"offline"}` without
  making a request. (`save.js` checks `available()` first and simply skips remote
  work; `remote` still guards defensively.)
- **`getWorld(code)`** → `GET {apiBase}/world/{code}`.
  - `200` → parse JSON body, return `{ data, version, updatedAt }` where `data` is
    the parsed world object (the Worker returns `data` as a JSON string in the row;
    `remote` parses it so `save.js` gets an object). If the body is missing fields
    or `data` won't parse → throw `RemoteError{kind:"bad-response"}`.
  - `404` → return `null`.
  - `5xx` or any other status → `RemoteError{kind:"http", status}`.
- **`putWorld(code, world)`** → `PUT {apiBase}/world/{code}`, `Content-Type:
  application/json`, body = `JSON.stringify(world)`.
  - `200` → return `{ updatedAt }` from the response body.
  - `4xx`/`5xx` → `RemoteError{kind:"http", status}`.
- **`probe(code)`** → `HEAD {apiBase}/world/{code}`. `200` → `true`, `404` →
  `false`, anything else → `RemoteError{kind:"http", status}`.
- **Timeouts / network:** every request uses an `AbortController` armed at
  `TIMEOUT_MS`. Abort → `RemoteError{kind:"timeout"}`. `fetch` rejection (DNS, no
  connection, CORS failure) → `RemoteError{kind:"offline"}`.

### `RemoteError`

A small `Error` subclass (or a plain `Error` with `.kind` and optional `.status`
set). `kind ∈ {"offline","timeout","http","bad-response"}`. `save.js` treats all
four kinds identically — "remote unavailable, local wins" — but the kind is logged
to `console` for the maintainer.

---

## 5. `js/save.js` (changed) — orchestration

Public API unchanged: `list`, `load`, `set`, `create`, `remove`, all `async`. One
**additive** method: `checkCode(code)`.

### `load(code)`

1. `local` = read + migrate from `localStorage` (existing Phase 1 logic, including
   the `SAVE_CORRUPT` throw on malformed local data).
2. If `!App.remote.available()` → return `local` (or the existing not-found path if
   `local` is null).
3. `try { server = await App.remote.getWorld(code) }`
   `catch (RemoteError) { return local }`  — offline path, no error surfaced.
4. Reconcile:
   - `server` is `null` (no row): return `local`; if `local` exists, mark `code`
     dirty so the next push creates the row.
   - `server.updatedAt > localTimestamp(local)`: **server wins.** If `local` is
     non-null, write `potato-pet:backup:<code>` = `{ world: local, replacedAt:
     Date.now() }` (overwriting any previous backup for this code). Write
     `server.data` to `localStorage`. Return `server.data`.
   - `server.updatedAt < localTimestamp(local)`: **local wins.** Mark `code` dirty.
     Return `local`.
   - equal, or `local` is null and `server` present: write `server.data` to local
     if not already identical, return it; no backup, not dirty.
5. `localTimestamp(local)` = `local.savedAt` when present, else `0`.

### `set(world)`

1. Stamp `world.savedAt = Date.now()` and write to `localStorage` — unchanged, and
   the promise resolves as fast as Phase 1.
2. `schedulePush(world)`:
   - Keep a module-level `lastPushedSerial` (a `JSON.stringify` of the last world
     successfully sent, per code). If the new `world` serializes identically, do
     nothing.
   - Otherwise mark `code` dirty and (re)arm a single `setTimeout`. The push fires
     **at most once per `PUSH_INTERVAL_MS` (30000)**. On fire: if
     `App.remote.available()`, `await App.remote.putWorld(code, world)`; on success
     clear dirty and update `lastPushedSerial`; on `RemoteError` apply the §9 rule
     — keep dirty for `offline` / `timeout` / `http 429` / `http 5xx` (retries on
     the next `set`, tick, or `load`); clear dirty after logging for `http 4xx`
     (≠ 429) and `bad-response`, since resending the same body only fails again.
3. A `visibilitychange`→`hidden` / `pagehide` listener (registered once, on first
   `set`) flushes a pending dirty push immediately so a closed tab keeps its last
   changes. Uses `putWorld` normally; failures are swallowed (page is going away).

### `create(world)`

1. `checkCode(world.code)`:
   - `"taken"` → return `{ ok: false, reason: "code-taken" }` (the startscreen
     rerolls).
   - `"free"` or `"unknown"` → continue.
2. Write local + index entry (existing Phase 1 logic).
3. Mark `code` dirty → first push creates the row.
4. Return `{ ok: true }`.

### `checkCode(code)` (new)

- `!App.remote.available()` → `"unknown"`.
- `try { return (await App.remote.probe(code)) ? "taken" : "free" }`
  `catch (RemoteError) { return "unknown" }`.

### `remove(code)`

Unchanged — deletes the local save and index entry only. Also deletes
`potato-pet:backup:<code>` if present. No server call (parent spec §16).

### `list()`

Unchanged — reads the local `potato-pet:index`. No network. (Cross-device
discovery of "which pets exist" is a non-goal; you need the code.)

### Dirty-state storage

`code` "dirty" is tracked in memory for the session and mirrored to
`localStorage` key `potato-pet:pending` (an array of codes) so a reload after an
offline session still knows to push. `load` and the tick both attempt to drain it.

---

## 6. `js/config.js` and `js/startscreen.js` (changed)

### `config.js`

```js
window.App = window.App || {};
App.config = { apiBase: "https://potato-pet-api.<your-subdomain>.workers.dev" };
```

Committed in the repo. It is **not** a secret — by design, anyone with a code can
read and write that world. Empty string / missing → the game runs local-only
(this is the supported local-dev mode).

### `startscreen.js`

The creation flow (`startCreation` → `nameStep`) calls `App.save.create`, which now
returns `{ ok, reason? }`:

- `{ ok: true }` → proceed to the "All set! Write this down" screen as today.
- `{ ok: false, reason: "code-taken" }` → reroll the code once, repaint the preview
  with a small, calm note ("That code was taken — here's another!"), and let the
  child keep or reroll again. Because the world is seeded from the code, the
  previewed species/room will change on reroll; that is acceptable at collision
  frequency.

The returning-player "enter a code" path already calls `safeLoad` → `App.save.load`,
which now transparently pulls from the server. No change needed there beyond what
`load` does internally.

---

## 7. The Cloudflare Worker (`worker/`)

New top-level directory, separate from `potato-pet/` so the game stays a pure
static folder.

```
worker/
  src/index.js        the Worker (Module Worker: export default { fetch })
  wrangler.toml       name, main, compatibility_date, [[d1_databases]] binding
  schema.sql          CREATE TABLE worlds …
  test/worker.test.js round-trip + guard tests
  package.json        wrangler + test deps (confined here; never affects the game)
  SETUP.md            one-time setup click-path
```

### D1 schema (`worker/schema.sql`)

```sql
CREATE TABLE IF NOT EXISTS worlds (
  code       TEXT PRIMARY KEY,
  data       TEXT NOT NULL,      -- world JSON blob, stored verbatim
  version    INTEGER NOT NULL,   -- world.version, server-side sanity only
  updated_at INTEGER NOT NULL    -- epoch ms, set by the Worker on every write
);
```

### Routing

All requests are `/world/:code`. `:code` is uppercased and normalized to `XXX-XXX`
before use. Anything not matching `^[2-9A-HJ-NP-Z]{3}-[2-9A-HJ-NP-Z]{3}$` after
normalization → `400`.

| Method | Behaviour | Success | Absent |
|---|---|---|---|
| `GET` | `SELECT data, version, updated_at FROM worlds WHERE code = ?` | `200 {data, version, updated_at}` (`data` is the stored string) | `404` |
| `HEAD` | `SELECT 1 FROM worlds WHERE code = ?` | `200` (no body) | `404` |
| `PUT` | validate body, then `INSERT INTO worlds … ON CONFLICT(code) DO UPDATE SET data=?, version=?, updated_at=?` with `updated_at` = `Date.now()` on the Worker | `200 {updated_at}` | n/a |
| `OPTIONS` | CORS preflight | `204` + CORS headers | n/a |
| other | — | `405` | — |

### `PUT` validation (in order)

1. `Content-Length` > `32768`, or the read body exceeds it → `413`.
2. Body not valid JSON → `422`.
3. Parsed body fails the shape check — not a non-null object, or missing any of
   `version` / `pet` / `room` / `learn` → `422`. (Same check `save.js` and
   `backup.js` already use.)
4. `typeof body.version !== "number"` → `422`.
5. Otherwise store `data` = the raw request text (not a re-serialization),
   `version` = `body.version`, `updated_at` = `Date.now()`.

### CORS

Every response (including errors) carries:

```
Access-Control-Allow-Origin: https://tato.forgesync.co.nz
Access-Control-Allow-Methods: GET, PUT, HEAD, OPTIONS
Access-Control-Allow-Headers: Content-Type
Access-Control-Max-Age: 86400
```

A single hard-coded origin. No wildcard, no `Origin` reflection. If the custom
domain ever changes, this string and `config.js` change together.

### Abuse posture

- The 32 KB cap and shape check reject junk writes cheaply.
- Reads/HEADs of unknown codes are cheap `404`s.
- Cloudflare's built-in Worker rate limiting is left at its default; a dashboard
  rate-limit rule can be added later if needed. No custom rate-limiting code in v1
  (YAGNI at family scale).
- D1 free tier (5 GB, 5M reads/day, 100k writes/day) is orders of magnitude beyond
  expected load; the 30 s push debounce keeps writes to roughly 100–300/day per
  active player.

---

## 8. Deployment and one-time setup

### `.github/workflows/deploy-worker.yml` (new)

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
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
        working-directory: worker
      - run: npx wrangler deploy
        working-directory: worker
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

The game's existing `deploy-pages.yml` is untouched and still fires on every push;
adding `paths:` to *this* workflow keeps Worker deploys from running on game-only
changes, but the game workflow keeps deploying on all pushes as before.

### `worker/SETUP.md` — run once

1. Create a Cloudflare account (free).
2. `npm create cloudflare` is not needed — the `worker/` folder is already set up.
   From `worker/`: `npm install`.
3. `npx wrangler login` (local, one time) then
   `npx wrangler d1 create potato-pet`.
4. Paste the printed `database_id` into `worker/wrangler.toml` under
   `[[d1_databases]]`. Commit.
5. `npx wrangler d1 execute potato-pet --remote --file=schema.sql`.
6. `npx wrangler deploy` once from your machine to confirm it works, and note the
   `*.workers.dev` URL it prints.
7. Put that URL in `potato-pet/js/config.js` → `apiBase`. Commit.
8. In Cloudflare: **My Profile → API Tokens → Create Token → "Edit Cloudflare
   Workers" template**, scoped to your account. Copy it.
9. In GitHub: **repo → Settings → Secrets and variables → Actions → New repository
   secret**, name `CLOUDFLARE_API_TOKEN`, paste.

After step 9, every push that changes `worker/**` redeploys the Worker
automatically.

---

## 9. Error handling — "the network is optional"

| Situation | Result |
|---|---|
| `apiBase` empty / offline / DNS fail / CORS fail | `RemoteError{kind:"offline"}` → `save` returns local; nothing shown |
| Request exceeds 5 s | `RemoteError{kind:"timeout"}` → same as offline |
| Worker `5xx`, or D1 error | `RemoteError{kind:"http"}` → same as offline |
| Worker returns malformed body | `RemoteError{kind:"bad-response"}` → same as offline |
| `PUT` rejected `413`/`422`/`400` | logged to `console` for the maintainer; child sees nothing; local save untouched; **dirty flag cleared** (a rejected payload won't succeed on retry — it's logged, not looped) |
| Push succeeds later | dirty flag cleared, `lastPushedSerial` updated |

The child never sees a sync spinner, error toast, or "connection lost" banner. The
only sync-related thing a child can encounter is the rare creation-time reroll.
`main.js`'s global `error` / `unhandledrejection` overlay stays as the last resort,
but `RemoteError` is always caught inside `save.js` before it can reach it.

**Exception to "retry forever":** a `4xx` on `PUT` (except `429`) clears the dirty
flag after logging, because the same body will fail again. A `429` or `5xx` keeps
it dirty.

---

## 10. Testing

### Game-side — the existing hand-rolled harness (`tests.html` + `run-suite.mjs`)

Both the browser harness and the Node runner get `remote.js` added to their module
load list (after `config.js`, before `save.js`), and two new `*.tests.js` files.

**`js/remote.tests.js`** (fake `fetch` via `App.remote._fetch`):

- `getWorld` → object on `200`; `null` on `404`; `RemoteError{kind:"http"}` on
  `500`; `{kind:"timeout"}` when the fake never resolves (AbortController fires);
  `{kind:"offline"}` when the fake rejects; `{kind:"bad-response"}` on unparseable
  `data`.
- `putWorld` → sends `PUT`, correct URL, `application/json` body; returns
  `{updatedAt}` on `200`; throws on `4xx`/`5xx`.
- `probe` → `true` on `200`, `false` on `404`, throws otherwise.
- `available()` → false with empty `apiBase`; methods reject `{kind:"offline"}`
  without calling `_fetch`.

**`js/save.tests.js`** additions (fake `App.remote`):

- server newer → `potato-pet:backup:<code>` written with the old local world;
  server world returned and in `localStorage`.
- local newer → server not written; `code` in `potato-pet:pending`.
- server `null` + local present → local returned; `code` pending.
- `remote.available()` false → behaviour byte-identical to Phase 1 (regression
  guard against the whole load/set/create surface).
- `getWorld` throws → `load` returns local, no throw escapes.
- `set` debounce: N rapid `set`s within the interval → ≤1 `putWorld`; a `set` with
  an unchanged world → 0 `putWorld`.
- `checkCode` → `"taken"` / `"free"` / `"unknown"` for exists / `404` / thrown.
- `create` with `checkCode → "taken"` → `{ok:false, reason:"code-taken"}`, nothing
  written locally.
- `PUT` `422` → dirty flag cleared, `console.error` called.
- All Phase 1 tests still pass unchanged.

### Worker-side — `worker/test/worker.test.js`

Run with Cloudflare's Workers test tooling (`vitest` + `@cloudflare/vitest-pool-workers`,
or `unstable_dev` — chosen at plan time for the lighter footprint) against an
in-memory D1:

- `PUT` a valid world → `200 {updated_at}`; then `GET` → same `data`, `updated_at`
  matches; `HEAD` → `200`.
- `GET` / `HEAD` unknown code → `404`.
- `PUT` body > 32 KB → `413`.
- `PUT` non-JSON → `422`; `PUT` JSON missing `learn` → `422`; `PUT` `version` not a
  number → `422`.
- `GET /world/bad_code` → `400`.
- `OPTIONS` → `204` with all four CORS headers.
- `POST` → `405`.
- `updated_at` is the Worker's clock, not any client-supplied value.

This is the only npm/test-tooling in the repo. It lives entirely under `worker/`
and never touches the game's zero-build setup.

### Manual — `potato-pet/TESTING.md` gets a Phase 2 section

1. Adopt a pet in browser A. Note the code.
2. Open the code in a private window (browser B). Pet, room, stars carry over.
3. In B, feed the pet and decorate. Wait ~35 s (or close the tab).
4. Reload A. B's changes appear; a "Restore previous pet state" button is available
   in the parent/dev panel.
5. Disable network. Play — everything works. Re-enable. Changes sync within a tick.

---

## 11. Parent/dev panel — backup restore

`js/devpanel.js` gains one control, shown only when `potato-pet:backup:<code>`
exists:

- **"Restore previous pet state (from <replacedAt date>)"** → confirm → write the
  backed-up world to `localStorage`, stamp a fresh `savedAt`, mark dirty, reload.

One level of undo. No multi-slot history.

---

## 12. File manifest

**New:**

- `potato-pet/js/remote.js`
- `potato-pet/js/remote.tests.js`
- `worker/src/index.js`
- `worker/wrangler.toml`
- `worker/schema.sql`
- `worker/package.json`
- `worker/test/worker.test.js`
- `worker/SETUP.md`
- `.github/workflows/deploy-worker.yml`

**Changed:**

- `potato-pet/js/save.js` — orchestration, `checkCode`, dirty/pending, backup slot
- `potato-pet/js/config.js` — real `apiBase`
- `potato-pet/js/startscreen.js` — handle `create` returning `{ok:false}`
- `potato-pet/js/devpanel.js` — restore-backup control
- `potato-pet/js/save.tests.js` — sync tests
- `potato-pet/index.html` — add `<script src="js/remote.js">` before `save.js`
- `potato-pet/tests.html` — add `remote.js` + `remote.tests.js` to load lists
- `C:\Users\spark\.claude\jobs\...\run-suite.mjs` equivalent, or a committed
  `potato-pet/run-suite.mjs` — add `remote.js` / `remote.tests.js`
- `potato-pet/TESTING.md` — Phase 2 manual section
- `potato-pet/README.md` — "next phases" / sync notes
- `potato-pet/assets/sprites/LICENSE.txt` — untouched (Phase 3)

**Untouched:** `main.js`, `gamescreen.js`, `state.js`, `world.js`, `rng.js`,
`content.js`, `games.js`, `facts.js`, `interactions.js`, `room.js`, `backup.js`,
`pet.js`, `sprites.js`, `styles.css`, `deploy-pages.yml`.

---

## 13. Out of scope (this phase)

- Field-level / three-way merge — whole-world newest-wins only.
- Multi-slot backup history — one slot.
- Realtime / websockets / shared live rooms — non-goal in the parent spec.
- Server-side `remove` — local-only (parent spec §16).
- Custom API domain (`api.tato.forgesync.co.nz`) — `*.workers.dev` is fine; a
  one-line change later if wanted.
- Cross-device "list my pets" — you need the code.
- Auth beyond the code — the code is the credential, by design.
- Phase 3 (real CC0 sprites) — its own spec.

---

## 14. Rollout / how to verify done

1. Worker deployed; `curl -sI {apiBase}/world/AAA-AAA` → `404` with CORS header.
2. `PUT` a hand-made world via `curl` → `200`; `GET` it back → identical `data`.
3. Game with `apiBase` set: adopt on one browser, resume on another — state carries.
4. Offline: game fully playable; reconnect → syncs within one 30 s tick.
5. Full Phase 1 test suite green; new `remote` + `save` sync tests green; Worker
   tests green.
6. `TESTING.md` Phase 2 walkthrough passes on a tablet.
