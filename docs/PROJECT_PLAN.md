# Architecture Plan

## The services, and what each one teaches you

```
                        ┌─────────────────────┐
                        │      gateway         │   ← API Gateway pattern
                        │   (nginx reverse     │     (single entry point,
                        │       proxy)         │      routes by path)
                        └──────────┬───────────┘
                                   │
        ┌──────────────┬──────────┼──────────────┬───────────────┐
        │              │          │               │               │
        ▼              ▼          ▼               ▼               ▼
  ┌───────────┐  ┌───────────┐ ┌───────────┐ ┌───────────┐  ┌──────────┐
  │ frontend  │  │   room-   │ │   game-   │ │   chat-   │  │ analysis-│
  │ (static)  │  │  service  │ │  service  │ │  service  │  │ service  │
  │           │  │  (REST)   │ │(WebSocket)│ │(WebSocket)│  │ (Python) │
  └───────────┘  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘  └────┬─────┘
                        │             │             │              │
                        └─────────────┴──────┬──────┴──────────────┘
                                              ▼
                                        ┌───────────┐
                                        │   Redis    │  ← shared state +
                                        │(state +    │    message broker
                                        │ pub/sub)   │    (async decoupling)
                                        └───────────┘
```

### `room-service` (Node.js REST API)
Creates rooms, generates invite codes, assigns players to a room, stores room
state in Redis (a hash). **Teaches:** plain REST design, why you'd keep this
as its own service (room lifecycle has nothing to do with real-time gameplay
or chat — different concern, different scaling needs).

### `game-service` (Node.js + Socket.IO)
The authoritative source of chess rules. Uses `chess.js` server-side (never
trust the client to validate a move). Broadcasts board state to both players
over a WebSocket, keeps the move log, and **publishes every move to a Redis
pub/sub channel** rather than calling `analysis-service` directly.
**Teaches:** why real-time needs WebSockets instead of REST polling, and the
core lesson from your TOTVS interview story — **async messaging vs. direct
calls**. If `analysis-service` is slow or down, the game doesn't hang.

### `chat-service` (Node.js + Socket.IO)
Deliberately a *separate* service from `game-service`, even though both use
WebSockets and both care about "rooms." **Teaches:** service boundaries —
chat has a completely different failure mode and scaling profile than game
logic (you can lose chat history and the game is fine; you can never lose a
move). This is the kind of "why split this out" question interviewers ask.

### `analysis-service` (Python)
Subscribes to the Redis moves channel, recalculates win probability from the
board position after every move, and publishes the result back to another
Redis channel. `game-service` relays that result to both players.
**Teaches:** the **pub/sub / event-driven pattern**, a **polyglot
microservice** (different language, proves services don't need to share a
stack), and a **circuit-breaker-shaped problem** — what should happen to the
game if this service crashes? (Answer for you to implement: nothing bad —
the game keeps running, it just stops getting probability updates. That
graceful-degradation instinct is exactly what "distributed systems"
interview questions are probing for.)

### `gateway` (nginx)
Routes `/api/rooms` → room-service, `/socket/game` → game-service,
`/socket/chat` → chat-service, everything else → frontend.
**Teaches:** the API Gateway pattern from the JD — clients only ever talk to
one host/port; services can move, scale, or be replaced behind it.

### `Redis`
Doing double duty on purpose: shared key-value state (rooms, move logs) AND
message broker (pub/sub channels). **Teaches:** in a real system you'd
likely split these (e.g., Redis for cache/pub-sub, Postgres for durable
state, SQS/Kafka for messaging) — this project intentionally starts simple
so you can *later* practice splitting it, which is itself a great "how would
you evolve this system" interview answer.

## Communication patterns used (and why)

| Interaction | Pattern | Why |
|---|---|---|
| Frontend → room-service | REST (HTTP) | Request/response, not time-sensitive |
| Frontend ↔ game-service | WebSocket | Needs real-time, bidirectional push |
| Frontend ↔ chat-service | WebSocket | Same reason, separate concern |
| game-service → analysis-service | Redis pub/sub (async) | Decoupled — game must never block on analysis |
| analysis-service → game-service | Redis pub/sub (async) | Same — analysis pushes when ready, doesn't get polled |

## Deliberate simplifications (call these out in an interview — it shows judgment)
- No auth/accounts (would add an `auth-service` or Okta/Auth0 integration — you already know this from your SSO work)
- No persistent database (Redis is not durable storage — production would add Postgres for room/game history)
- Win-probability formula is a simple material-based heuristic, not a real chess engine (documented in `analysis-service`, with a note on how you'd swap in Stockfish)
- Single Redis instance, no HA — fine for local learning, not for production

Being able to say *"here's what I simplified and here's exactly what I'd add for production"* is a stronger signal in an interview than pretending the toy project is production-ready.
