import type { Server, Socket } from "socket.io";
import { can } from "../permissions/rolePermissions";
import {
  applyAction,
  type PlaybackAction,
  validatePayload,
} from "../services/PlaybackService";
import { roomManager } from "../services/RoomManager";
import { broadcastRequests } from "../services/requestNotifier";
import type { Ack, PlaybackRequest } from "../types/events";

const playbackActions: PlaybackAction[] = [
  "play",
  "pause",
  "seek",
  "change_video",
];

export class RequestHandler {
  constructor(
    private io: Server,
    private socket: Socket,
  ) {}

  register(): void {
    this.socket.on(
      "request_action",
      (payload: unknown, ack: Ack<{ requestId: string }>) =>
        this.handleRequestAction(payload, ack),
    );
    this.socket.on("resolve_request", (payload: unknown) =>
      this.handleResolveRequest(payload),
    );
  }

  private handleRequestAction(
    payload: unknown,
    ack: Ack<{ requestId: string }>,
  ): void {
    const roomCode = roomManager.getRoomCodeBySocket(this.socket.id);
    const room = roomCode ? roomManager.getRoom(roomCode) : undefined;
    const actor = room?.getParticipant(this.socket.id);
    if (!room || !actor) {
      ack({ ok: false, error: "Not in a room" });
      return;
    }

    if (can(actor.role, "play")) {
      ack({ ok: false, error: "You can already control playback" });
      return;
    }

    if (
      typeof payload !== "object" ||
      payload === null ||
      !("action" in payload) ||
      typeof payload.action !== "string" ||
      !playbackActions.includes(payload.action as PlaybackAction) ||
      !("payload" in payload)
    ) {
      ack({ ok: false, error: "Invalid request" });
      return;
    }

    const action = payload.action as PlaybackAction;
    const requestPayload = payload.payload;
    if (!validatePayload(action, requestPayload)) {
      ack({ ok: false, error: "Invalid request" });
      return;
    }

    const request = room.addRequest(
      actor.id,
      action,
      requestPayload as PlaybackRequest["payload"],
    );
    if (!request) {
      ack({ ok: false, error: "You already have a pending request" });
      return;
    }

    ack({ ok: true, requestId: request.id });
    broadcastRequests(this.io, room);
  }

  private handleResolveRequest(payload: unknown): void {
    const roomCode = roomManager.getRoomCodeBySocket(this.socket.id);
    const room = roomCode ? roomManager.getRoom(roomCode) : undefined;
    const actor = room?.getParticipant(this.socket.id);
    if (!room || !actor) {
      this.socket.emit("action_denied", {
        action: "resolve_request",
        message: "You must be in a room to do this",
      });
      return;
    }

    if (!can(actor.role, "resolve_request")) {
      this.socket.emit("action_denied", {
        action: "resolve_request",
        message: "You don't have permission to do this",
      });
      return;
    }

    if (
      typeof payload !== "object" ||
      payload === null ||
      !("requestId" in payload) ||
      typeof payload.requestId !== "string" ||
      !("approve" in payload) ||
      typeof payload.approve !== "boolean"
    ) {
      return;
    }

    const { requestId, approve } = payload;
    const request = room.removeRequest(requestId);
    if (!request) {
      broadcastRequests(this.io, room);
      return;
    }

    if (approve) {
      applyAction(room, request.action, request.payload);
      this.io.to(room.code).emit("sync_state", room.getVideoState());
    }

    this.io.to(request.userId).emit("request_resolved", {
      requestId,
      approved: approve,
      action: request.action,
      byUsername: actor.username,
    });
    broadcastRequests(this.io, room);
  }
}
