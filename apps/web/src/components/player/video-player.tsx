'use client';

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useRoomStore } from '@/stores/room-store';
import { getSyncSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth-store';
import { formatDuration } from '@/lib/utils';
import { YouTubePlayer } from '@/components/player/youtube-player';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize, SkipBack, SkipForward,
} from 'lucide-react';

type MediaController = {
  play: () => void;
  pause: () => void;
  seekTo: (t: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
};

export function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mediaCtrlRef = useRef<MediaController | null>(null);
  const video = useRoomStore((s) => s.video);
  const roomId = useRoomStore((s) => s.id);
  const hostId = useRoomStore((s) => s.hostId);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const isHost = useMemo(() => user?.id === hostId, [user?.id, hostId]);
  const isYouTube = video?.source === 'youtube';

  const emitSync = useCallback((type: string, data: any) => {
    const socket = getSyncSocket(accessToken || undefined);
    if (socket?.connected) {
      socket.emit('sync:action', { type, roomId, data });
    }
  }, [roomId, accessToken]);

  const getCtrl = useCallback((): MediaController | null => {
    if (isYouTube) return mediaCtrlRef.current;
    if (!videoRef.current) return null;
    return {
      play: () => videoRef.current!.play(),
      pause: () => videoRef.current!.pause(),
      seekTo: (t) => { videoRef.current!.currentTime = t; },
      getCurrentTime: () => videoRef.current!.currentTime,
      getDuration: () => videoRef.current!.duration,
    };
  }, [isYouTube]);

  const handleYTReady = useCallback((ctrl: MediaController) => {
    mediaCtrlRef.current = ctrl;
  }, []);

  const handleYTStateChange = useCallback((state: { isPlaying: boolean; currentTime: number }) => {
    setIsPlaying(state.isPlaying);
    setCurrentTime(state.currentTime);
  }, []);

  const handleYTTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleYTDuration = useCallback((dur: number) => {
    setDuration(dur);
  }, []);

  const handlePlay = () => {
    const ctrl = getCtrl();
    if (!ctrl) return;
    ctrl.play();
    setIsPlaying(true);
    emitSync('play', { currentTime: ctrl.getCurrentTime() });
  };

  const handlePause = () => {
    const ctrl = getCtrl();
    if (!ctrl) return;
    ctrl.pause();
    setIsPlaying(false);
    emitSync('pause', { currentTime: ctrl.getCurrentTime() });
  };

  const handleSeek = (time: number) => {
    const ctrl = getCtrl();
    if (!ctrl) return;
    ctrl.seekTo(time);
    setCurrentTime(time);
    emitSync('seek', { currentTime: time });
  };

  useEffect(() => {
    if (isYouTube || !videoRef.current) return;
    const v = videoRef.current;
    const onPlay = () => { setIsPlaying(true); setCurrentTime(v.currentTime); };
    const onPause = () => { setIsPlaying(false); };
    const onTime = () => { setCurrentTime(v.currentTime); };
    const onDur = () => { setDuration(v.duration); };
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('durationchange', onDur);
    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('durationchange', onDur);
    };
  }, [isYouTube]);

  const lastSyncTime = useRef(0);

  useEffect(() => {
    if (!video) return;
    const ctrl = getCtrl();
    if (!ctrl) return;

    if (isYouTube) {
      const ytPlaying = isPlaying;
      if (video.isPlaying && !ytPlaying) {
        ctrl.play();
      } else if (!video.isPlaying && ytPlaying) {
        ctrl.pause();
      }
      const drift = Math.abs(ctrl.getCurrentTime() - video.currentTime);
      if (drift > 0.8 && video.currentTime >= 0) {
        ctrl.seekTo(video.currentTime);
      }
    } else {
      const v = videoRef.current;
      if (!v) return;

      if (video.isPlaying && v.paused) {
        v.play().catch(() => {});
      } else if (!video.isPlaying && !v.paused) {
        v.pause();
      }

      const drift = Math.abs(v.currentTime - video.currentTime);
      if (drift > 0.8 && video.currentTime >= 0) {
        v.currentTime = video.currentTime;
      }
    }
  }, [video?.isPlaying, video?.currentTime, isYouTube]);

  useEffect(() => {
    if (!video?.isPlaying) return;
    const interval = setInterval(() => {
      const ctrl = getCtrl();
      if (!ctrl || !ctrl.getDuration()) return;
      const time = ctrl.getCurrentTime();
      if (Math.abs(time - lastSyncTime.current) > 0.5) {
        lastSyncTime.current = time;
        emitSync('sync:tick', { currentTime: time });
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [video?.isPlaying, video?.id, isYouTube]);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (videoRef.current) videoRef.current.volume = v;
    setIsMuted(v === 0);
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!document.fullscreenElement) {
      await el?.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    return () => clearTimeout(controlsTimeout.current);
  }, []);

  if (!video) return null;

  const ctrl = getCtrl();
  const displayTime = currentTime || ctrl?.getCurrentTime() || 0;
  const ctrlDuration = ctrl?.getDuration() || 0;
  const displayDuration = ctrlDuration || video.duration || 0;
  const isPaused = isYouTube ? !isPlaying : (videoRef.current?.paused ?? true);

  return (
    <div
      ref={containerRef}
      className="relative h-full group bg-black"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setShowControls(false)}
    >
      {isYouTube ? (
        <YouTubePlayer
          videoId={video.url.split('/').pop()?.split('?')[0] || ''}
          isPlaying={video.isPlaying}
          currentTime={video.currentTime}
          volume={volume}
          isMuted={isMuted}
          playbackRate={1}
          onStateChange={handleYTStateChange}
          onReady={handleYTReady}
          onTimeUpdate={handleYTTimeUpdate}
          onDurationReady={handleYTDuration}
        />
      ) : (
        <video
          ref={videoRef}
          src={video.url}
          className="w-full h-full object-contain"
          onClick={() => (isPaused ? handlePlay() : handlePause())}
          playsInline
        />
      )}

      <div
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="flex items-center gap-2 mb-1">
          <input
            type="range"
            min={0}
            max={displayDuration || 100}
            value={displayTime}
            onChange={(e) => isHost && handleSeek(parseFloat(e.target.value))}
            disabled={!isHost}
            className={`flex-1 h-1 accent-primary ${isHost ? 'cursor-pointer' : 'cursor-default opacity-50'}`}
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isHost && (
              <button
                onClick={() => handleSeek(Math.max(0, displayTime - 10))}
                className="text-white/80 hover:text-white p-1"
              >
                <SkipBack size={18} />
              </button>
            )}
            {isHost && (
              <button
          onClick={() => isHost && (isPaused ? handlePlay() : handlePause())}
                className="text-white hover:text-primary p-1"
              >
                {isPaused ? <Play size={22} /> : <Pause size={22} />}
              </button>
            )}
            {isHost && (
              <button
                onClick={() => handleSeek(Math.min(displayDuration || 0, displayTime + 10))}
                className="text-white/80 hover:text-white p-1"
              >
                <SkipForward size={18} />
              </button>
            )}
            <span className="text-white/80 text-xs ml-2">
              {formatDuration(displayTime)} / {formatDuration(displayDuration || 0)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleMute} className="text-white/80 hover:text-white p-1">
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={handleVolumeChange}
              className="w-20 h-1 accent-primary"
            />
            <button onClick={toggleFullscreen} className="text-white/80 hover:text-white p-1">
              {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
