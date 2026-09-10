## Read these in order
1. `docs/PROJECT_PLAN.md` — architecture, why each service exists, what interview concept it teaches
2. `docs/CHECKPOINTS.md` — step-by-step build/learn checklist, tick these off as you go
3. `infra/terraform/README.md` — how the cloud deployment piece works (and its limits)
4. `docs/AI_DEV_LOOP.md` — using Claude/Claude Code "skills" and automation loops to catch
   bugs and generate tasks as you build this
5. `docs/SCOPE.md` — backlog of future functionality, one checkbox at a time
6. `docs/LOOP_GUIDE.md` — how to point an agentic loop at that backlog and let it work
7. `tests/e2e/README.md` — the end-to-end test suite that gates CI on every push/PR
8. `docs/CLOUDFLARE.md` — if/when `game-service` runs on Cloudflare Workers + Durable Objects instead of docker-compose