export type Role = "host" | "moderator" | "participant";

export interface RoomNotice {
  id: number;
  text: string;
}

export type PlayState = "playing" | "paused";

export type PlaybackAction = "play" | "pause" | "seek" | "change_video";

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
  action: PlaybackAction;
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
