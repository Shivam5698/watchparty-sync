import type { Room } from "../models/Room";

export type PlaybackAction = "play" | "pause" | "seek" | "change_video";

export function validatePayload(
  action: PlaybackAction,
  payload: unknown,
): boolean {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  switch (action) {
    case "play":
    case "pause":
      return (
        "currentTime" in payload &&
        typeof payload.currentTime === "number" &&
        Number.isFinite(payload.currentTime) &&
        payload.currentTime >= 0
      );
    case "seek":
      return (
        "time" in payload &&
        typeof payload.time === "number" &&
        Number.isFinite(payload.time) &&
        payload.time >= 0
      );
    case "change_video":
      return (
        "videoId" in payload &&
        typeof payload.videoId === "string" &&
        /^[a-zA-Z0-9_-]{11}$/.test(payload.videoId)
      );
  }
}

export function applyAction(
  room: Room,
  action: PlaybackAction,
  payload: any,
): void {
  switch (action) {
    case "play":
      room.play(payload.currentTime);
      break;
    case "pause":
      room.pause(payload.currentTime);
      break;
    case "seek":
      room.seek(payload.time);
      break;
    case "change_video":
      room.changeVideo(payload.videoId);
      break;
  }
}
