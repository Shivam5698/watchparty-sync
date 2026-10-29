import { Participant } from "./Participant";
import { randomUUID } from "node:crypto";
import type {
  ChatMessage,
  ParticipantDTO,
  PlaybackRequest,
  Role,
  VideoState,
} from "../types/events";

export class Room {
  private participants = new Map<string, Participant>();
  private pendingRequests = new Map<string, PlaybackRequest>();
  private chat: ChatMessage[] = [];
  private videoState: VideoState = {
    videoId: null,
    playState: "paused",
    currentTime: 0,
    updatedAt: Date.now(),
  };

  constructor(public readonly code: string) {}

  addParticipant(p: Participant): void {
    this.participants.set(p.id, p);
  }

  removeParticipant(id: string): Participant | undefined {
    const participant = this.participants.get(id);
    this.participants.delete(id);
    for (const [requestId, request] of this.pendingRequests) {
      if (request.userId === id) {
        this.pendingRequests.delete(requestId);
      }
    }
    return participant;
  }

  addRequest(
    userId: string,
    action: PlaybackRequest["action"],
    payload: PlaybackRequest["payload"],
  ): PlaybackRequest | null {
    const participant = this.participants.get(userId);
    if (
      !participant ||
      Array.from(this.pendingRequests.values()).some(
        (request) => request.userId === userId,
      )
    ) {
      return null;
    }

    const request: PlaybackRequest = {
      id: randomUUID(),
      userId,
      username: participant.username,
      action,
      payload,
      createdAt: Date.now(),
    };
    this.pendingRequests.set(request.id, request);
    return request;
  }

  getRequest(id: string): PlaybackRequest | undefined {
    return this.pendingRequests.get(id);
  }

  removeRequest(id: string): PlaybackRequest | undefined {
    const request = this.pendingRequests.get(id);
    this.pendingRequests.delete(id);
    return request;
  }

  getRequests(): PlaybackRequest[] {
    return Array.from(this.pendingRequests.values()).sort(
      (first, second) => first.createdAt - second.createdAt,
    );
  }

  addChatMessage(msg: ChatMessage): void {
    this.chat.push(msg);
    if (this.chat.length > 50) {
      this.chat.splice(0, this.chat.length - 50);
    }
  }

  getChat(): ChatMessage[] {
    return this.chat;
  }

  getParticipant(id: string): Participant | undefined {
    return this.participants.get(id);
  }

  setRole(userId: string, role: Role): boolean {
    const participant = this.participants.get(userId);
    if (!participant) {
      return false;
    }

    participant.role = role;
    return true;
  }

  transferHost(fromId: string, toId: string): boolean {
    const currentHost = this.participants.get(fromId);
    const nextHost = this.participants.get(toId);
    if (
      !currentHost ||
      currentHost.role !== "host" ||
      !nextHost ||
      fromId === toId
    ) {
      return false;
    }

    // Demote any stale extra hosts so the successful transfer leaves one host.
    for (const participant of this.participants.values()) {
      if (participant.role === "host") {
        participant.role = "moderator";
      }
    }
    currentHost.role = "moderator";
    nextHost.role = "host";
    return true;
  }

  promoteNextHost(): Participant | undefined {
    if (this.getHost()) {
      return undefined;
    }

    const promoted =
      Array.from(this.participants.values()).find(
        (participant) => participant.role === "moderator",
      ) ?? this.participants.values().next().value;
    if (!promoted) {
      return undefined;
    }

    // Map iteration preserves insertion order for deterministic promotion.
    promoted.role = "host";
    return promoted;
  }

  getParticipants(): ParticipantDTO[] {
    return Array.from(this.participants.values(), (participant) =>
      participant.toDTO(),
    );
  }

  getHost(): Participant | undefined {
    return Array.from(this.participants.values()).find(
      (participant) => participant.role === "host",
    );
  }

  getVideoState(): VideoState {
    const videoState = { ...this.videoState };
    if (videoState.playState === "playing") {
      videoState.currentTime += (Date.now() - videoState.updatedAt) / 1000;
    }
    return videoState;
  }

  play(time: number): void {
    this.videoState = {
      ...this.videoState,
      playState: "playing",
      currentTime: time,
      updatedAt: Date.now(),
    };
  }

  pause(time: number): void {
    this.videoState = {
      ...this.videoState,
      playState: "paused",
      currentTime: time,
      updatedAt: Date.now(),
    };
  }

  seek(time: number): void {
    this.videoState = {
      ...this.videoState,
      currentTime: time,
      updatedAt: Date.now(),
    };
  }

  changeVideo(videoId: string): void {
    this.videoState = {
      ...this.videoState,
      videoId,
      currentTime: 0,
      playState: "playing",
      updatedAt: Date.now(),
    };
  }

  isEmpty(): boolean {
    return this.participants.size === 0;
  }
}
