import test from "node:test";
import assert from "node:assert/strict";
import { connectSocket } from "./socket-helpers.js";

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";
const GAME_SOCKET_PATH = "/socket/game/socket.io/";

test("a bot game replies to the human's move without a second player", async () => {
  // "bot-" prefix matches what the frontend generates for a vs-bot session
  // (services/game-service/src/index.js's isBotRoom skips Postgres for these).
  const roomId = `bot-TEST-${Date.now()}`;
  const { socket, ready } = connectSocket(BASE_URL, GAME_SOCKET_PATH);
  try {
    await ready;
    await new Promise((resolve) => {
      socket.once("game-state", resolve);
      socket.emit("join-room", {
        roomId,
        color: "white",
        name: "Tester",
        vsBot: true,
        difficulty: "easy"
      });
    });

    // Human plays e4; the bot should reply on its own without any second
    // socket ever joining this room.
    const stateAfterBotReply = await new Promise((resolve) => {
      socket.once("game-state", () => {
        // First game-state after our move is the human's own move landing;
        // wait for the next one, which is the bot's reply.
        socket.once("game-state", resolve);
      });
      socket.emit("move", { roomId, from: "e2", to: "e4" });
    });

    assert.equal(stateAfterBotReply.moves.length, 2);
    assert.equal(stateAfterBotReply.moves[0], "e4");
    assert.equal(stateAfterBotReply.turn, "white");
  } finally {
    socket.close();
  }
});
