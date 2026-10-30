import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { ChatMessage } from "../types";

interface FloatingChatProps {
  messages: ChatMessage[];
  currentUserId: string;
  onSendChat: (text: string) => Promise<void>;
}

function sameIds(first: Set<string>, second: Set<string>): boolean {
  return first.size === second.size && [...first].every((id) => second.has(id));
}

function FloatingChat({
  messages,
  currentUserId,
  onSendChat,
}: FloatingChatProps) {
  const [inputOpen, setInputOpen] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [seenMessageIds, setSeenMessageIds] = useState(
    () => new Set(messages.map(({ id }) => id)),
  );
  const [visibleMessageIds, setVisibleMessageIds] = useState(
    () => new Set<string>(),
  );
  const [fadingMessageIds, setFadingMessageIds] = useState(
    () => new Set<string>(),
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const arrivalTimes = useRef(
    new Map(messages.map(({ id, timestamp }) => [id, timestamp] as const)),
  );
  const trackedMessageIds = useRef(new Set(messages.map(({ id }) => id)));

  useEffect(() => {
    const timer = window.setInterval(() => {
      const currentTime = Date.now();
      messages.forEach(({ id }) => {
        if (!trackedMessageIds.current.has(id)) {
          trackedMessageIds.current.add(id);
          arrivalTimes.current.set(id, currentTime);
        }
      });
      arrivalTimes.current.forEach((arrivedAt, id) => {
        if (currentTime - arrivedAt >= 6000) {
          arrivalTimes.current.delete(id);
        }
      });
      const recentIds = new Set(
        messages
          .slice(-4)
          .filter((message) => {
            const arrivedAt = arrivalTimes.current.get(message.id);
            return arrivedAt !== undefined && currentTime - arrivedAt < 6000;
          })
          .map(({ id }) => id),
      );
      const fadingIds = new Set(
        messages
          .slice(-4)
          .filter((message) => {
            const arrivedAt = arrivalTimes.current.get(message.id);
            return (
              arrivedAt !== undefined &&
              currentTime - arrivedAt >= 5000 &&
              currentTime - arrivedAt < 6000
            );
          })
          .map(({ id }) => id),
      );
      setVisibleMessageIds((previous) =>
        sameIds(previous, recentIds) ? previous : recentIds,
      );
      setFadingMessageIds((previous) =>
        sameIds(previous, fadingIds) ? previous : fadingIds,
      );
    }, 250);
    return () => window.clearInterval(timer);
  }, [messages]);

  useEffect(() => {
    if (inputOpen) {
      inputRef.current?.focus();
    }
  }, [inputOpen]);

  const markMessagesRead = useCallback(() => {
    setSeenMessageIds(new Set(messages.map(({ id }) => id)));
  }, [messages]);

  const closeInput = useCallback(() => {
    markMessagesRead();
    setInputOpen(false);
    setSendError("");
  }, [markMessagesRead]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && inputOpen) {
        event.preventDefault();
        event.stopPropagation();
        closeInput();
        return;
      }

      if (
        event.key !== "Enter" ||
        inputOpen ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      event.preventDefault();
      markMessagesRead();
      setInputOpen(true);
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [closeInput, inputOpen, markMessagesRead]);

  const unread = messages.some(
    (message) =>
      message.userId !== currentUserId && !seenMessageIds.has(message.id),
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = messageText.trim();
    if (!text || sending) {
      return;
    }

    setSending(true);
    setSendError("");
    try {
      await onSendChat(text);
      setMessageText("");
      closeInput();
    } catch (sendActionError) {
      setSendError(
        sendActionError instanceof Error
          ? sendActionError.message
          : "Unable to send message",
      );
    } finally {
      setSending(false);
    }
  };

  const recentMessages = messages
    .slice(-4)
    .filter(({ id }) => visibleMessageIds.has(id));

  return (
    <div className="floating-chat">
      <ul className="floating-chat-list" aria-live="polite">
        {recentMessages.map((message) => {
          return (
            <li
              className={`floating-chat-message${fadingMessageIds.has(message.id) ? " is-fading" : ""}`}
              key={message.id}
            >
              <strong>{message.username}</strong>
              <span>{message.text}</span>
            </li>
          );
        })}
      </ul>

      {inputOpen ? (
        <form className="floating-chat-form" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className="input floating-chat-input"
            type="text"
            maxLength={300}
            value={messageText}
            onChange={(event) => setMessageText(event.target.value)}
            placeholder="Send a message..."
            aria-label="Send a chat message"
            disabled={sending}
          />
          {sendError && (
            <span className="floating-chat-error" role="alert">
              {sendError}
            </span>
          )}
        </form>
      ) : (
        <button
          className="btn btn-ghost floating-chat-toggle"
          type="button"
          onClick={() => {
            markMessagesRead();
            setInputOpen(true);
          }}
          aria-label="Open chat input"
        >
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M4 5.5A2.5 2.5 0 0 1 6.5 3h7A2.5 2.5 0 0 1 16 5.5v5a2.5 2.5 0 0 1-2.5 2.5H9l-4 3v-3.4a2.5 2.5 0 0 1-1-2.1v-5Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
          <span>Chat</span>
          {unread && <span className="floating-chat-unread-dot" />}
        </button>
      )}
    </div>
  );
}

export default FloatingChat;
