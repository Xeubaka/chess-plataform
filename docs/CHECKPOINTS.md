# Build & Learn Checkpoints

Work through these in order. Each checkpoint has a "you'll know it's working
when" test and the interview concept it locks in. Tick boxes as you go —
this doubles as your own proof of hands-on experience to talk about.

## Phase 0 — Run it as-is
- [ ] `docker compose up --build` completes without errors
- [ ] Open http://localhost:8080, create a room, get a code
- [ ] Open a second browser (or incognito window) and join with that code
- [ ] Make a move on one window, see it appear on the other
- [ ] Send a chat message, see it on both windows
- [ ] Win-probability bar updates after a move
- **Concept locked in:** you've now seen a working multi-service app talk over REST, WebSocket, and pub/sub simultaneously. If asked "walk me through a distributed system you've worked on," you can now walk through *this one*, live, from memory.

## Phase 1 — Break it on purpose, then explain what happened
- [ ] Stop the `analysis-service` container (`docker compose stop analysis-service`) mid-game. Confirm the game and chat still work — only the probability bar stops updating.
- [ ] Restart it (`docker compose start analysis-service`). Confirm it resumes without you having to restart anything else.
- **Concept locked in:** graceful degradation / fault isolation. This is precisely the answer to "why did you choose async messaging over direct calls between services" — you didn't just design it that way, you watched it survive a failure.

## Phase 2 — Read the code with a specific question in mind
- [ ] In `game-service/src/index.js`, find the line that publishes to Redis after a move. Trace it to where `analysis-service` subscribes in `app.py`.
- [ ] In `nginx.conf`, trace one request path end to end: browser → gateway → which upstream, for `/api/rooms` and for `/socket/game/`.
- **Concept locked in:** you can now describe the API Gateway pattern using your own project as the example, not a textbook diagram.

## Phase 3 — Make a real change (pick at least one)
- [ ] Add a "resign" button that ends the game and announces a winner
- [ ] Persist move history to a file/Postgres instead of only in-memory (`game-service` currently loses all games on restart — say why that's a real limitation)
- [ ] Replace the material-count heuristic in `analysis-service` with a Stockfish-based evaluation
- [ ] Add reconnect support (a disconnected player rejoins the same room+color)
- **Concept locked in:** you've now shipped a change across a microservice boundary, which is the actual day-to-day of the job you're interviewing for.

## Phase 4 — Terraform, without applying anything expensive yet
- [ ] Read `infra/terraform/network.tf` end to end, out loud, explaining each resource
- [ ] Run `terraform init` and `terraform validate` locally (no AWS account needed for these two)
- [ ] Change the Fargate task CPU/memory in `modules/ecs-service/main.tf` and run `terraform plan` — see the diff it produces (still no AWS account required if you `terraform init` with no backend configured, though `plan` against real AWS does need credentials)
- **Concept locked in:** reading someone else's Terraform and predicting what `plan` will show is a very common live-interview exercise.

## Phase 5 — Actually deploy (optional, costs real money — budget an hour, then `terraform destroy`)
- [ ] Create an AWS account / use a sandbox account
- [ ] `terraform init && terraform apply` from `infra/terraform`
- [ ] Manually push one image to one of the ECR repos it created, and watch the ECS service pick it up
- [ ] `terraform destroy` when done
- **Concept locked in:** you can now honestly say "I've deployed a multi-service app to AWS with Terraform," not just "I've read about it."

## Phase 6 — Wire up the GitHub Actions pipeline for real
- [ ] Push this repo to your own GitHub account
- [ ] Watch `ci.yml` run on a pull request
- [ ] Deliberately break a test, push, and watch `bug-triage.yml` file a GitHub issue automatically
- [ ] (Optional, needs AWS + OIDC role set up) Wire real secrets and watch `cd.yml` build, push, and `terraform apply`
- **Concept locked in:** end-to-end CI/CD, plus a real answer to "have you set up automated issue creation on pipeline failure?"

## Phase 7 — Mock interview to yourself
- [ ] Explain the whole architecture out loud in under 3 minutes, no notes
- [ ] Answer: "What would you change before this goes to real production?"
- [ ] Answer: "Why is chat a separate service from the game logic?"
- [ ] Answer: "What happens if two people click the same square at the same time?" (Hint: look at how `game.js` and `game-service` handle concurrent moves — there's a real gap here worth finding and either fixing or being able to name.)
