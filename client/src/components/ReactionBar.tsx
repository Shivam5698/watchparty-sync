import { useRef, useState } from "react";

interface ReactionBarProps {
  onReact: (emoji: string) => void;
  compact?: boolean;
}

const EMOJIS = ["❤️", "😂", "😮", "👏", "🔥", "😢"] as const;

export default function ReactionBar({ onReact, compact = false }: ReactionBarProps) {
  const [pressed, setPressed] = useState<Record<string, boolean>>({});
  const lastPressRef = useRef(0);

  const handlePress = (emoji: string) => {
    const now = Date.now();
    if (now - lastPressRef.current < 250) {
      return;
    }

    lastPressRef.current = now;
    onReact(emoji);
    setPressed((current) => ({ ...current, [emoji]: true }));
    window.setTimeout(() => {
      setPressed((current) => ({ ...current, [emoji]: false }));
    }, 180);
  };

  return (
    <div className={`reaction-bar${compact ? " reaction-bar-compact" : ""}`}>
      {EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className={`reaction-button${compact ? " reaction-button-compact" : ""}${pressed[emoji] ? " is-pressed" : ""}`}
          onClick={() => handlePress(emoji)}
          aria-label={`Send ${emoji} reaction`}
          title={emoji}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
