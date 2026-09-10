# Cloudflare Workers + Durable Objects — game-service

Migrates `services/game-service` from an Express/Socket.IO container to a
Cloudflare Worker with a `GameRoom` Durable Object doing the real work. Why:
one Durable Object instance per `roomId` *is* an isolated, serverless
per-game process — no server to patch, no Kubernetes cluster to run one
container per match on. Everything else in the stack (`room-service`,
`chat-service`, `analysis-service`, `frontend`, `redis`) stays exactly where
it is; only `game-service`'s WebSocket connection and the two Redis edges it
used to touch (`moves:*` publish, `analysis:*` subscribe) change. See the
game-service migration plan for the full design — this doc is just "how do I
configure it."

## Before you start: this costs $5/mo — or use the free-tier alternative

Durable Objects require Cloudflare's **Workers Paid** plan — there is no
free-tier Durable Object. That's a real, ongoing cost, stated up front as a
decision, not a footnote. If that's not acceptable right now, the
docker-compose deployment (see `FREE_TIER_HOSTING.md`) stays valid and free
either way — or read on for a genuinely free way to still run this Worker.

### Free-tier alternative: Upstash Redis + polling instead of a Durable Object

`worker.js` and `store.js` (as committed) implement this alternative, not a
Durable Object. The reason a DO exists at all is that a plain Worker has no
mechanism for one player's WebSocket handler to reach across to the other
player's — a DO's `state.acceptWebSocket()`/`getWebSockets()` API is what
holds every socket in a room in one place so it can broadcast between them.
That specific API is what's gated behind the Paid plan.

The free-tier design replaces that with:
- **Upstash Redis** (free tier, plain HTTP REST API — no persistent
  connection, so it works from a stateless free Worker) holding room state
  instead of DO storage.
- **Polling** instead of in-memory broadcast: each open WebSocket connection
  checks Upstash every ~400ms and pushes to its own client if the state
  changed. What was one `broadcast()` call in the DO version becomes "every
  connection independently notices the shared state changed."

**Trade-off, stated once:** moves and analysis updates reach the *other*
player with up to ~400ms of latency instead of instantly. For turn-based
chess this is imperceptible. It would matter for a faster-paced game — this
approach doesn't generalize to that without shortening the poll interval and
accepting more Upstash request volume.

**Setup**, in place of the Durable Object binding below:
1. Create a free Upstash Redis database at upstash.com — no card required.
2. `wrangler.toml`'s `[vars]` already has a placeholder
   `UPSTASH_REDIS_REST_URL`; point it at the database's REST URL.
3. `wrangler secret put UPSTASH_REDIS_REST_TOKEN` with the database's REST
   token (never commit it).
4. No Durable Object migration block needed — skip the "Durable Object
   binding + migrations" section below entirely; `wrangler.toml` as
   committed has no `[[durable_objects.bindings]]`.

Everything else in this doc (local dev, deploying, secrets for
`ANALYSIS_SHARED_SECRET`/`BOT_SHARED_SECRET`, custom domain, rollback)
applies unchanged — the only difference is what backs room state and how
players find out about each other's moves.

### If you want the original Durable Object version instead

The DO implementation (`gameRoom.js`, plus a `[[durable_objects.bindings]]`
block in `wrangler.toml`) is in this repo's git history, not kept alongside
the free-tier version — `git log -- services/game-service/src/gameRoom.js`
to recover it if the $5/mo becomes acceptable later and instant broadcast is
worth reintroducing. The rest of this doc below (bindings, migrations) is
written for that version.

## Prerequisites

- A Cloudflare account with the Workers Paid plan enabled.
- `wrangler`, Cloudflare's CLI: `npm install -g wrangler` (or just `npx
  wrangler ...` per-command, no global install needed).
- `wrangler login` once, to authorize the CLI against your account.

## Project layout

Everything lives inside `services/game-service` (its own repo) —
`wrangler.toml`, `src/worker.js` (the Worker's `fetch()` router), and
`src/gameRoom.js` (the `GameRoom` Durable Object class). `src/gameLogic.js`,
`src/bot.js`, and `src/gameLogic.test.js` are unchanged; the old
`src/index.js`/`src/db.js` stay in place until the cutover step below is
actually done (don't delete them just because this Worker exists — the old
Express service is still what's serving real traffic until nginx is
repointed).

## Durable Object binding + migrations

```toml
name = "game-service"
main = "src/worker.js"
compatibility_date = "2026-09-10"

[[durable_objects.bindings]]
name = "GAME_ROOM"
class_name = "GameRoom"

[[migrations]]
tag = "v1"
new_classes = ["GameRoom"]
```

The `migrations` block exists because Durable Object classes are versioned —
`new_classes` only runs once, the first time this Worker is deployed. If
`GameRoom` is ever renamed or its storage shape changes incompatibly later,
that's a *new* migration entry (`tag = "v2"`, etc.) appended below this one,
not an edit to `v1`.

## Local dev with `wrangler dev`

```bash
cd services/game-service
npm run worker:dev   # wrangler dev, defaults to http://localhost:8787
```

The rest of the stack still comes up the normal way:

```bash
docker compose up --build
```

Two places need to point at wherever the Worker actually is, and that's the
one thing that differs between local dev and prod:

**Local** (`wrangler dev` on `localhost:8787`) — `gateway/nginx.conf`:
```nginx
location /socket/game/ {
  proxy_pass http://host.docker.internal:8787/;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
}
```
(`host.docker.internal` — nginx runs inside a container, `wrangler dev` runs
on the host, so `localhost` inside the container won't reach it.) And
analysis-service's env: `WORKER_CALLBACK_URL=http://host.docker.internal:8787`.

**Deployed** — same block, `proxy_pass` targets the Worker's real domain
(with `proxy_ssl_server_name on;` added, needed for SNI against an HTTPS
upstream), and `WORKER_CALLBACK_URL` is that same domain.

## Deploying: git-connected Workers Builds vs. `wrangler deploy`

If a Worker is already connected to this repo's git remote (Workers →
your worker → Settings → Build), every push to the connected branch
triggers a build + deploy automatically — that's the path for normal
iteration, nothing to run locally.

`wrangler deploy` (or `npm run worker:deploy`) is for a manual, one-off
deploy instead — testing a branch before merging it, or the very first
deploy before git integration is wired up.

## Secrets and environment variables

Non-sensitive URLs go in `wrangler.toml`'s `[vars]` (already committed,
pointing at placeholders):

```toml
[vars]
ANALYSIS_ORIGIN = "https://changeme.example.com"
BOT_ORIGIN = "https://changeme.example.com"
```

Shared secrets never go in `wrangler.toml` — set them with:

```bash
wrangler secret put ANALYSIS_SHARED_SECRET
wrangler secret put BOT_SHARED_SECRET
```

`analysis-service` and the `game-bot` container need the *same* secret
values, via their own env vars (`ANALYSIS_SHARED_SECRET`,
`BOT_SHARED_SECRET` in `docker-compose.yml` / wherever they're actually
hosted) — these are shared-secret pairs, not one-sided config.

## Custom domain

Workers → your worker → Triggers → Custom Domains, and point something like
`game.<yourdomain>` at it. Use that stable domain everywhere above (nginx's
`proxy_pass`, `ANALYSIS_ORIGIN`, `WORKER_CALLBACK_URL`) instead of the
default `*.workers.dev` URL, so nothing breaks if the Worker's account-level
subdomain ever changes.

## Rollback

This migration is staged on purpose: build and deploy the Worker first,
exercise it directly (a manual WebSocket client, `curl` against
`/rooms/:id/moves`), and only flip `gateway/nginx.conf`'s `/socket/game/`
target once that's actually verified. Until that flip happens, the old
Docker `game-service` container is still what's serving real games — rolling
back is just not making the nginx change (or reverting it), no data
migration to undo.
