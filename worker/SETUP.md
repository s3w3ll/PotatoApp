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
