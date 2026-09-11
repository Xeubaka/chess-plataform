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
