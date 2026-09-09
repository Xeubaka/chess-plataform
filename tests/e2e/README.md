# End-to-end tests

Two layers, both run against a real `docker compose up` stack through the gateway (`http://localhost:8080`) — never against a service directly:

- **`golden-path/`** — Playwright, real browser. Two simulated players (two browser contexts) create/join a room, play a move, chat, and see the analysis-service win-probability update land back on screen. This is the platform's core promise from `README.md`, exercised end to end.
- **`api/`** — `node:test` + `fetch` + `socket.io-client`, no browser. Faster, cross-service edge cases: unknown room codes, spectator assignment past two players, illegal-move rejection, legal-move broadcast, chat history capped at 50 messages.

## Run locally

```bash
# from the repo root
docker compose up -d --build

cd tests/e2e
npm install
npx playwright install --with-deps chromium   # first run only
npm test                                        # api tests, then golden-path
```

Or individually: `npm run test:api` / `npm run test:golden-path`.

Point at a different stack (e.g. one already running elsewhere) with `BASE_URL=http://host:port npm test`.

## In CI

This project is a polyrepo (see `CLAUDE.md`'s "Repo layout") — most services have their own repo with its own scoped CI. `gateway/` stays part of the main repo, so its checks (`gateway-checks`) live alongside this suite in `.github/workflows/ci.yml`. `e2e-tests` clones `frontend`, `room-service`, `game-service`, `chat-service`, and `analysis-service` from their GitHub remotes before running `docker compose up --build` — `gateway/` needs no clone, it's already part of this checkout. Runs on every push/PR to `main`. See `CLAUDE.md`'s "Testing & shift-left" section for why this gates merges instead of running after deploy.
