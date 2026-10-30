import { useRef, useState } from "react";

interface ReactionBarProps {
  onReact: (emoji: string) => void;
  compact?: boolean;
  vertical?: boolean;
}

const EMOJIS = ["❤️", "😂", "😮", "👏", "🔥", "😢"] as const;

export default function ReactionBar({
  onReact,
  compact = false,
  vertical = false,
}: ReactionBarProps) {
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
    <div
      className={[
        "reaction-bar",
        compact ? "reaction-bar-compact" : "",
        vertical ? "reaction-bar-vertical" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className={[
            "reaction-button",
            compact ? "reaction-button-compact" : "",
            vertical ? "reaction-button-vertical" : "",
            pressed[emoji] ? "is-pressed" : "",
          ]
            .filter(Boolean)
            .join(" ")}
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
