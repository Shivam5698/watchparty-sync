import { useEffect, useState } from "react";
import type { Reaction } from "../types";

interface ReactionLayerProps {
  subscribe: (handler: (reaction: Reaction) => void) => () => void;
}

interface ReactionBubble {
  id: string;
  emoji: string;
  username: string;
  x: number;
  sway: number;
}

export default function ReactionLayer({ subscribe }: ReactionLayerProps) {
  const [items, setItems] = useState<ReactionBubble[]>([]);

  useEffect(() => {
    const unsubscribe = subscribe((reaction: Reaction) => {
      const bubble: ReactionBubble = {
        id: reaction.id,
        emoji: reaction.emoji,
        username: reaction.username,
        x: Math.random() * 120,
        sway: (Math.random() - 0.5) * 28,
      };

      setItems((current) => {
        const nextItems = [...current, bubble];
        return nextItems.slice(-30);
      });

      window.setTimeout(() => {
        setItems((current) => current.filter((item) => item.id !== reaction.id));
      }, 3000);
    });

    return () => {
      unsubscribe();
    };
  }, [subscribe]);

  return (
    <div className="reaction-layer" aria-live="polite">
      {items.map((item) => (
        <div
          key={item.id}
          className="reaction-bubble"
          style={{
            right: `${20 + item.x}px`,
            bottom: "72px",
            ["--reaction-sway" as string]: `${item.sway}px`,
          }}
        >
          <span className="reaction-bubble-emoji">{item.emoji}</span>
          <small>{item.username}</small>
        </div>
      ))}
    </div>
  );
}
