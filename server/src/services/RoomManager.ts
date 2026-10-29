import { Participant } from "../models/Participant";
import { Room } from "../models/Room";
import { generateRoomCode } from "../utils/generateRoomCode";

class RoomManager {
  private rooms = new Map<string, Room>();
  private socketToRoom = new Map<string, string>();

  createRoom(hostId: string, username: string): Room {
    const code = generateRoomCode((candidate) => this.rooms.has(candidate));
    const room = new Room(code);
    room.addParticipant(new Participant(hostId, username, "host"));
    this.rooms.set(code, room);
    this.socketToRoom.set(hostId, code);
    return room;
  }

  joinRoom(code: string, userId: string, username: string): Room | null {
    const normalizedCode = code.trim().toUpperCase();
    const room = this.rooms.get(normalizedCode);

    if (!room) {
      return null;
    }

    room.addParticipant(new Participant(userId, username, "participant"));
    this.socketToRoom.set(userId, normalizedCode);
    return room;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  getRoomCodeBySocket(socketId: string): string | undefined {
    return this.socketToRoom.get(socketId);
  }

  leaveRoom(userId: string): { room: Room; participant: Participant } | null {
    const code = this.socketToRoom.get(userId);
    if (!code) {
      return null;
    }

    const room = this.rooms.get(code);
    const participant = room?.removeParticipant(userId);
    this.socketToRoom.delete(userId);

    if (!room || !participant) {
      return null;
    }

    if (room.isEmpty()) {
      this.rooms.delete(code);
    }

    return { room, participant };
  }
}

export const roomManager = new RoomManager();
