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
    <section
      className="request-controls video-controls-card card"
      aria-label="Playback requests"
    >
      <div className="request-controls-row">
        <button
          className="btn btn-ghost request-control-button request-play-button"
          type="button"
          disabled={hasPending}
          aria-label="Request play"
          onClick={() =>
            void submitRequest("play", { currentTime: getCurrentTime() })
          }
        >
          <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M4 2.7c0-.6.7-1 1.2-.7l8 5.3a.8.8 0 0 1 0 1.4l-8 5.3c-.5.3-1.2 0-1.2-.7V2.7Z" />
          </svg>
          <span>Play</span>
        </button>
        <button
          className="btn btn-ghost request-control-button request-pause-button"
          type="button"
          disabled={hasPending}
          aria-label="Request pause"
          onClick={() =>
            void submitRequest("pause", { currentTime: getCurrentTime() })
          }
        >
          <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <rect x="3" y="2.5" width="3.5" height="11" rx="1" />
            <rect x="9.5" y="2.5" width="3.5" height="11" rx="1" />
          </svg>
          <span>Pause</span>
        </button>
        <form className="request-inline-form" onSubmit={handleSeek}>
          <label className="visually-hidden" htmlFor="request-seek-time">
            Seek time
          </label>
          <input
            id="request-seek-time"
            className="input text-input request-input request-seek-input"
            type="text"
            value={seekInput}
            onChange={(event) => setSeekInput(event.target.value)}
            placeholder="mm:ss"
          />
          <button
            className="btn btn-ghost request-control-button"
            type="submit"
            disabled={hasPending}
          >
            Seek
          </button>
        </form>
        <form className="request-inline-form request-video-form" onSubmit={handleVideo}>
          <label className="visually-hidden" htmlFor="request-video-url">
            YouTube link
          </label>
          <input
            id="request-video-url"
            className="input text-input request-input"
            type="text"
            value={videoUrl}
            onChange={(event) => setVideoUrl(event.target.value)}
            placeholder="Paste a YouTube link"
          />
          <button
            className="btn btn-ghost request-control-button"
            type="submit"
            disabled={hasPending}
          >
            Request video
          </button>
        </form>
      </div>

      {hasPending && (
        <p className="request-pending-message">
          Request pending…
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
