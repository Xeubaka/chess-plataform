# CLAUDE.md

Orientation for Claude Code (or any AI coding assistant) working in this repo. This is a **learn-by-doing microservices chess platform** built for interview prep — the goal is to demonstrate patterns (API gateway, pub/sub, polyglot services, IaC, CI/CD), not to ship a production product. Prefer minimal, well-explained changes over production hardening unless a `SCOPE.md` item explicitly calls for it.

## Repo layout — this is a polyrepo, not a monorepo

Most services are their own git repo, already pushed to GitHub. `gateway/` is the deliberate exception — it's thin nginx routing config with no independent dependency lifecycle of its own (no package manifest, nothing to version separately), so it stays part of this repo instead of being split out:

| Path | Repo | Remote |
|---|---|---|
| `.` (this repo, includes `gateway/`) | main/orchestration repo | git-init'd, **no commits or remote yet** |
| `frontend/` | own repo | `github.com/Xeubaka/frontend` |
| `services/room-service/` | own repo | `github.com/Xeubaka/room-service` |
| `services/game-service/` | own repo | `github.com/Xeubaka/game-service` |
| `services/chat-service/` | own repo | `github.com/Xeubaka/chat-service` |
| `services/analysis-service/` | own repo | `github.com/Xeubaka/analysis-service` |

`services/` itself is just a plain folder in this repo (not its own repo) — the four services underneath are what's actually independently version-controlled. Working inside `services/room-service/` (etc.) means you're inside a *different* git repo than the one at the project root — `git status`/`git add`/`git commit` there act on that service's own history and remote, not this repo's. Same for `frontend/`. `gateway/` is normal tracked content of this repo, same as `docker-compose.yml` or `tests/e2e/`.

**Why this matters for CI:** GitHub Actions workflows only run in the repo they live in. Each service repo has its own `.github/workflows/ci.yml` (build/lint/unit-test checks scoped to that service alone — see each repo). This repo's `.github/workflows/ci.yml` runs `gateway-checks` (nginx config validation + image build, since gateway lives here) and `e2e-tests` (see "Testing & shift-left" below for how it sources the other repos' code) — the two things that are genuinely this repo's own concern.

## Run it

```bash
docker compose up --build
```
Then open http://localhost:8080. This works regardless of the repo split above — `docker compose` just reads files off disk, it doesn't care about git boundaries.

## Status facts (don't assume otherwise)

- **This repo has no commits or remote yet.** `git init` has been run, nothing committed or pushed. Ask before committing or pushing anywhere. **Before the first commit, fix `.gitignore`** — it currently excludes `docs/` and `infra/` entirely, which would silently drop all project documentation and the Terraform code (see `docs/SCOPE.md` Tier 0).
- **End-to-end tests exist and gate this repo's CI; per-service unit tests still don't.** `tests/e2e/` covers the golden path and cross-service edge cases (see "Testing & shift-left" below). `room-service`'s `npm test` still points at `src/*.test.js`, which don't exist. `game-service` and `chat-service` have no `test` script at all. `analysis-service` has no test tooling. Each service's own `ci.yml` only runs `node --check` / `python -m py_compile` (syntax/compile checks) — not real unit tests. This is `docs/SCOPE.md` Tier 2.
- **Every service's `dependency-scan` job is a placeholder** (`echo "Wire in Snyk, Trivy, or 'npm audit --audit-level=high' here"`), not a real scan.
- **`cd.yml`'s `terraform-apply` job does not pass `-var="container_images=..."`** to `terraform apply` — it would run against the terraform variable's defaults unless that's wired up.

## Services

| Service | Stack | Port | Entry point | Role |
|---|---|---|---|---|
| gateway | nginx | **8080** (only app port published to host) | `gateway/nginx.conf` | Reverse proxy / API gateway — routes `/api/rooms*` → room-service, `/socket/game/` → game-service, `/socket/chat/` → chat-service, everything else → frontend |
| frontend | static (`serve` in Docker, no build step) | 8081 (internal only) | `frontend/index.html` (lobby), `frontend/game.html` (room) | Lobby + room UI, loads `js/lobby.js` / `js/game.js`. For local iteration outside Docker: `cd frontend && npm install && npm run dev` — runs `live-server` on the same port 8081 with auto browser-reload on any file change |
| room-service | Node.js (Express) | 3001 (internal only) | `services/room-service/src/index.js` | REST-only. Creates rooms, assigns colors, stores room state in Redis |
| game-service | Node.js (Express + Socket.IO + chess.js) | 3002 (internal only) | `services/game-service/src/index.js` | Authoritative chess rules (server validates every move via `chess.js`). Publishes moves to Redis, relays analysis updates back to clients |
| chat-service | Node.js (Express + Socket.IO) | 3003 (internal only) | `services/chat-service/src/index.js` | Per-room chat, history capped at 50 messages, stored as a Redis list |
| analysis-service | Python (Flask) | 3004 (internal only) | `services/analysis-service/app.py` | Polyglot service. Background thread subscribes to move events, computes a material-based win-probability heuristic, publishes the result |
| redis | redis:7-alpine | 6379 (published to host) | — | Shared key-value state *and* pub/sub message broker (doing double duty on purpose — see `PROJECT_PLAN.md`) |

Env vars: every service reads `REDIS_URL` (default `redis://redis:6379`) and `PORT` (falls back to its hard-coded default above — `docker-compose.yml` never overrides `PORT`).

## Redis contract (the load-bearing cross-service contract)

| Key / Channel | Type | Writer | Reader | Shape |
|---|---|---|---|---|
| `room:{roomId}` | string (JSON) | room-service | room-service | `{id, createdAt, players[], status}` |
| `moves:{roomId}` | pub/sub channel | game-service | analysis-service (`psubscribe moves:*`) | `{roomId, fen, moveCount}` |
| `analysis:{roomId}` | pub/sub channel | analysis-service | game-service (`pSubscribe analysis:*`) | `{roomId, white_win_pct, black_win_pct, material_balance}` |
| `analysis:latest:{roomId}` | string (JSON) | analysis-service | analysis-service (own `GET` route) | same shape as above minus `roomId` |
| `chat:{roomId}` | list, capped to 50 | chat-service | chat-service | JSON `{name, text, ts}` per element |

If you touch either end of one of these contracts (channel name, payload shape), update the other end too — nothing enforces this at compile time (see `.agents/skills` for a `bug-hunter` skill example in `docs/AI_DEV_LOOP.md` that checks exactly this).

## Known gaps (named, not secret)

These are real, already-identified gaps — tracked as backlog items in `docs/SCOPE.md`, not things to silently "fix" in passing:
- `game-service`'s `disconnect` handler is an explicit no-op (comment: "Left as an exercise: mark player disconnected, allow reconnect with same room+color")
- Move promotion is hardcoded to queen (`promotion: "q"`) — no underpromotion UI
- No concurrency guard on simultaneous same-square clicks in the frontend
- `/api/analysis/` nginx route appears unused — the frontend gets analysis via the `analysis-update` socket event relayed through game-service, not this REST route
- Deliberate simplifications called out in `docs/PROJECT_PLAN.md`: no auth, no persistent database (Redis isn't durable storage), win-probability is a material-count heuristic (not a real chess engine), single non-HA Redis instance
- Deliberate gaps called out in `infra/terraform/README.md`: no HTTPS/ACM, no autoscaling policies, no remote state backend (local state only — don't run this with a teammate as-is), no secrets manager, single-AZ Redis

`chess.js` in `game.html` used to be double-loaded (a broken CDN `<script>` global *and* the server npm dependency) and the CDN reference 404'd outright — both fixed; see "Testing & shift-left" below for how that was found.

## Testing & shift-left

`tests/e2e/` has two layers, both run against a real `docker compose up` stack through the gateway — see `tests/e2e/README.md` for how to run them locally:
- `tests/e2e/golden-path/` — Playwright, real browser. The platform's core promise (create/join a room, play a move, chat, see the analysis-service win-probability update land back on screen), driven end to end.
- `tests/e2e/api/` — `node:test` + `fetch` + `socket.io-client`, no browser. Faster cross-service edge cases (unknown room codes, spectator assignment, illegal-move rejection, chat history cap).

Both are wired into this repo's `.github/workflows/ci.yml` as the `e2e-tests` job, alongside `gateway-checks` (see "Repo layout" above for why those two are this repo's own CI, with everything else scoped to each service's own repo). Since a fresh GitHub Actions checkout of this repo alone doesn't include the other services' source, `e2e-tests` clones `frontend`, `room-service`, `game-service`, `chat-service`, and `analysis-service` from their GitHub remotes before running `docker compose up --build` — `gateway/` needs no clone, it's already part of this checkout.

This is the shift-left move: the core user journey gets verified before merge, not discovered broken later. It already paid for itself: building this suite immediately surfaced two real bugs in the running app (a frontend clean-URL redirect that silently dropped the room code on join, and a 404'ing chess.js CDN reference that broke the room page entirely) — both are fixed now, but neither would have been caught by the pre-existing syntax/compile-only CI. When you touch anything in `frontend/`, `gateway/nginx.conf`, or a service's socket/REST contract, run `cd tests/e2e && npm test` (stack must be up) before considering the change done — don't rely on compile checks alone to mean "it works."

## Using graphify

This repo has a `graphify` knowledge-graph skill available (see `graphify-out/GRAPH_REPORT.md` for the last build's god nodes, communities, and suggested questions). Use it before large exploratory changes or when a question spans multiple services:
- `/graphify query "<question>"` to answer structural questions from the existing graph (e.g. "what would break if I changed the `moves:{roomId}` payload shape?") instead of re-reading every service by hand.
- `/graphify update .` after a change that adds/removes files or meaningfully changes cross-service relationships, so the graph stays current for the next session.
- Don't rebuild the full graph (`/graphify .`) for small edits — `--update` is incremental and cheap; a full rebuild is rarely needed here given the repo's size.

## Doc map

Read in this order (per `README.md`):
1. `docs/PROJECT_PLAN.md` — architecture, why each service exists, what interview concept it teaches
2. `docs/CHECKPOINTS.md` — step-by-step build/learn checklist
3. `infra/terraform/README.md` — cloud deployment piece and its limits
4. `docs/AI_DEV_LOOP.md` — Claude Code skills vs. automation loops, with a working example of each
5. `docs/SCOPE.md` — backlog of future functionality, formatted for an automated loop to consume one item at a time
6. `docs/LOOP_GUIDE.md` — how to actually run that loop (local session or cloud-scheduled)
7. `tests/e2e/README.md` — the end-to-end test suite that gates CI
