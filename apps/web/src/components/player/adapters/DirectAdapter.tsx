import { useEffect, useRef } from "react";
import type { AdapterProps, PlayerAdapterHandle } from "./types";

export function DirectAdapter({ url, onReady, onError, onPlay, onPause, onSeekedByUser, isHost, apiRef }: AdapterProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const handle: PlayerAdapterHandle = {
      play: () => v.play(),
      pause: async () => v.pause(),
      seek: (s) => { v.currentTime = s; },
      getCurrentTime: () => v.currentTime,
      setMuted: (m) => { v.muted = m; },
    };
    apiRef.current = handle;
    return () => { apiRef.current = null; };
  }, [apiRef]);

  return (
    <video
      ref={videoRef}
      src={url}
      controls={isHost}
      playsInline
      className="absolute inset-0 h-full w-full bg-black"
      onLoadedData={onReady}
      onError={() => onError("Failed to load video")}
      onPlay={() => onPlay()}
      onPause={() => onPause()}
      onSeeked={(e) => isHost && onSeekedByUser((e.target as HTMLVideoElement).currentTime)}
    />
  );
}
