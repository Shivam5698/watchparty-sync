export type Role = "host" | "moderator" | "participant";

export type PlayState = "playing" | "paused";

export interface VideoState {
  videoId: string | null;
  playState: PlayState;
  currentTime: number;
  updatedAt: number;
}

export interface PlaybackRequest {
  id: string;
  userId: string;
  username: string;
  action: "play" | "pause" | "seek" | "change_video";
  payload: { currentTime?: number; time?: number; videoId?: string };
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  role: Role;
  text: string;
  timestamp: number;
}

export interface ParticipantDTO {
  userId: string;
  username: string;
  role: Role;
}

export type Ack<T = {}> = (
  res: ({ ok: true } & T) | { ok: false; error: string },
) => void;
