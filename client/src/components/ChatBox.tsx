import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatMessage } from "../types";

interface ChatBoxProps {
  messages: ChatMessage[];
  currentUserId: string;
  onSend: (text: string) => Promise<void>;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function ChatBox({
  messages,
  currentUserId,
  onSend,
}: ChatBoxProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const messageListRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = messageListRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = text.trim();
    if (!message || sending) {
      return;
    }

    setError("");
    setSending(true);
    try {
      await onSend(message);
      setText("");
    } catch (sendError: unknown) {
      setError(
        sendError instanceof Error ? sendError.message : "Unable to send message",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="chat-box card">
      <h2>Chat</h2>
      <ul className="chat-message-list" ref={messageListRef}>
        {messages.map((message) => {
          const isCurrentUser = message.userId === currentUserId;
          return (
            <li
              className={`chat-message-row${isCurrentUser ? " chat-message-own" : ""}`}
              key={message.id}
            >
              <article className="chat-message">
                <header className="chat-message-header">
                  <strong>{message.username}</strong>
                  <span
                    className={`badge badge-${message.role} chat-role-tag`}
                  >
                    {message.role}
                  </span>
                  <time dateTime={new Date(message.timestamp).toISOString()}>
                    {formatTime(message.timestamp)}
                  </time>
                </header>
                <p>{message.text}</p>
              </article>
            </li>
          );
        })}
      </ul>
      <form className="chat-compose-form" onSubmit={handleSubmit}>
        <input
          className="input text-input chat-message-input"
          type="text"
          maxLength={300}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Write a message..."
          aria-label="Chat message"
        />
        <button
          className="btn btn-primary action-button primary-button chat-send-button"
          type="submit"
          disabled={sending || text.trim().length === 0}
        >
          Send
        </button>
      </form>
      {error && (
        <p className="chat-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
