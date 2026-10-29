import type { Server, Socket } from "socket.io";
import { roomManager } from "../services/RoomManager";
import type { Ack, ParticipantDTO, Role, VideoState } from "../types/events";

interface CreateRoomResult {
  roomId: string;
  userId: string;
  role: Role;
  participants: ParticipantDTO[];
}

interface JoinRoomResult extends CreateRoomResult {
  videoState: VideoState;
}

export class RoomHandler {
  constructor(
    private io: Server,
    private socket: Socket,
  ) {}

  register(): void {
    this.socket.on(
      "create_room",
      (payload: { username: string }, ack: Ack<CreateRoomResult>) => {
        const username = this.validateUsername(payload?.username);
        if (!username) {
          ack({ ok: false, error: "Username must be 1 to 20 characters" });
          return;
        }

        if (roomManager.getRoomCodeBySocket(this.socket.id)) {
          ack({ ok: false, error: "Socket is already in a room" });
          return;
        }

        const room = roomManager.createRoom(this.socket.id, username);
        void this.socket.join(room.code);
        ack({
          ok: true,
          roomId: room.code,
          userId: this.socket.id,
          role: "host",
          participants: room.getParticipants(),
        });
      },
    );

    this.socket.on(
      "join_room",
      (
        payload: { roomId: string; username: string },
        ack: Ack<JoinRoomResult>,
      ) => {
        const username = this.validateUsername(payload?.username);
        if (!username) {
          ack({ ok: false, error: "Username must be 1 to 20 characters" });
          return;
        }

        if (roomManager.getRoomCodeBySocket(this.socket.id)) {
          ack({ ok: false, error: "Socket is already in a room" });
          return;
        }

        const room =
          typeof payload?.roomId === "string"
            ? roomManager.joinRoom(payload.roomId, this.socket.id, username)
            : null;
        if (!room) {
          ack({ ok: false, error: "Room not found" });
          return;
        }

        void this.socket.join(room.code);
        const participants = room.getParticipants();
        ack({
          ok: true,
          roomId: room.code,
          userId: this.socket.id,
          role: "participant",
          participants,
          videoState: room.getVideoState(),
        });
        this.socket.to(room.code).emit("user_joined", {
          username,
          userId: this.socket.id,
          role: "participant",
          participants,
        });
      },
    );

    this.socket.on("leave_room", () => {
      void this.handleLeave();
    });

    this.socket.on("disconnect", () => {
      void this.handleLeave();
    });
  }

  private validateUsername(username: unknown): string | null {
    if (typeof username !== "string") {
      return null;
    }

    const trimmed = username.trim();
    return trimmed.length >= 1 && trimmed.length <= 20 ? trimmed : null;
  }

  private async handleLeave(): Promise<void> {
    const result = roomManager.leaveRoom(this.socket.id);
    if (!result) {
      return;
    }

    const { room, participant } = result;
    await this.socket.leave(room.code);
    this.io.to(room.code).emit("user_left", {
      username: participant.username,
      userId: this.socket.id,
      participants: room.getParticipants(),
    });
  }
}
