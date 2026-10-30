import { useState } from "react";
import type { Participant, Role } from "../types";
import Avatar from "./Avatar";
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
  const [openMenuUserId, setOpenMenuUserId] = useState<string | null>(null);
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
        const targetRole =
          participant.role === "participant" ? "moderator" : "participant";

        return (
          <li className="participant-item" key={participant.userId}>
            <div className="participant-info">
              <Avatar username={participant.username} />
              <span className="participant-name">
                {participant.username}
                {isCurrentUser && (
                  <span className="current-user-tag"> (You)</span>
                )}
              </span>
            </div>
            <div className="participant-row-details">
              <RoleBadge role={participant.role} />
              {showActions && (
                <div className="participant-menu-wrap">
                  <button
                    className="btn btn-ghost btn-sm participant-menu-trigger"
                    type="button"
                    aria-haspopup="menu"
                    aria-label={`Actions for ${participant.username}`}
                    aria-expanded={openMenuUserId === participant.userId}
                    onClick={() =>
                      setOpenMenuUserId((userId) =>
                        userId === participant.userId
                          ? null
                          : participant.userId,
                      )
                    }
                  >
                    ⋯
                  </button>
                  {openMenuUserId === participant.userId && (
                    <div className="participant-menu" role="menu">
                      <button
                        className="participant-menu-item"
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onAssignRole(participant.userId, targetRole);
                          setOpenMenuUserId(null);
                        }}
                      >
                        Make {targetRole}
                      </button>
                      <button
                        className="participant-menu-item"
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Transfer host to ${participant.username}?`,
                            )
                          ) {
                            onTransferHost(participant.userId);
                          }
                          setOpenMenuUserId(null);
                        }}
                      >
                        Transfer host
                      </button>
                      <button
                        className="participant-menu-item participant-menu-danger"
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Remove ${participant.username} from the room?`,
                            )
                          ) {
                            onRemove(participant.userId);
                          }
                          setOpenMenuUserId(null);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default ParticipantList;
