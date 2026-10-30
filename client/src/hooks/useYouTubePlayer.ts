import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { VideoState } from "../types";

interface YouTubePlayer {
  destroy: () => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
  loadVideoById: (options: { videoId: string; startSeconds: number }) => void;
  cueVideoById: (options: { videoId: string; startSeconds: number }) => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
}

interface YouTubePlayerEvent {
  data: number;
}

interface YouTubePlayerApi {
  PlayerState: {
    PLAYING: number;
    PAUSED: number;
  };
  Player: new (
    element: HTMLDivElement,
    options: {
      width: string;
      height: string;
      playerVars: {
        controls: number;
        fs: number;
        rel: number;
        modestbranding: number;
        playsinline: number;
      };
      events: {
        onReady: () => void;
        onStateChange: (event: YouTubePlayerEvent) => void;
      };
    },
  ) => YouTubePlayer;
}

declare global {
  interface Window {
    YT?: YouTubePlayerApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YouTubePlayerApi> | null = null;

function loadYouTubeApi(): Promise<YouTubePlayerApi> {
  if (window.YT) {
    return Promise.resolve(window.YT);
  }

  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise((resolve, reject) => {
      let script = document.querySelector<HTMLScriptElement>(
        'script[src="https://www.youtube.com/iframe_api"]',
      );

      window.onYouTubeIframeAPIReady = () => {
        if (window.YT) {
          resolve(window.YT);
        } else {
          reject(new Error("YouTube IFrame API loaded without exposing YT."));
        }
      };

      if (!script) {
        script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.async = true;
        document.head.appendChild(script);
      }

      script.onerror = () => {
        reject(new Error("Failed to load the YouTube IFrame API."));
      };
    });
  }

  return youtubeApiPromise;
}

interface UseYouTubePlayerOptions {
  containerRef: RefObject<HTMLDivElement>;
  canControl: boolean;
  onPlay: (currentTime: number) => void;
  onPause: (currentTime: number) => void;
  onSeek: (time: number) => void;
}

export function useYouTubePlayer({
  containerRef,
  canControl,
  onPlay,
  onPause,
  onSeek,
}: UseYouTubePlayerOptions): {
  isReady: boolean;
  applyState: (state: VideoState) => void;
  getCurrentTime: () => number;
} {
  const [isReady, setIsReady] = useState(false);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const isReadyRef = useRef(false);
  const canControlRef = useRef(canControl);
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);
  const onSeekRef = useRef(onSeek);
  const suppressRef = useRef(false);
  const suppressTimerRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const loadedVideoIdRef = useRef<string | null>(null);

  const getCurrentTime = useCallback(() => {
    const player = playerRef.current;
    return player && isReadyRef.current ? player.getCurrentTime() : 0;
  }, []);

  useEffect(() => {
    canControlRef.current = canControl;
    onPlayRef.current = onPlay;
    onPauseRef.current = onPause;
    onSeekRef.current = onSeek;
  }, [canControl, onPlay, onPause, onSeek]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let disposed = false;
    const childDiv = document.createElement("div");
    container.appendChild(childDiv);

    void loadYouTubeApi()
      .then((youtubeApi) => {
        if (disposed) {
          return;
        }

        const player = new youtubeApi.Player(childDiv, {
          width: "100%",
          height: "100%",
          playerVars: {
            controls: 1,
            fs: 0,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
          },
          events: {
            onReady: () => {
              if (disposed) {
                return;
              }

              playerRef.current = player;
              isReadyRef.current = true;
              setIsReady(true);

              let lastTime = player.getCurrentTime();
              let lastTick = Date.now();

              intervalRef.current = window.setInterval(() => {
                if (disposed) {
                  return;
                }

                const now = Date.now();
                const currentTime = player.getCurrentTime();
                const isPlaying =
                  player.getPlayerState() === youtubeApi.PlayerState.PLAYING;
                const expectedTime =
                  lastTime + (isPlaying ? (now - lastTick) / 1000 : 0);

                // Polling distinguishes user seeks from normal playback progression.
                try {
                  if (
                    canControlRef.current &&
                    !suppressRef.current &&
                    Math.abs(currentTime - expectedTime) > 1.5
                  ) {
                    onSeekRef.current(currentTime);
                  }
                } finally {
                  lastTime = currentTime;
                  lastTick = now;
                }
              }, 500);
            },
            onStateChange: (event) => {
              if (
                disposed ||
                suppressRef.current ||
                !canControlRef.current
              ) {
                return;
              }

              if (event.data === youtubeApi.PlayerState.PLAYING) {
                onPlayRef.current(player.getCurrentTime());
              } else if (event.data === youtubeApi.PlayerState.PAUSED) {
                onPauseRef.current(player.getCurrentTime());
              }
            },
          },
        });

        playerRef.current = player;
      })
      .catch((error: unknown) => {
        if (!disposed) {
          console.error("Unable to initialize the YouTube player.", error);
        }
      });

    return () => {
      disposed = true;
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (suppressTimerRef.current !== null) {
        window.clearTimeout(suppressTimerRef.current);
        suppressTimerRef.current = null;
      }

      const player = playerRef.current;
      playerRef.current = null;
      if (player) {
        player.destroy();
      }

      if (childDiv.parentNode === container) {
        container.removeChild(childDiv);
      }

      loadedVideoIdRef.current = null;
      suppressRef.current = false;
      isReadyRef.current = false;
      setIsReady(false);
    };
  }, [containerRef]);

  const applyState = useCallback((state: VideoState) => {
    if (state.videoId === null) {
      return;
    }

    // Ignore player events caused by applying this remote state to prevent echo loops.
    suppressRef.current = true;
    if (suppressTimerRef.current !== null) {
      window.clearTimeout(suppressTimerRef.current);
    }
    suppressTimerRef.current = window.setTimeout(() => {
      suppressRef.current = false;
      suppressTimerRef.current = null;
    }, 1200);

    const player = playerRef.current;
    if (!player || !isReadyRef.current) {
      return;
    }

    if (loadedVideoIdRef.current !== state.videoId) {
      loadedVideoIdRef.current = state.videoId;
      const videoOptions = {
        videoId: state.videoId,
        startSeconds: state.currentTime,
      };
      if (state.playState === "playing") {
        player.loadVideoById(videoOptions);
      } else {
        player.cueVideoById(videoOptions);
      }
      return;
    }

    if (Math.abs(player.getCurrentTime() - state.currentTime) > 1) {
      player.seekTo(state.currentTime, true);
    }
    if (state.playState === "playing") {
      player.playVideo();
    } else {
      player.pauseVideo();
    }
  }, []);

  return { isReady, applyState, getCurrentTime };
}
