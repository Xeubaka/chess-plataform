# Free-tier hosting walkthrough

Gets this platform onto a real public URL for **$0**, using Oracle Cloud's
"Always Free" tier — free forever, not a trial. This is a second, independent
deployment path from `infra/terraform/`: that Terraform stack (ECS Fargate +
ALB) provisions real, billed AWS resources and stays as-is as the "how I'd
run this in production, and here's what it costs" interview artifact. This
doc is the "how do I actually get a working demo online without paying"
path — same `docker-compose.yml`, no code changes, a different host.

## Why Oracle Cloud over the alternatives

- **Fly.io**: no free tier any more (killed in 2024) — new accounts get a
  2-hour/7-day trial, then billing.
- **Render**: free web services exist but spin down after 15 min idle and
  take 30-50s to wake back up. That kills persistent WebSocket connections —
  `game-service` and `chat-service` both depend on the socket staying open,
  so a mid-game spin-down would drop players. Also one free service per
  project, not a good fit for 6 services + Redis + Postgres.
- **AWS EC2 free tier**: real, but only for 12 months from account creation,
  then billed, and the free instance (t2/t3.micro) has just 1GB RAM — tight
  for 8 containers with no per-service memory caps configured.
- **Oracle Cloud "Always Free"**: genuinely permanent, and the Ampere A1 ARM
  shape gives 2 OCPUs / 12GB RAM (as of 2026) as a single VM — comfortable
  headroom for this stack's 8 lightweight Alpine/slim containers (gateway,
  frontend, room-service, game-service, chat-service, analysis-service,
  redis, postgres), each idling in the tens-of-MB range.

**Known caveats, stated up front, not discovered later:**
- Ampere A1 capacity isn't guaranteed in every home region — if your region
  shows "out of capacity" when provisioning, try a different one.
- Oracle can reclaim an Always Free instance it considers idle. A cheap
  mitigation is a low-frequency external uptime ping (e.g. a free
  UptimeRobot check against `/api/rooms`) — or just accept the risk for a
  portfolio project and re-provision if it happens.

## Steps

1. **Create an Oracle Cloud account** at oracle.com/cloud/free — needs a
   card for identity verification but the Always Free resources are never
   billed.

2. **Provision an Ampere A1 VM**: Compute → Instances → Create Instance.
   - Image: Ubuntu (latest LTS, ARM/aarch64 build).
   - Shape: `VM.Standard.A1.Flex`, 2 OCPUs / 12GB memory (the Always Free
     ceiling as of 2026 — check your tenancy's current limit under
     Governance → Limits, Quotas and Usage if this doesn't match).
   - Add your SSH public key during creation (or let Oracle generate a pair
     for you to download) — this is how you'll log in.

3. **Open the gateway port.** Only port 8080 needs to be public — matches
   `docker-compose.yml`'s `gateway` port mapping.
   - Oracle-side: the VM's subnet has a default Security List/NSG — add an
     ingress rule for `0.0.0.0/0`, TCP, destination port `8080`.
   - VM-side (Ubuntu's own firewall, separate from Oracle's): once logged
     in, `sudo iptables -I INPUT -p tcp --dport 8080 -j ACCEPT` (or
     `sudo ufw allow 8080/tcp` if ufw is active). Both layers block traffic
     independently — missing either one means "connection refused" even
     though the other looks fine.

4. **Install Docker + Compose plugin** (SSH into the VM first):
   ```bash
   sudo apt update
   sudo apt install -y docker.io docker-compose-v2
   sudo usermod -aG docker $USER
   # log out and back in for the group change to take effect
   ```

5. **Clone the repo and its submodules**:
   ```bash
   git clone --recurse-submodules <this repo's URL> chess-platform
   cd chess-platform
   ```
   (If the main repo isn't pushed to a remote yet — see `docs/SCOPE.md`
   Tier 0 — `scp` the working tree over instead, or push it first.)

6. **Bring the stack up**:
   ```bash
   docker compose up --build -d
   docker compose ps   # confirm all 8 containers are healthy
   ```

7. **Verify**: open `http://<VM's public IP>:8080` in a browser. You should
   see the lobby (create/join room, play vs. bot).

## What this does *not* replace

`infra/terraform/` and `cd.yml` still exist and are still the "production
deployment" story to walk through in an interview — ECS Fargate, an ALB,
ECR, IAM roles, a `workflow_dispatch`-gated CD pipeline. This doc is a
parallel, zero-cost way to have an actual working link to share, without
needing AWS billing enabled or `secrets.AWS_DEPLOY_ROLE_ARN` configured.
