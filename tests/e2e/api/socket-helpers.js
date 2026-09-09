import { io } from "socket.io-client";

// socket.io-client auto-connects the moment io() is called. If anything
// async happens between creating the socket and attaching a "connect"
// listener, the connection can complete first and the listener waits
// forever for an event that already fired. Always go through this instead
// of `new Promise((resolve) => socket.on("connect", resolve))` directly.
export function connectSocket(baseUrl, path) {
  const socket = io(baseUrl, { path, transports: ["websocket"] });
  const ready = socket.connected
    ? Promise.resolve()
    : new Promise((resolve) => socket.once("connect", resolve));
  return { socket, ready };
}
