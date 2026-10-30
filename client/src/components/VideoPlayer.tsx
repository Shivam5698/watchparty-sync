import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  ChatMessage,
  PlaybackRequest,
  Reaction,
  RoomNotice,
} from "../types";
import RequestControls from "./RequestControls";
import FloatingChat from "./FloatingChat";
import ReactionBar from "./ReactionBar";
import ReactionLayer from "./ReactionLayer";
import { useYouTubePlayer } from "../hooks/useYouTubePlayer";
import type { PlaybackAction, VideoState } from "../types";
import { extractVideoId } from "../utils/youtube";

interface RequestNoticeProps {
  notice: RoomNotice;
  className?: string;
}

function RequestNotice({ notice, className = "" }: RequestNoticeProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => setVisible(false), 3000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  if (!visible) {
    return null;
  }

  return (
    <div
      className={`video-notice-toast ${className}`.trim()}
      key={notice.id}
      role="status"
    >
      <span>{notice.text}</span>
      <button
        className="video-notice-close"
        type="button"
        aria-label="Dismiss notification"
        onClick={() => setVisible(false)}
      >
        ×
      </button>
    </div>
  );
}

interface VideoPlayerProps {
  videoState: VideoState | null;
  canControl: boolean;
  onPlay: (time: number) => void;
  onPause: (time: number) => void;
  onSeek: (time: number) => void;
  onChangeVideo: (videoId: string) => void;
  onRequest?: (action: PlaybackAction, payload: object) => Promise<void>;
  onRequestSync: () => Promise<VideoState | null>;
  hasPendingRequest?: boolean;
  messages: ChatMessage[];
  currentUserId: string;
  onSendChat: (text: string) => Promise<void>;
  notice: RoomNotice | null;
  requests: PlaybackRequest[];
  isHost: boolean;
  onReact: (emoji: string) => void;
  subscribeReactions: (handler: (reaction: Reaction) => void) => () => void;
}

export default function VideoPlayer({
  videoState,
  canControl,
  onPlay,
  onPause,
  onSeek,
  onChangeVideo,
  onRequest,
  onRequestSync,
  hasPendingRequest = false,
  messages,
  currentUserId,
  onSendChat,
  notice,
  requests,
  isHost,
  onReact,
  subscribeReactions,
}: VideoPlayerProps) {
  const playerWrapRef = useRef<HTMLDivElement>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [error, setError] = useState("");
  const [fullscreenError, setFullscreenError] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasSubmittedVideo, setHasSubmittedVideo] = useState(false);
  const [requestNotice, setRequestNotice] = useState<RoomNotice | null>(null);
  const [isResyncing, setIsResyncing] = useState(false);
  const [resyncStatus, setResyncStatus] = useState<"idle" | "synced" | "error">("idle");
  const requestNoticeId = useRef(0);
  const previousRequestIds = useRef(
    new Set(requests.map((request) => request.id)),
  );
  const { isReady, applyState, getCurrentTime } = useYouTubePlayer({
    containerRef: playerWrapRef,
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

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === playerWrapRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (!isReady || canControl) {
      return;
    }

    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void onRequestSync().then((state) => {
        if (state) {
          applyState(state);
        }
      });
    }, 20000);

    return () => {
      window.clearInterval(timer);
    };
  }, [applyState, canControl, isReady, onRequestSync]);

  useEffect(() => {
    const newRequest = requests.find(
      (request) => !previousRequestIds.current.has(request.id),
    );
    previousRequestIds.current = new Set(
      requests.map((request) => request.id),
    );

    if (!isHost || !newRequest) {
      return;
    }

    const timeout = window.setTimeout(() => {
      requestNoticeId.current += 1;
      setRequestNotice({
        id: requestNoticeId.current,
        text: `New request from ${newRequest.username}: ${newRequest.action}`,
      });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [isHost, requests]);

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

  const toggleFullscreen = async () => {
    const playerWrap = playerWrapRef.current;
    if (!playerWrap) {
      return;
    }

    setFullscreenError("");
    try {
      if (document.fullscreenElement === playerWrap) {
        await document.exitFullscreen();
      } else {
        await playerWrap.requestFullscreen();
      }
    } catch (fullscreenActionError) {
      setFullscreenError(
        fullscreenActionError instanceof Error
          ? fullscreenActionError.message
          : "Unable to change fullscreen mode",
      );
    }
  };

  const handleRequestSync = async () => {
    if (isResyncing) {
      return;
    }

    setIsResyncing(true);
    setResyncStatus("idle");

    const timeoutMs = 5000;
    const timeoutPromise = new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), timeoutMs);
    });

    try {
      const state = await Promise.race([onRequestSync(), timeoutPromise]);
      if (state) {
        applyState(state);
        setResyncStatus("synced");
      } else {
        setResyncStatus("error");
      }
    } catch {
      setResyncStatus("error");
    } finally {
      window.setTimeout(() => {
        setResyncStatus("idle");
        setIsResyncing(false);
      }, 2000);
    }
  };

  return (
    <section className="video-player">
      <div className="video-player-frame" ref={playerWrapRef}>
        {(!videoState || videoState.videoId === null) &&
          !hasSubmittedVideo && (
            <div className="video-player-hint">
              <svg
                className="video-empty-icon"
                viewBox="0 0 48 48"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="5"
                  y="10"
                  width="38"
                  height="28"
                  rx="6"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="m21 18 10 6-10 6V18Z"
                  fill="currentColor"
                />
              </svg>
              <strong>
                {canControl
                  ? "Paste a YouTube link to start"
                  : "Waiting for the host to start a video"}
              </strong>
            </div>
          )}
        {!canControl && <div className="video-player-control-overlay" />}
        {isHost && requestNotice && (
          <RequestNotice
            key={requestNotice.id}
            notice={requestNotice}
            className="request-update-toast"
          />
        )}
        {isFullscreen && (
          <FloatingChat
            messages={messages}
            currentUserId={currentUserId}
            onSendChat={onSendChat}
          />
        )}
        <ReactionLayer subscribe={subscribeReactions} />
        <div
          className="video-fullscreen-dock"
          style={{
            position: "absolute",
            top: "50%",
            right: 12,
            bottom: "auto",
            left: "auto",
            width: "auto",
            height: "auto",
            transform: "translateY(-50%)",
            zIndex: 5,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            pointerEvents: "auto",
          }}
        >
          <button
            className="video-fullscreen-resync"
            type="button"
            aria-label="Resync"
            title="Resync"
            onClick={() => void handleRequestSync()}
            disabled={isResyncing}
          >
            ↻
          </button>
          {isFullscreen && <ReactionBar onReact={onReact} vertical />}
        </div>
        <button
          className="btn btn-ghost video-fullscreen-button"
          type="button"
          onClick={() => void toggleFullscreen()}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? (
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="M7 3v4H3m14 0h-4V3m0 14v-4h4M3 13h4v4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="M7 3H3v4m10-4h4v4m0 6v4h-4m-6 0H3v-4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
        {notice && <RequestNotice key={notice.id} notice={notice} />}
        {fullscreenError && (
          <div
            className="video-notice-toast video-notice-error"
            role="alert"
          >
            <span>{fullscreenError}</span>
            <button
              className="video-notice-close"
              type="button"
              aria-label="Dismiss notification"
              onClick={() => {
                setFullscreenError("");
              }}
            >
              ×
            </button>
          </div>
        )}
      </div>
      {!canControl && (
        <p className="video-player-caption">
          <svg
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <rect
              x="3"
              y="7"
              width="10"
              height="7"
              rx="1.5"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M5.5 7V4.5a2.5 2.5 0 0 1 5 0V7"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
          <span>Only the host and moderators can control playback</span>
        </p>
      )}
      {canControl && (
        <form
          className="video-url-form video-controls-card card"
          onSubmit={handleSubmit}
        >
          <label className="visually-hidden" htmlFor="video-url">
            YouTube link
          </label>
          <div className="video-url-controls">
            <input
              id="video-url"
              className="input text-input video-url-input"
              type="text"
              value={videoUrl}
              onChange={(event) => setVideoUrl(event.target.value)}
              placeholder="Paste a YouTube link"
            />
            <button
              className="btn btn-primary action-button primary-button load-video-button"
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
      <div className="video-controls-actions">
        <button
          className="btn btn-ghost video-resync-button"
          type="button"
          onClick={() => void handleRequestSync()}
          disabled={isResyncing}
        >
          {isResyncing
            ? "Syncing..."
            : resyncStatus === "synced"
              ? "Synced ✓"
              : resyncStatus === "error"
                ? "Couldn't sync"
                : "↻ Resync"}
        </button>
      </div>
      {!isFullscreen && (
        <div className="video-reaction-bar-row">
          <ReactionBar onReact={onReact} />
        </div>
      )}
    </section>
  );
}
