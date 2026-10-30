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
    this.socket.on("play", (payload: unknown) => {
      if (typeof payload !== "object" && payload !== null) {
        return;
      }
      this.handleAction("play", payload);
    });
    this.socket.on("pause", (payload: unknown) => {
      if (typeof payload !== "object" && payload !== null) {
        return;
      }
      this.handleAction("pause", payload);
    });
    this.socket.on("seek", (payload: unknown) => {
      if (typeof payload !== "object" && payload !== null) {
        return;
      }
      this.handleAction("seek", payload);
    });
    this.socket.on("change_video", (payload: unknown) => {
      if (typeof payload !== "object" && payload !== null) {
        return;
      }
      this.handleAction("change_video", payload);
    });
  }

  private handleAction(action: PlaybackAction, payload: unknown): void {
    if (typeof payload !== "object" || payload === null) {
      this.socket.emit("action_denied", { action, message: "Invalid data" });
      return;
    }

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
