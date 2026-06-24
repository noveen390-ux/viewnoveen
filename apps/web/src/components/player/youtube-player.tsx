'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

declare global {
  interface Window { YT: any; onYouTubeIframeAPIReady?: () => void; }
}

interface YouTubePlayerProps {
  videoId: string;
  isPlaying: boolean;
  currentTime: number;
  volume: number;
  isMuted: boolean;
  playbackRate: number;
  onStateChange: (state: { isPlaying: boolean; currentTime: number }) => void;
  onReady: (player: { play: () => void; pause: () => void; seekTo: (t: number) => void; getCurrentTime: () => number; getDuration: () => number; destroy: () => void }) => void;
  onTimeUpdate: (currentTime: number) => void;
  onDurationReady: (duration: number) => void;
}

export function YouTubePlayer({
  videoId,
  isPlaying,
  currentTime,
  volume,
  isMuted,
  playbackRate,
  onStateChange,
  onReady,
  onTimeUpdate,
  onDurationReady,
}: YouTubePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const apiReadyRef = useRef(false);
  const [apiLoaded, setApiLoaded] = useState(false);
  const timeIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const isInternalAction = useRef(false);

  useEffect(() => {
    if (typeof window.YT === 'undefined' || !window.YT.Player) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = () => {
        apiReadyRef.current = true;
        setApiLoaded(true);
      };
    } else {
      apiReadyRef.current = true;
      setApiLoaded(true);
    }

    return () => {
      if (timeIntervalRef.current) clearInterval(timeIntervalRef.current);
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch {}
        playerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!apiLoaded || !containerRef.current || playerRef.current) return;

    const player = new window.YT.Player(containerRef.current, {
      videoId,
      height: '100%',
      width: '100%',
      playerVars: {
        autoplay: 0,
        controls: 0,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        enablejsapi: 1,
        fs: 0,
      },
      events: {
        onReady: () => {
          playerRef.current = player;
          try { player.setVolume(volume * 100); } catch {}
          try { if (isMuted) player.mute(); else player.unMute(); } catch {}
          try { player.setPlaybackRate(playbackRate); } catch {}

          onDurationReady(player.getDuration());

          onReady({
            play: () => { isInternalAction.current = true; player.playVideo(); setTimeout(() => { isInternalAction.current = false; }, 500); },
            pause: () => { isInternalAction.current = true; player.pauseVideo(); setTimeout(() => { isInternalAction.current = false; }, 500); },
            seekTo: (t: number) => { isInternalAction.current = true; player.seekTo(t, true); setTimeout(() => { isInternalAction.current = false; }, 500); },
            getCurrentTime: () => player.getCurrentTime(),
            getDuration: () => player.getDuration(),
            destroy: () => player.destroy(),
          });

          timeIntervalRef.current = setInterval(() => {
            try {
              const state = player.getPlayerState();
              if (state === 1) {
                onTimeUpdate(player.getCurrentTime());
              }
            } catch {}
          }, 1000);
        },
        onStateChange: (event: { data: number }) => {
          const ytStates: Record<number, string> = {
            [-1]: 'unstarted',
            0: 'ended',
            1: 'playing',
            2: 'paused',
            3: 'buffering',
            5: 'cued',
          };
          const state = ytStates[event.data] || 'unknown';

          if (state === 'playing' || state === 'paused') {
            const isNowPlaying = state === 'playing';
            const time = player.getCurrentTime();
            if (!isInternalAction.current) {
              onStateChange({ isPlaying: isNowPlaying, currentTime: time });
            }
          }
          if (state === 'ended') {
            onStateChange({ isPlaying: false, currentTime: player.getDuration() });
          }
        },
        onError: () => {},
      },
    });
  }, [apiLoaded, videoId]);

  useEffect(() => {
    if (!playerRef.current || isInternalAction.current) return;
    const player = playerRef.current;
    try {
      const currState = player.getPlayerState();
      const isYTPlaying = currState === 1;
      if (isPlaying && !isYTPlaying) {
        player.playVideo();
      } else if (!isPlaying && isYTPlaying) {
        player.pauseVideo();
      }
    } catch {}
  }, [isPlaying]);

  useEffect(() => {
    if (!playerRef.current || isInternalAction.current) return;
    try {
      const time = playerRef.current.getCurrentTime();
      if (Math.abs(time - currentTime) > 0.8 && currentTime >= 0) {
        isInternalAction.current = true;
        playerRef.current.seekTo(currentTime, true);
        setTimeout(() => { isInternalAction.current = false; }, 500);
      }
    } catch {}
  }, [currentTime]);

  useEffect(() => {
    if (!playerRef.current) return;
    try {
      playerRef.current.setVolume(volume * 100);
    } catch {}
  }, [volume]);

  useEffect(() => {
    if (!playerRef.current) return;
    try {
      if (isMuted) playerRef.current.mute();
      else playerRef.current.unMute();
    } catch {}
  }, [isMuted]);

  useEffect(() => {
    if (!playerRef.current) return;
    try {
      playerRef.current.setPlaybackRate(playbackRate);
    } catch {}
  }, [playbackRate]);

  return (
    <div className="w-full h-full absolute inset-0">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
