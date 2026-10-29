import { useState, type FormEvent } from "react";
import type { PlaybackAction } from "../types";
import { extractVideoId } from "../utils/youtube";

interface RequestControlsProps {
  onRequest: (action: PlaybackAction, payload: object) => Promise<void>;
  getCurrentTime: () => number;
  hasPending: boolean;
}

function parseSeekTime(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (!trimmed.includes(":")) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  }

  const match = /^(\d+):([0-5]?\d(?:\.\d+)?)$/.exec(trimmed);
  if (!match) {
    return null;
  }

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  return Number.isFinite(minutes) && seconds < 60
    ? minutes * 60 + seconds
    : null;
}

export default function RequestControls({
  onRequest,
  getCurrentTime,
  hasPending,
}: RequestControlsProps) {
  const [seekInput, setSeekInput] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [validationError, setValidationError] = useState("");
  const [requestError, setRequestError] = useState("");

  const submitRequest = async (
    action: PlaybackAction,
    payload: object,
  ): Promise<void> => {
    setValidationError("");
    setRequestError("");
    try {
      await onRequest(action, payload);
    } catch (error: unknown) {
      setRequestError(
        error instanceof Error ? error.message : "Unable to send request",
      );
    }
  };

  const handleSeek = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const time = parseSeekTime(seekInput);
    if (time === null) {
      setValidationError("Invalid time");
      setRequestError("");
      return;
    }
    void submitRequest("seek", { time });
  };

  const handleVideo = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      setValidationError("Invalid YouTube link");
      setRequestError("");
      return;
    }
    void submitRequest("change_video", { videoId });
  };

  return (
    <section className="request-controls" aria-label="Playback requests">
      <div className="request-playback-buttons">
        <button
          className="request-control-button"
          type="button"
          disabled={hasPending}
          onClick={() =>
            void submitRequest("play", { currentTime: getCurrentTime() })
          }
        >
          Request play
        </button>
        <button
          className="request-control-button"
          type="button"
          disabled={hasPending}
          onClick={() =>
            void submitRequest("pause", { currentTime: getCurrentTime() })
          }
        >
          Request pause
        </button>
      </div>

      <form className="request-form" onSubmit={handleSeek}>
        <label htmlFor="request-seek-time">Seek time</label>
        <div className="request-form-controls">
          <input
            id="request-seek-time"
            className="text-input request-input"
            type="text"
            value={seekInput}
            onChange={(event) => setSeekInput(event.target.value)}
            placeholder="mm:ss or seconds"
          />
          <button
            className="request-control-button"
            type="submit"
            disabled={hasPending}
          >
            Request seek
          </button>
        </div>
      </form>

      <form className="request-form" onSubmit={handleVideo}>
        <label htmlFor="request-video-url">YouTube link</label>
        <div className="request-form-controls">
          <input
            id="request-video-url"
            className="text-input request-input"
            type="text"
            value={videoUrl}
            onChange={(event) => setVideoUrl(event.target.value)}
            placeholder="Paste a YouTube link"
          />
          <button
            className="request-control-button"
            type="submit"
            disabled={hasPending}
          >
            Request video
          </button>
        </div>
      </form>

      {hasPending && (
        <p className="request-pending-message">
          Request pending... waiting for host or moderator
        </p>
      )}
      {validationError && (
        <p className="request-error" role="alert">
          {validationError}
        </p>
      )}
      {requestError && (
        <p className="request-error" role="alert">
          {requestError}
        </p>
      )}
    </section>
  );
}
