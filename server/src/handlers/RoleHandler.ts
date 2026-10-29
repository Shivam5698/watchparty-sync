import type { Server, Socket } from "socket.io";
import type { Participant } from "../models/Participant";
import type { Room } from "../models/Room";
import { can, type Action } from "../permissions/rolePermissions";
import { roomManager } from "../services/RoomManager";

interface RoleHandlerContext {
  room: Room;
  actor: Participant;
}

export class RoleHandler {
  constructor(
    private io: Server,
    private socket: Socket,
  ) {}

  register(): void {
    this.socket.on("assign_role", (payload: unknown) =>
      this.handleAssignRole(payload),
    );
    this.socket.on("remove_participant", (payload: unknown) =>
      this.handleRemoveParticipant(payload),
    );
    this.socket.on("transfer_host", (payload: unknown) =>
      this.handleTransferHost(payload),
    );
  }

  private resolveContext(action: Action): RoleHandlerContext | null {
    const roomCode = roomManager.getRoomCodeBySocket(this.socket.id);
    const room = roomCode ? roomManager.getRoom(roomCode) : undefined;
    const actor = room?.getParticipant(this.socket.id);

    if (!room || !actor) {
      this.deny(action, "You must be in a room to do this");
      return null;
    }

    if (!can(actor.role, action)) {
      this.deny(action, "You don't have permission to do this");
      return null;
    }

    return { room, actor };
  }

  private handleAssignRole(payload: unknown): void {
    const context = this.resolveContext("assign_role");
    if (!context) {
      return;
    }

    if (
      typeof payload !== "object" ||
      payload === null ||
      !("userId" in payload) ||
      typeof payload.userId !== "string" ||
      !("role" in payload) ||
      (payload.role !== "moderator" && payload.role !== "participant")
    ) {
      this.deny("assign_role", "Invalid role assignment");
      return;
    }

    const { room, actor } = context;
    const { userId, role } = payload;
    const target = room.getParticipant(userId);
    if (!target) {
      this.deny("assign_role", "That participant is not in this room");
      return;
    }
    if (actor.role === "host" && actor.id === userId) {
      this.deny("assign_role", "The host cannot change their own role");
      return;
    }
    if (target.role === role) {
      return;
    }

    room.setRole(userId, role);
    this.io.to(room.code).emit("role_assigned", {
      userId,
      username: target.username,
      role,
      participants: room.getParticipants(),
    });
  }

  private handleRemoveParticipant(payload: unknown): void {
    const context = this.resolveContext("remove_participant");
    if (!context) {
      return;
    }

    if (
      typeof payload !== "object" ||
      payload === null ||
      !("userId" in payload) ||
      typeof payload.userId !== "string"
    ) {
      this.deny("remove_participant", "Invalid participant");
      return;
    }

    const { room, actor } = context;
    const { userId } = payload;
    if (!room.getParticipant(userId)) {
      this.deny("remove_participant", "That participant is not in this room");
      return;
    }
    if (actor.role === "host" && actor.id === userId) {
      this.deny("remove_participant", "The host cannot remove themselves");
      return;
    }

    const result = roomManager.leaveRoom(userId);
    if (!result) {
      this.deny("remove_participant", "Unable to remove that participant");
      return;
    }

    this.io.to(room.code).emit("participant_removed", {
      userId,
      participants: room.getParticipants(),
    });
    void this.io.sockets.sockets.get(userId)?.leave(room.code);
  }

  private handleTransferHost(payload: unknown): void {
    const context = this.resolveContext("transfer_host");
    if (!context) {
      return;
    }

    if (
      typeof payload !== "object" ||
      payload === null ||
      !("userId" in payload) ||
      typeof payload.userId !== "string"
    ) {
      this.deny("transfer_host", "Invalid host transfer");
      return;
    }

    const { room, actor } = context;
    const { userId } = payload;
    if (!room.getParticipant(userId)) {
      this.deny("transfer_host", "That participant is not in this room");
      return;
    }
    if (actor.role === "host" && actor.id === userId) {
      this.deny("transfer_host", "The host cannot transfer host to themselves");
      return;
    }
    if (!room.transferHost(actor.id, userId)) {
      this.deny("transfer_host", "Unable to transfer host to that participant");
      return;
    }

    this.io.to(room.code).emit("host_transferred", {
      fromUserId: actor.id,
      toUserId: userId,
      participants: room.getParticipants(),
    });
  }

  private deny(action: Action, message: string): void {
    this.socket.emit("action_denied", { action, message });
  }
}
