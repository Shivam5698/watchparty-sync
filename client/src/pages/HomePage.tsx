import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useRoom } from "../hooks/useRoom";

function HomePage() {
  const {
    connected,
    createRoom,
    joinRoom,
    removalNotice,
    clearRemovalNotice,
  } = useRoom();
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
      <header className="home-hero">
        <h1>WatchParty Sync</h1>
        <p className="home-tagline">Watch videos together, wherever you are.</p>
      </header>

      <section className="home-card card">
        {removalNotice && (
          <div className="removal-notice" role="status">
            <span>{removalNotice}</span>
            <button
              className="removal-notice-close"
              type="button"
              aria-label="Dismiss removal notice"
              onClick={clearRemovalNotice}
            >
              ×
            </button>
          </div>
        )}

        {!connected && (
          <p className="connection-status">Connecting to server...</p>
        )}

        <div className="home-identity">
          <label className="field-label" htmlFor="username">
            Your name
          </label>
          <input
            id="username"
            className="input text-input"
            type="text"
            maxLength={20}
            autoComplete="nickname"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Enter your name"
          />
        </div>

        <div className="home-options">
          <section className="home-option">
            <h2>Create room</h2>
            <p className="home-option-copy">
              Start a watch party and invite your friends.
            </p>
            <form onSubmit={handleCreate}>
              <button
                className="btn btn-primary action-button primary-button"
                type="submit"
                disabled={loading || usernameMissing}
              >
                {loading ? "Please wait..." : "Create room"}
              </button>
            </form>
          </section>

          <div className="home-divider" aria-label="or">
            <span />
            <span>or</span>
            <span />
          </div>

          <section className="home-option">
            <h2>Join with code</h2>
            <p className="home-option-copy">
              Enter a room code to watch together.
            </p>
            <form className="join-form" onSubmit={handleJoin}>
              <label className="field-label" htmlFor="room-code">
                Room code
              </label>
              <input
                id="room-code"
                className="input text-input room-code-input"
                type="text"
                maxLength={6}
                autoCapitalize="characters"
                value={roomCode}
                onChange={(event) =>
                  setRoomCode(event.target.value.toUpperCase())
                }
                placeholder="Enter room code"
              />
              <button
                className="btn btn-ghost action-button secondary-button"
                type="submit"
                disabled={
                  loading || usernameMissing || roomCode.trim().length === 0
                }
              >
                {loading ? "Please wait..." : "Join with code"}
              </button>
            </form>
          </section>
        </div>

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
