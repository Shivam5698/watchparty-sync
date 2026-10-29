import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ParticipantList from "../components/ParticipantList";
import VideoPlayer from "../components/VideoPlayer";
import { useRoom } from "../hooks/useRoom";
import { canControlPlayback } from "../utils/permissions";

function RoomPage() {
  const { roomId = "" } = useParams();
  const {
    room,
    joinRoom,
    leaveRoom,
    sendPlay,
    sendPause,
    sendSeek,
    sendChangeVideo,
    notice,
  } = useRoom();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const handleJoin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      await joinRoom(roomId, username);
    } catch (joinError) {
      setError(
        joinError instanceof Error ? joinError.message : "Unable to join room",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCopyInvite = async () => {
    setError("");
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Unable to copy invite link");
    }
  };

  const handleLeave = () => {
    leaveRoom();
    navigate("/");
  };

  if (!room || room.roomId !== roomId) {
    return (
      <main className="home-page">
        <section className="home-card join-room-card">
          <h1>Join Room {roomId}</h1>
          <form onSubmit={handleJoin}>
            <label className="field-label" htmlFor="room-username">
              Username
            </label>
            <input
              id="room-username"
              className="text-input"
              type="text"
              maxLength={20}
              autoComplete="nickname"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Enter your name"
            />
            <button
              className="action-button primary-button"
              type="submit"
              disabled={loading || username.trim().length === 0}
            >
              {loading ? "Joining..." : "Join"}
            </button>
          </form>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="room-layout">
      <header className="room-header">
        <h1>Room {room.roomId}</h1>
        <div className="room-header-actions">
          <button
            className="action-button secondary-button room-action-button"
            type="button"
            onClick={handleCopyInvite}
          >
            {copied ? "Copied!" : "Copy invite link"}
          </button>
          <button
            className="action-button leave-button room-action-button"
            type="button"
            onClick={handleLeave}
          >
            Leave
          </button>
        </div>
      </header>

      {notice && (
        <p className="room-notice" role="status">
          {notice}
        </p>
      )}

      {error && (
        <p className="error-message room-error" role="alert">
          {error}
        </p>
      )}

      <div className="room-content">
        <section className="room-panel participants-panel">
          <h2>Participants ({room.participants.length})</h2>
          <ParticipantList
            participants={room.participants}
            currentUserId={room.userId}
          />
        </section>
        <VideoPlayer
          videoState={room.videoState}
          canControl={canControlPlayback(room.role)}
          onPlay={sendPlay}
          onPause={sendPause}
          onSeek={sendSeek}
          onChangeVideo={sendChangeVideo}
        />
      </div>
    </main>
  );
}

export default RoomPage;
