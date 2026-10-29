import { Participant } from "./Participant";
import type { ParticipantDTO, VideoState } from "../types/events";

export class Room {
  private participants = new Map<string, Participant>();
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
    return participant;
  }

  getParticipant(id: string): Participant | undefined {
    return this.participants.get(id);
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
    return this.videoState;
  }

  isEmpty(): boolean {
    return this.participants.size === 0;
  }
}
