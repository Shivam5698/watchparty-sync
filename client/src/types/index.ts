export type Role = "host" | "moderator" | "participant";

export type PlayState = "playing" | "paused";

export interface VideoState {
  videoId: string | null;
  playState: PlayState;
  currentTime: number;
  updatedAt: number;
}

export interface Participant {
  userId: string;
  username: string;
  role: Role;
}

export interface RoomInfo {
  roomId: string;
  userId: string;
  role: Role;
  participants: Participant[];
  videoState: VideoState | null;
}
