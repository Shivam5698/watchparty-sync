import type { Role } from "../types";

export function canControlPlayback(role: Role): boolean {
  return role === "host" || role === "moderator";
}
