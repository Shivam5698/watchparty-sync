export type Role = "host" | "moderator" | "participant";

export type PlayState = "playing" | "paused";

export interface VideoState {
  videoId: string | null;
  playState: PlayState;
  currentTime: number;
  updatedAt: number;
}

export interface ParticipantDTO {
  userId: string;
  username: string;
  role: Role;
}

export type Ack<T = {}> = (
  res: ({ ok: true } & T) | { ok: false; error: string },
) => void;
