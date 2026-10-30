import { getInitials } from "../utils/avatar";

interface AvatarProps {
  username: string;
  className?: string;
}

function getHue(username: string): number {
  let hash = 0;
  for (const character of username.toLowerCase()) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }
  return Math.abs(hash) % 360;
}

export default function Avatar({ username, className = "" }: AvatarProps) {
  const hue = getHue(username);

  return (
    <span
      className={`avatar avatar-hashed ${className}`.trim()}
      style={{
        backgroundColor: `hsl(${hue} 52% 28%)`,
        borderColor: `hsl(${hue} 55% 50%)`,
        color: `hsl(${hue} 90% 88%)`,
      }}
      aria-label={username}
      title={username}
    >
      {getInitials(username)}
    </span>
  );
}
