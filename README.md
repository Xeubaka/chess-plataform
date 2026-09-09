# Chess Platform — Learn-by-Doing Microservices Project

A local, runnable online chess platform built specifically to walk through the concepts
in your Intelex interview prep: microservices communication, pub/sub messaging, an
API gateway, Docker, Terraform (IaC), and a GitHub Actions CI/CD pipeline.

## What this app does
- Create a room, get an invite link/code
- Two players join from two different machines/browsers, play chess in real time
- Live chat in the room
- A move log (SAN notation) you can inspect
- A separate analysis service that recalculates win probability after every move
  and pushes it to both players live

## How to run it locally
```bash
docker compose up --build
```
Then open http://localhost:8080
