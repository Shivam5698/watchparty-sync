import { useEffect, useRef, useState, type FormEvent } from "react";
import RequestControls from "./RequestControls";
import { useYouTubePlayer } from "../hooks/useYouTubePlayer";
import type { PlaybackAction, VideoState } from "../types";
import { extractVideoId } from "../utils/youtube";

interface VideoPlayerProps {
  videoState: VideoState | null;
  canControl: boolean;
  onPlay: (time: number) => void;
  onPause: (time: number) => void;
  onSeek: (time: number) => void;
  onChangeVideo: (videoId: string) => void;
  onRequest?: (action: PlaybackAction, payload: object) => Promise<void>;
  hasPendingRequest?: boolean;
}

export default function VideoPlayer({
  videoState,
  canControl,
  onPlay,
  onPause,
  onSeek,
  onChangeVideo,
  onRequest,
  hasPendingRequest = false,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [error, setError] = useState("");
  const [hasSubmittedVideo, setHasSubmittedVideo] = useState(false);
  const { isReady, applyState, getCurrentTime } = useYouTubePlayer({
    containerRef,
    canControl,
    onPlay,
    onPause,
    onSeek,
  });

  useEffect(() => {
    if (isReady && videoState !== null) {
      applyState(videoState);
    }
  }, [applyState, isReady, videoState]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      setError("Invalid YouTube link");
      return;
    }

    setError("");
    onChangeVideo(videoId);
    setHasSubmittedVideo(true);
    applyState({
      videoId,
      playState: "playing",
      currentTime: 0,
      updatedAt: Date.now(),
    });
  };

  return (
    <section className="video-player">
      {canControl && (
        <form className="video-url-form" onSubmit={handleSubmit}>
          <label className="video-url-label" htmlFor="video-url">
            YouTube link
          </label>
          <div className="video-url-controls">
            <input
              id="video-url"
              className="text-input video-url-input"
              type="text"
              value={videoUrl}
              onChange={(event) => setVideoUrl(event.target.value)}
              placeholder="Paste a YouTube link"
            />
            <button
              className="action-button primary-button load-video-button"
              type="submit"
            >
              Load video
            </button>
          </div>
          {error && (
            <p className="error-message video-url-error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}

      <div className="video-player-frame">
        <div className="youtube-player-container" ref={containerRef} />
        {(!videoState || videoState.videoId === null) &&
          !hasSubmittedVideo && (
            <p className="video-player-hint">
              Paste a YouTube link to start watching together
            </p>
          )}
        {!canControl && <div className="video-player-control-overlay" />}
      </div>
      {!canControl && (
        <p className="video-player-caption">
          Only the host and moderators can control playback
        </p>
      )}
      {!canControl && (
        <RequestControls
          onRequest={
            onRequest ??
            (() =>
              Promise.reject(new Error("Playback requests are unavailable")))
          }
          getCurrentTime={getCurrentTime}
          hasPending={hasPendingRequest}
        />
      )}
    </section>
  );
}
