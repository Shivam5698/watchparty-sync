import type { Role } from "../types/events";

export type Action =
  | "play"
  | "pause"
  | "seek"
  | "change_video"
  | "assign_role"
  | "remove_participant"
  | "transfer_host"
  | "resolve_request";

const roleActions: Record<Role, Action[]> = {
  host: [
    "play",
    "pause",
    "seek",
    "change_video",
    "assign_role",
    "remove_participant",
    "transfer_host",
    "resolve_request",
  ],
  moderator: ["play", "pause", "seek", "change_video", "resolve_request"],
  participant: [],
};

export function can(role: Role, action: Action): boolean {
  return roleActions[role].includes(action);
}
