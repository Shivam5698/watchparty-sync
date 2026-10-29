import type { Server, Socket } from "socket.io";
import { can, type Action } from "../permissions/rolePermissions";
import { roomManager } from "../services/RoomManager";

type PlaybackAction = Extract<Action, "play" | "pause" | "seek" | "change_video">;

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

    if (!this.isValidPayload(action, payload)) {
      this.socket.emit("action_denied", { action, message: "Invalid data" });
      return;
    }

    switch (action) {
      case "play":
        if ("currentTime" in payload) {
          room.play(payload.currentTime);
        }
        break;
      case "pause":
        if ("currentTime" in payload) {
          room.pause(payload.currentTime);
        }
        break;
      case "seek":
        if ("time" in payload) {
          room.seek(payload.time);
        }
        break;
      case "change_video":
        if ("videoId" in payload) {
          room.changeVideo(payload.videoId);
        }
        break;
    }

    this.socket.to(room.code).emit("sync_state", room.getVideoState());
  }

  private isValidPayload(
    action: PlaybackAction,
    payload: unknown,
  ): payload is
    | { currentTime: number }
    | { time: number }
    | { videoId: string } {
    if (typeof payload !== "object" || payload === null) {
      return false;
    }

    switch (action) {
      case "play":
      case "pause":
        return (
          "currentTime" in payload &&
          typeof payload.currentTime === "number" &&
          Number.isFinite(payload.currentTime) &&
          payload.currentTime >= 0
        );
      case "seek":
        return (
          "time" in payload &&
          typeof payload.time === "number" &&
          Number.isFinite(payload.time) &&
          payload.time >= 0
        );
      case "change_video":
        return (
          "videoId" in payload &&
          typeof payload.videoId === "string" &&
          /^[a-zA-Z0-9_-]{11}$/.test(payload.videoId)
        );
    }
  }
}
