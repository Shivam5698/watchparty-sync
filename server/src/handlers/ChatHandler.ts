import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { roomManager } from "../services/RoomManager";
import type { Ack, ChatMessage } from "../types/events";

export class ChatHandler {
  private lastMessageAt: number | null = null;

  constructor(
    private io: Server,
    private socket: Socket,
  ) {}

  register(): void {
    this.socket.on("chat_message", (payload: unknown, ack: Ack) =>
      this.handleChatMessage(payload, ack),
    );
  }

  private handleChatMessage(payload: unknown, ack: Ack): void {
    const roomCode = roomManager.getRoomCodeBySocket(this.socket.id);
    const room = roomCode ? roomManager.getRoom(roomCode) : undefined;
    const actor = room?.getParticipant(this.socket.id);
    if (!room || !actor) {
      ack({ ok: false, error: "Not in a room" });
      return;
    }

    const text =
      typeof payload === "object" &&
      payload !== null &&
      "text" in payload &&
      typeof payload.text === "string"
        ? payload.text.trim()
        : "";
    if (text.length < 1 || text.length > 300) {
      ack({ ok: false, error: "Message must be 1-300 characters" });
      return;
    }

    const now = Date.now();
    if (this.lastMessageAt !== null && now - this.lastMessageAt < 500) {
      ack({ ok: false, error: "You're sending messages too fast" });
      return;
    }
    this.lastMessageAt = now;

    const message: ChatMessage = {
      id: randomUUID(),
      userId: this.socket.id,
      username: actor.username,
      role: actor.role,
      text,
      timestamp: now,
    };
    room.addChatMessage(message);
    this.io.to(room.code).emit("chat_message", message);
    ack({ ok: true });
  }
}
