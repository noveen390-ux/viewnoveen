export interface PlayerAdapterHandle {
  play: () => Promise<void>;
  pause: () => Promise<void>;
  seek: (sec: number) => void;
  getCurrentTime: () => number;
  setMuted: (m: boolean) => void;
}

export type SourceType = "direct" | "youtube";

export interface AdapterProps {
  url: string;
  onReady: () => void;
  onError: (msg: string) => void;
  onPlay: () => void;
  onPause: () => void;
  onSeekedByUser: (sec: number) => void;
  isHost: boolean;
  /** Imperative handle */
  apiRef: React.MutableRefObject<PlayerAdapterHandle | null>;
}

export function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const parts = u.pathname.split("/");
      const idx = parts.findIndex((p) => p === "embed" || p === "shorts");
      if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
    }
  } catch {}
  return null;
}
