import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { roomManager } from "../services/RoomManager";

export const ALLOWED_EMOJIS = ["❤️", "😂", "😮", "👏", "🔥", "😢"] as const;
const allowedEmojis: ReadonlySet<string> = new Set(ALLOWED_EMOJIS);

export class ReactionHandler {
  private lastReactionAt: number | null = null;

  constructor(
    private io: Server,
    private socket: Socket,
  ) {}

  register(): void {
    this.socket.on("send_reaction", (payload: unknown) => {
      if (typeof payload !== "object" && payload !== null) {
        return;
      }
      this.handleReaction(payload);
    });
  }

  private handleReaction(payload: unknown): void {
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("emoji" in payload) ||
      typeof payload.emoji !== "string" ||
      !allowedEmojis.has(payload.emoji)
    ) {
      return;
    }

    const roomCode = roomManager.getRoomCodeBySocket(this.socket.id);
    const room = roomCode ? roomManager.getRoom(roomCode) : undefined;
    const participant = room?.getParticipant(this.socket.id);
    if (!room || !participant) {
      return;
    }

    const now = Date.now();
    if (this.lastReactionAt !== null && now - this.lastReactionAt < 150) {
      return;
    }
    this.lastReactionAt = now;

    this.io.to(room.code).emit("reaction", {
      id: randomUUID(),
      userId: this.socket.id,
      username: participant.username,
      emoji: payload.emoji,
    });
  }
}
