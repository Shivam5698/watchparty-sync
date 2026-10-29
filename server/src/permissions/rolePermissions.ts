import type { Role } from "../types/events";

export type Action =
  | "play"
  | "pause"
  | "seek"
  | "change_video"
  | "assign_role"
  | "remove_participant"
  | "transfer_host";

const roleActions: Record<Role, Action[]> = {
  host: [
    "play",
    "pause",
    "seek",
    "change_video",
    "assign_role",
    "remove_participant",
    "transfer_host",
  ],
  moderator: ["play", "pause", "seek", "change_video"],
  participant: [],
};

export function can(role: Role, action: Action): boolean {
  return roleActions[role].includes(action);
}
