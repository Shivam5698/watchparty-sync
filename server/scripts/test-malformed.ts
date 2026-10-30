import { io } from "socket.io-client";

const socket = io("http://localhost:4000", {
  autoConnect: true,
  transports: ["websocket"],
});

const eventNames = [
  "create_room",
  "join_room",
  "leave_room",
  "play",
  "pause",
  "seek",
  "change_video",
  "assign_role",
  "remove_participant",
  "transfer_host",
  "request_action",
  "resolve_request",
  "chat_message",
  "send_reaction",
  "request_sync",
];

const badPayloads = [
  [],
  [null],
  ["x"],
  [{}],
  [123, "not-a-function"],
];

const sendMalformed = () => {
  for (const eventName of eventNames) {
    for (const payload of badPayloads) {
      try {
        // @ts-expect-error Intentionally malformed and invalid socket payloads for robustness testing.
        socket.emit(eventName, ...payload);
      } catch {
        // Ignore emission errors for malformed payloads.
      }
    }
  }
};

socket.on("connect", () => {
  sendMalformed();
  setTimeout(async () => {
    try {
      const response = await fetch("http://localhost:4000/health");
      console.log(`SERVER ALIVE ✅ ${response.status}`);
    } catch {
      console.log("SERVER DOWN ❌");
    } finally {
      socket.close();
      process.exit(0);
    }
  }, 1000);
});

socket.on("connect_error", () => {
  console.log("SERVER DOWN ❌");
  socket.close();
  process.exit(0);
});
