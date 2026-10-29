import type { Server, Socket } from "socket.io";
import { can } from "../permissions/rolePermissions";
import {
  applyAction,
  type PlaybackAction,
  validatePayload,
} from "../services/PlaybackService";
import { roomManager } from "../services/RoomManager";

export class PlaybackHandler {
  constructor(
    private io: Server,
    private socket: Socket,
  ) {}

  register(): void {
    this.socket.on("play", (payload: unknown) =>
      this.handleAction("play", payload),
    );
    this.socket.on("pause", (payload: unknown) =>
      this.handleAction("pause", payload),
    );
    this.socket.on("seek", (payload: unknown) =>
      this.handleAction("seek", payload),
    );
    this.socket.on("change_video", (payload: unknown) =>
      this.handleAction("change_video", payload),
    );
  }

  private handleAction(action: PlaybackAction, payload: unknown): void {
    const roomCode = roomManager.getRoomCodeBySocket(this.socket.id);
    if (!roomCode) {
      return;
    }

    const room = roomManager.getRoom(roomCode);
    if (!room) {
      return;
    }

    const participant = room.getParticipant(this.socket.id);
    if (!participant) {
      return;
    }

    if (!can(participant.role, action)) {
      this.socket.emit("action_denied", {
        action,
        message: "You don't have permission to do this",
      });
      return;
    }

    if (!validatePayload(action, payload)) {
      this.socket.emit("action_denied", { action, message: "Invalid data" });
      return;
    }

    applyAction(room, action, payload);

    this.socket.to(room.code).emit("sync_state", room.getVideoState());
  }
}
