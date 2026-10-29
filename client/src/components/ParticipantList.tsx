import type { Participant, Role } from "../types";
import RoleBadge from "./RoleBadge";

interface ParticipantListProps {
  participants: Participant[];
  currentUserId: string;
}

const roleOrder: Record<Role, number> = {
  host: 0,
  moderator: 1,
  participant: 2,
};

function ParticipantList({
  participants,
  currentUserId,
}: ParticipantListProps) {
  const sortedParticipants = [...participants].sort(
    (first, second) => roleOrder[first.role] - roleOrder[second.role],
  );

  return (
    <ul className="participant-list">
      {sortedParticipants.map((participant) => (
        <li className="participant-item" key={participant.userId}>
          <span className="participant-name">
            {participant.username}
            {participant.userId === currentUserId && (
              <span className="current-user-tag"> (You)</span>
            )}
          </span>
          <RoleBadge role={participant.role} />
        </li>
      ))}
    </ul>
  );
}

export default ParticipantList;
