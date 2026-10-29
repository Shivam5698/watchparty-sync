import type { ParticipantDTO, Role } from "../types/events";

export class Participant {
  constructor(
    public readonly id: string,
    public readonly username: string,
    public role: Role,
  ) {}

  toDTO(): ParticipantDTO {
    return {
      userId: this.id,
      username: this.username,
      role: this.role,
    };
  }
}
