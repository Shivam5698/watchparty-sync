import type { Participant, Role } from "../types";
import Avatar from "./Avatar";
import RoleBadge from "./RoleBadge";

interface TopBarProps {
  roomId: string;
  participants: Participant[];
  role: Role;
  copied: boolean;
  onCopyInvite: () => void;
  onLeave: () => void;
}

function TopBar({
  roomId,
  participants,
  role,
  copied,
  onCopyInvite,
  onLeave,
}: TopBarProps) {
  const visibleParticipants = participants.slice(0, 5);
  const remainingCount = participants.length - visibleParticipants.length;

  return (
    <header className="room-topbar">
      <div className="room-brand">
        WatchParty Sync
      </div>

      <div className="topbar-room">
        <span className="chip room-code-chip">{roomId}</span>
        <button
          className="btn btn-ghost btn-sm copy-invite-button"
          type="button"
          onClick={onCopyInvite}
        >
          {copied ? "Copied!" : "Copy invite link"}
        </button>
      </div>

      <div className="topbar-participants" aria-label="Room participants">
        <div className="avatar-stack">
          {visibleParticipants.map((participant) => (
            <Avatar
              className="avatar-stack-item"
              key={participant.userId}
              username={participant.username}
            />
          ))}
          {remainingCount > 0 && (
            <span
              className="avatar avatar-stack-overflow"
              aria-label={`${remainingCount} more participants`}
            >
              +{remainingCount}
            </span>
          )}
        </div>
        <RoleBadge role={role} />
      </div>

      <button
        className="btn btn-danger btn-sm topbar-leave-button"
        type="button"
        onClick={onLeave}
      >
        Leave
      </button>
    </header>
  );
}

export default TopBar;
