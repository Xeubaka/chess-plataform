import test from "node:test";
import assert from "node:assert/strict";
import { connectSocket } from "./socket-helpers.js";

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";
const CHAT_SOCKET_PATH = "/socket/chat/socket.io/";

test("chat history is capped at the last 50 messages (chat-service HISTORY_LIMIT)", async () => {
  const roomId = `CHAT-CAP-${Date.now()}`;
  const { socket: sender, ready: senderReady } = connectSocket(BASE_URL, CHAT_SOCKET_PATH);
  const { socket: reader, ready: readerReady } = connectSocket(BASE_URL, CHAT_SOCKET_PATH);
  try {
    await senderReady;
    await new Promise((resolve) => {
      sender.once("chat-history", resolve);
      sender.emit("join-room", { roomId, name: "Flooder" });
    });

    const TOTAL = 55;
    const lastMessageEcho = new Promise((resolve) => {
      sender.on("chat-message", (msg) => {
        if (msg.text === `message-${TOTAL - 1}`) resolve();
      });
    });
    for (let i = 0; i < TOTAL; i++) {
      sender.emit("chat-message", { roomId, text: `message-${i}` });
    }
    await lastMessageEcho; // wait for the last emit to round-trip before reading history back

    await readerReady;
    const history = await new Promise((resolve) => {
      reader.once("chat-history", resolve);
      reader.emit("join-room", { roomId, name: "Reader" });
    });

    assert.equal(history.length, 50);
    assert.equal(history[0].text, "message-5"); // oldest surviving message once capped
    assert.equal(history[49].text, "message-54");
  } finally {
    sender.close();
    reader.close();
  }
});
