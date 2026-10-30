import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
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
    assignRole,
    removeParticipant,
    transferHost,
    removalNotice,
    requests,
    hasPendingRequest,
    chat,
    reconnecting,
    sendRequest,
    resolveRequest,
    sendChat,
  } = useRoom();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (removalNotice) {
      navigate("/", { replace: true });
    }
  }, [removalNotice, navigate]);

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
        <section className="home-card card join-room-card">
          <h1>Join Room {roomId}</h1>
          <form onSubmit={handleJoin}>
            <label className="field-label" htmlFor="room-username">
              Username
            </label>
            <input
              id="room-username"
              className="input text-input"
              type="text"
              maxLength={20}
              autoComplete="nickname"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Enter your name"
            />
            <button
              className="btn btn-primary action-button primary-button"
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
    <main
      className={`room-layout${sidebarCollapsed ? " sidebar-is-collapsed" : ""}`}
    >
      <TopBar
        roomId={room.roomId}
        participants={room.participants}
        role={room.role}
        copied={copied}
        onCopyInvite={handleCopyInvite}
        onLeave={handleLeave}
      />

      {reconnecting && (
        <p className="reconnecting-banner" role="status">
          Connection lost. Reconnecting...
        </p>
      )}

      {error && (
        <p className="error-message room-error" role="alert">
          {error}
        </p>
      )}

      <div className="room-content">
        <section className="room-main-column">
          <VideoPlayer
            videoState={room.videoState}
            canControl={canControlPlayback(room.role)}
            onPlay={sendPlay}
            onPause={sendPause}
            onSeek={sendSeek}
            onChangeVideo={sendChangeVideo}
            onRequest={sendRequest}
            hasPendingRequest={hasPendingRequest}
            messages={chat}
            currentUserId={room.userId}
            onSendChat={sendChat}
            notice={notice}
          />
        </section>
        <Sidebar
          role={room.role}
          participants={room.participants}
          currentUserId={room.userId}
          requests={requests}
          chat={chat}
          onAssignRole={assignRole}
          onRemoveParticipant={removeParticipant}
          onTransferHost={transferHost}
          onResolveRequest={resolveRequest}
          onSendChat={sendChat}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((collapsed) => !collapsed)}
        />
      </div>
    </main>
  );
}

export default RoomPage;
