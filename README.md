# Chess Platform — Learn-by-Doing Microservices Project

A self-directed learning project exploring AI-assisted software development by building
a small online gaming hub — starting with real-time multiplayer chess. It's a runnable
testbed for microservices communication, pub/sub messaging, an API gateway, Docker,
Terraform (IaC), a GitHub Actions CI/CD pipeline, and (in progress) serverless/edge
patterns via Cloudflare Workers + Durable Objects.

## What this app does
- Create a room, get an invite link/code
- Two players join from two different machines/browsers, play chess in real time
- Play instead against a Stockfish-backed bot (Easy/Medium/Hard difficulty)
- Resign a game in progress
- Live chat in the room
- A move log (SAN notation) you can inspect
- A separate analysis service that recalculates win probability after every move
  and pushes it to both players live

## How to run it locally

The frontend and each service live in their own git repos, pulled in as submodules —
clone with `--recurse-submodules`, or run `git submodule update --init --recursive`
if you already cloned without it:
```bash
git clone --recurse-submodules <this repo's URL> chess-platform
cd chess-platform
```

Then:
```bash
docker compose up --build
```
Then open http://localhost:8080
