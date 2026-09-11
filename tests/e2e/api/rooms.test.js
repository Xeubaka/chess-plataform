import test from "node:test";
import assert from "node:assert/strict";

// Hits the gateway exactly like a client would — never a service directly.
const BASE_URL = process.env.BASE_URL || "http://localhost:8080";

async function createRoom() {
  const res = await fetch(`${BASE_URL}/api/rooms`, { method: "POST" });
  assert.equal(res.status, 201);
  return res.json();
}

async function joinRoom(roomId, playerName) {
  const res = await fetch(`${BASE_URL}/api/rooms/${roomId}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerName })
  });
  return res;
}

test("GET /api/rooms/:id 404s for an unknown room code", async () => {
  const res = await fetch(`${BASE_URL}/api/rooms/DOESNOTEXIST`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error, "room not found");
});

test("POST /api/rooms/:id/join 404s for an unknown room code", async () => {
  const res = await joinRoom("DOESNOTEXIST", "Nobody");
  assert.equal(res.status, 404);
});

test("first two joiners get complementary white/black colors (per the room's own coin flip), a third becomes a spectator", async () => {
  const room = await createRoom();

  const p1 = await (await joinRoom(room.id, "Alice")).json();
  const p2 = await (await joinRoom(room.id, "Bob")).json();
  const p3 = await (await joinRoom(room.id, "Carol")).json();

  // Which of the first two joiners gets white is now a per-room coin flip
  // (room-service#1) rather than always "whoever joined first" — assert the
  // pair is complementary, not a fixed assignment.
  assert.deepEqual([p1.you.color, p2.you.color].sort(), ["black", "white"]);
  assert.equal(p3.you.color, "spectator");

  // Room flips to "ready" the moment both white and black seats are filled,
  // regardless of how many spectators join afterward.
  assert.equal(p2.room.status, "ready");
  assert.equal(p3.room.status, "ready");
});
