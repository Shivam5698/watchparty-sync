import type { Server } from "socket.io";
import type { Room } from "../models/Room";
import { can } from "../permissions/rolePermissions";

export function broadcastRequests(io: Server, room: Room): void {
  const requests = room.getRequests();
  for (const participant of room.getParticipants()) {
    if (can(participant.role, "resolve_request")) {
      io.to(participant.userId).emit("requests_updated", { requests });
    }
  }
}
