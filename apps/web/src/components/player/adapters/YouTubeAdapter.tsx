import { useEffect, useRef } from "react";
import { extractYouTubeId, type AdapterProps, type PlayerAdapterHandle } from "./types";

declare global { interface Window { YT: any; onYouTubeIframeAPIReady?: () => void; } }

let ytApiPromise: Promise<void> | null = null;
function loadYTApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return ytApiPromise;
}

export function YouTubeAdapter({ url, onReady, onError, onPlay, onPause, onSeekedByUser, isHost, apiRef }: AdapterProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const videoId = extractYouTubeId(url);

  useEffect(() => {
    if (!videoId) { onError("Invalid YouTube URL"); return; }
    let cancelled = false;
    loadYTApi().then(() => {
      if (cancelled || !containerRef.current) return;
      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId,
        playerVars: { controls: isHost ? 1 : 0, modestbranding: 1, rel: 0, playsinline: 1, disablekb: isHost ? 0 : 1 },
        events: {
          onReady: () => {
            const handle: PlayerAdapterHandle = {
              play: async () => playerRef.current?.playVideo(),
              pause: async () => playerRef.current?.pauseVideo(),
              seek: (s) => playerRef.current?.seekTo(s, true),
              getCurrentTime: () => playerRef.current?.getCurrentTime() ?? 0,
              setMuted: (m) => m ? playerRef.current?.mute() : playerRef.current?.unMute(),
            };
            apiRef.current = handle;
            onReady();
          },
          onStateChange: (e: any) => {
            // 1 playing, 2 paused
            if (e.data === 1) onPlay();
            else if (e.data === 2) onPause();
          },
          onError: () => onError("YouTube playback error"),
        },
      });
    });
    return () => {
      cancelled = true;
      try { playerRef.current?.destroy(); } catch {}
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // No native seek event from YT IFrame API; host-side seek captured by HostControls.
  void onSeekedByUser;

  return (
    <div className="absolute inset-0 bg-black">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
