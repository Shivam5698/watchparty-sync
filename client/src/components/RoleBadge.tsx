import type { Role } from "../types";

interface RoleBadgeProps {
  role: Role;
}

const roleLabels: Record<Role, string> = {
  host: "Host",
  moderator: "Moderator",
  participant: "Participant",
};

function RoleBadge({ role }: RoleBadgeProps) {
  return (
    <span className={`role-badge role-badge-${role}`}>{roleLabels[role]}</span>
  );
}

export default RoleBadge;
