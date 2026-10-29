import type { Participant, Role } from "../types";
import RoleBadge from "./RoleBadge";

interface ParticipantListBaseProps {
  participants: Participant[];
  currentUserId: string;
}

interface ParticipantListProps extends ParticipantListBaseProps {
  isHost: boolean;
  onAssignRole: (userId: string, role: Role) => void;
  onRemove: (userId: string) => void;
  onTransferHost: (userId: string) => void;
}

type CompatibleParticipantListProps =
  | ParticipantListProps
  | ParticipantListBaseProps;

const roleOrder: Record<Role, number> = {
  host: 0,
  moderator: 1,
  participant: 2,
};

function ParticipantList(props: CompatibleParticipantListProps) {
  const { participants, currentUserId } = props;
  const isHost = "isHost" in props && props.isHost;
  const onAssignRole =
    "onAssignRole" in props ? props.onAssignRole : () => {};
  const onRemove = "onRemove" in props ? props.onRemove : () => {};
  const onTransferHost =
    "onTransferHost" in props ? props.onTransferHost : () => {};
  const sortedParticipants = [...participants].sort(
    (first, second) => roleOrder[first.role] - roleOrder[second.role],
  );

  return (
    <ul className="participant-list">
      {sortedParticipants.map((participant) => {
        const isCurrentUser = participant.userId === currentUserId;
        const showActions =
          isHost && !isCurrentUser && participant.role !== "host";

        return (
          <li className="participant-item" key={participant.userId}>
            <span className="participant-name">
              {participant.username}
              {isCurrentUser && (
                <span className="current-user-tag"> (You)</span>
              )}
            </span>
            <div className="participant-row-details">
              {showActions && (
                <div className="participant-actions">
                  <select
                    className="participant-role-select"
                    aria-label={`Role for ${participant.username}`}
                    value={participant.role}
                    onChange={(event) => {
                      const role = event.target.value;
                      if (role === "moderator" || role === "participant") {
                        onAssignRole(participant.userId, role);
                      }
                    }}
                  >
                    <option value="moderator">Moderator</option>
                    <option value="participant">Participant</option>
                  </select>
                  <button
                    className="participant-action-button make-host-button"
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Transfer host to ${participant.username}?`,
                        )
                      ) {
                        onTransferHost(participant.userId);
                      }
                    }}
                  >
                    Make host
                  </button>
                  <button
                    className="participant-action-button remove-participant-button"
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove ${participant.username} from the room?`,
                        )
                      ) {
                        onRemove(participant.userId);
                      }
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}
              <RoleBadge role={participant.role} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default ParticipantList;
