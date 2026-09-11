import test from "node:test";
import assert from "node:assert/strict";
import { connectSocket } from "./socket-helpers.js";

// Same gateway-only access pattern as the other api tests.
const BASE_URL = process.env.BASE_URL || "http://localhost:8080";
const GAME_SOCKET_PATH = "/socket/game/socket.io/";

test("GET /api/admin/games (chess-plataform#3) lists a resigned game with its outcome", async () => {
  const res = await fetch(`${BASE_URL}/api/rooms`, { method: "POST" });
  const room = await res.json();
  const roomId = room.id;

  const { socket: white, ready: whiteReady } = connectSocket(BASE_URL, GAME_SOCKET_PATH);
  const { socket: black, ready: blackReady } = connectSocket(BASE_URL, GAME_SOCKET_PATH);
  try {
    await Promise.all([whiteReady, blackReady]);
    await new Promise((resolve) => {
      white.once("game-state", resolve);
      white.emit("join-room", { roomId, color: "white", name: "Resigner" });
    });
    await new Promise((resolve) => {
      black.once("game-state", resolve);
      black.emit("join-room", { roomId, color: "black", name: "Opponent" });
    });

    await new Promise((resolve) => {
      black.once("game-state", resolve);
      white.emit("resign", { roomId });
    });

    // saveGame's Postgres write-through is fire-and-forget — give it a beat.
    await new Promise((r) => setTimeout(r, 300));

    const games = await (await fetch(`${BASE_URL}/api/admin/games`)).json();
    const entry = games.find((g) => g.roomId === roomId);
    assert.ok(entry, "resigned room should appear in the admin game list");
    assert.equal(entry.status, "ended");
    assert.equal(entry.outcome, "white resigned — black won");
    assert.deepEqual(Object.keys(entry.players).sort(), ["black", "white"]);
  } finally {
    white.close();
    black.close();
  }
});
