import type { Server, Socket } from "socket.io";
import { roomManager } from "../services/RoomManager";
import type { Ack, VideoState } from "../types/events";

type SyncAck = Ack<{ videoState: VideoState }>;

export class SyncHandler {
  constructor(
    private io: Server,
    private socket: Socket,
  ) {}

  register(): void {
    this.socket.on("request_sync", (ack: SyncAck) => {
      if (typeof ack !== "function") {
        return;
      }
      const roomCode = roomManager.getRoomCodeBySocket(this.socket.id);
      const room = roomCode ? roomManager.getRoom(roomCode) : undefined;
      const participant = room?.getParticipant(this.socket.id);

      if (!room || !participant) {
        ack({ ok: false, error: "Not in a room" });
        return;
      }

      ack({ ok: true, videoState: room.getVideoState() });
    });
  }
}
