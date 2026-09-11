import test from "node:test";
import assert from "node:assert/strict";
import { connectSocket } from "./socket-helpers.js";

// Same nginx path the frontend uses (gateway/nginx.conf strips
// "/socket/game/" before forwarding, so the client path must include it).
const BASE_URL = process.env.BASE_URL || "http://localhost:8080";
const GAME_SOCKET_PATH = "/socket/game/socket.io/";

test("joining a room returns the initial game-state", async () => {
  const roomId = `TEST-INIT-${Date.now()}`;
  const { socket, ready } = connectSocket(BASE_URL, GAME_SOCKET_PATH);
  try {
    await ready;

    const state = await new Promise((resolve) => {
      socket.once("game-state", resolve);
      socket.emit("join-room", { roomId, color: "white", name: "Tester" });
    });

    assert.equal(state.turn, "white");
    assert.deepEqual(state.moves, []);
    assert.equal(state.isCheck, false);
  } finally {
    socket.close();
  }
});

test("an illegal move is rejected and the sender's board is untouched", async () => {
  const roomId = `TEST-ILLEGAL-${Date.now()}`;
  const { socket, ready } = connectSocket(BASE_URL, GAME_SOCKET_PATH);
  try {
    await ready;
    await new Promise((resolve) => {
      socket.once("game-state", resolve);
      socket.emit("join-room", { roomId, color: "white", name: "Tester" });
    });

    // e2 -> e5 is a three-square pawn push from the opening position: illegal.
    const rejection = await new Promise((resolve) => {
      socket.once("move-rejected", resolve);
      socket.emit("move", { roomId, from: "e2", to: "e5" });
    });

    // The exact wording is chess.js's own error message (implementation
    // detail, don't pin to it) — what matters for this contract is that a
    // reason is present and the offending squares are echoed back.
    assert.ok(rejection.reason && rejection.reason.length > 0);
    assert.equal(rejection.from, "e2");
    assert.equal(rejection.to, "e5");
  } finally {
    socket.close();
  }
});

test("a legal move is broadcast to every player in the room", async () => {
  const roomId = `TEST-LEGAL-${Date.now()}`;
  const { socket: mover, ready: moverReady } = connectSocket(BASE_URL, GAME_SOCKET_PATH);
  const { socket: watcher, ready: watcherReady } = connectSocket(BASE_URL, GAME_SOCKET_PATH);
  try {
    await Promise.all([moverReady, watcherReady]);
    await new Promise((resolve) => {
      mover.once("game-state", resolve);
      mover.emit("join-room", { roomId, color: "white", name: "Mover" });
    });
    await new Promise((resolve) => {
      watcher.once("game-state", resolve);
      watcher.emit("join-room", { roomId, color: "black", name: "Watcher" });
    });

    const watcherStateUpdate = new Promise((resolve) => watcher.once("game-state", resolve));
    mover.emit("move", { roomId, from: "e2", to: "e4" });
    const state = await watcherStateUpdate;

    assert.deepEqual(state.moves, ["e4"]);
    assert.equal(state.turn, "black");
  } finally {
    mover.close();
    watcher.close();
  }
});

test("a room-configurable time control (room-service#2) reaches game-service's clock once both seats are filled", async () => {
  const roomId = `TEST-TIMECONTROL-${Date.now()}`;
  const { socket: white, ready: whiteReady } = connectSocket(BASE_URL, GAME_SOCKET_PATH);
  const { socket: black, ready: blackReady } = connectSocket(BASE_URL, GAME_SOCKET_PATH);
  try {
    await Promise.all([whiteReady, blackReady]);
    await new Promise((resolve) => {
      white.once("game-state", resolve);
      white.emit("join-room", { roomId, color: "white", name: "Host", timeControlMs: 10 * 60 * 1000 });
    });

    // The clock only starts (and clocks stop being null) once both seats are
    // filled — this join's game-state is the one carrying it.
    const state = await new Promise((resolve) => {
      black.once("game-state", resolve);
      black.emit("join-room", { roomId, color: "black", name: "Opponent" });
    });

    assert.deepEqual(state.clocks, { white: 10 * 60 * 1000, black: 10 * 60 * 1000 });
  } finally {
    white.close();
    black.close();
  }
});

async function createRoomViaRoomService() {
  const res = await fetch(`${BASE_URL}/api/rooms`, { method: "POST" });
  const room = await res.json();
  return room.id;
}

test("rematch: proposer waits, opponent accepts, and the game resets (game-service#3/room-service#3/frontend#2)", async () => {
  const roomId = await createRoomViaRoomService();
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

    const blackSeesResignation = new Promise((resolve) => black.once("game-state", resolve));
    white.emit("resign", { roomId });
    await blackSeesResignation;

    // The loser proposes a rematch; the winner sees the offer and accepts.
    const blackSeesOffer = new Promise((resolve) => black.once("rematch-offered", resolve));
    white.emit("rematch-request", { roomId });
    const offer = await blackSeesOffer;
    assert.equal(offer.requestedBy, "white");
    assert.ok(offer.expiresAt > Date.now());

    const whiteSeesReset = new Promise((resolve) => white.once("game-state", resolve));
    black.emit("rematch-response", { roomId, accept: true });
    const resetState = await whiteSeesReset;

    assert.equal(resetState.fen, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    assert.deepEqual(resetState.moves, []);
    assert.equal(resetState.result, null);
    assert.equal(resetState.rematch, null);

    // Room-service never learns about this room being finalized — the game
    // just continues in the same room, so joining it (as a fresh spectator)
    // must still work.
    const stillJoinable = await fetch(`${BASE_URL}/api/rooms/${roomId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerName: "LateSpectator" })
    });
    assert.equal(stillJoinable.status, 200);
  } finally {
    white.close();
    black.close();
  }
});

test("rematch: opponent declining finalizes the room in room-service (410 on further joins)", async () => {
  const roomId = await createRoomViaRoomService();
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

    const whiteSeesClosed = new Promise((resolve) => white.once("rematch-closed", resolve));
    black.emit("rematch-request", { roomId });
    await new Promise((resolve) => white.once("rematch-offered", resolve));
    white.emit("rematch-response", { roomId, accept: false });
    const closed = await whiteSeesClosed;
    assert.equal(closed.reason, "declined");

    // game-service's fire-and-forget close call needs a beat to land.
    await new Promise((r) => setTimeout(r, 300));
    const rejoin = await fetch(`${BASE_URL}/api/rooms/${roomId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerName: "TooLate" })
    });
    assert.equal(rejoin.status, 410);
  } finally {
    white.close();
    black.close();
  }
});

test("resigning ends the game and declares the opponent the winner", async () => {
  const roomId = `TEST-RESIGN-${Date.now()}`;
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

    const blackStateUpdate = new Promise((resolve) => black.once("game-state", resolve));
    white.emit("resign", { roomId });
    const state = await blackStateUpdate;

    assert.deepEqual(state.result, { reason: "resignation", winner: "black", resignedBy: "white" });

    // The game is over: further moves from either side are rejected, not applied.
    const rejection = await new Promise((resolve) => {
      black.once("move-rejected", resolve);
      black.emit("move", { roomId, from: "e7", to: "e5" });
    });
    assert.ok(rejection.reason && rejection.reason.length > 0);
  } finally {
    white.close();
    black.close();
  }
});
