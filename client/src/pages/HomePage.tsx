import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useRoom } from "../hooks/useRoom";

function HomePage() {
  const { connected, createRoom, joinRoom } = useRoom();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const roomId = await createRoom(username);
      navigate(`/room/${roomId}`);
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : "Unable to create room",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    const code = roomCode.trim().toUpperCase();

    try {
      await joinRoom(code, username);
      navigate(`/room/${code}`);
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : "Unable to join room",
      );
    } finally {
      setLoading(false);
    }
  };

  const usernameMissing = username.trim().length === 0;

  return (
    <main className="home-page">
      <section className="home-card">
        <h1>WatchParty Sync</h1>

        {!connected && (
          <p className="connection-status">Connecting to server...</p>
        )}

        <label className="field-label" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          className="text-input"
          type="text"
          maxLength={20}
          autoComplete="nickname"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Enter your name"
        />

        <form onSubmit={handleCreate}>
          <button
            className="action-button primary-button"
            type="submit"
            disabled={loading || usernameMissing}
          >
            {loading ? "Please wait..." : "Create Room"}
          </button>
        </form>

        <div className="divider" aria-label="or">
          <span />
          <span>or</span>
          <span />
        </div>

        <form className="join-form" onSubmit={handleJoin}>
          <label className="field-label" htmlFor="room-code">
            Room code
          </label>
          <input
            id="room-code"
            className="text-input room-code-input"
            type="text"
            maxLength={6}
            autoCapitalize="characters"
            value={roomCode}
            onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
            placeholder="Enter room code"
          />
          <button
            className="action-button secondary-button"
            type="submit"
            disabled={loading || usernameMissing || roomCode.trim().length === 0}
          >
            {loading ? "Please wait..." : "Join Room"}
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

export default HomePage;
