'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { useRoomStore } from '@/stores/room-store';
import { getSyncSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth-store';
import { formatDuration } from '@/lib/utils';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize, SkipBack, SkipForward,
} from 'lucide-react';

export function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const video = useRoomStore((s) => s.video);
  const roomId = useRoomStore((s) => s.id);
  const accessToken = useAuthStore((s) => s.accessToken);

  const emitSync = useCallback((type: string, data: any) => {
    const socket = getSyncSocket(accessToken || undefined);
    if (socket?.connected) {
      socket.emit('sync:action', { type, roomId, data });
    }
  }, [roomId, accessToken]);

  const isLocalAction = useRef(false);

  const handlePlay = () => {
    if (videoRef.current) {
      isLocalAction.current = true;
      videoRef.current.play();
      emitSync('play', { currentTime: videoRef.current.currentTime || 0 });
      setTimeout(() => { isLocalAction.current = false; }, 300);
    }
  };

  const handlePause = () => {
    if (videoRef.current) {
      isLocalAction.current = true;
      videoRef.current.pause();
      emitSync('pause', { currentTime: videoRef.current.currentTime || 0 });
      setTimeout(() => { isLocalAction.current = false; }, 300);
    }
  };

  const handleSeek = (time: number) => {
    if (videoRef.current) {
      isLocalAction.current = true;
      videoRef.current.currentTime = time;
      emitSync('seek', { currentTime: time });
      setTimeout(() => { isLocalAction.current = false; }, 300);
    }
  };

  // Apply remote sync state changes to the video element
  useEffect(() => {
    if (!videoRef.current || !video || !videoRef.current.duration) return;
    if (isLocalAction.current) return;

    const videoEl = videoRef.current;

    // Sync playing state
    if (video.isPlaying && videoEl.paused) {
      videoEl.play().catch(() => {});
    } else if (!video.isPlaying && !videoEl.paused) {
      videoEl.pause();
    }

    // Sync current time if drift exceeds threshold
    const drift = Math.abs(videoEl.currentTime - video.currentTime);
    if (drift > 1.5 && video.currentTime >= 0) {
      videoEl.currentTime = video.currentTime;
    }
  }, [video?.isPlaying, video?.currentTime]);

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
    const container = videoRef.current?.parentElement;
    if (!document.fullscreenElement) {
      await container?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    return () => clearTimeout(controlsTimeout.current);
  }, []);

  if (!video) return null;

  return (
    <div
      className="relative h-full group"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setShowControls(false)}
    >
      <video
        ref={videoRef}
        src={video.url}
        className="w-full h-full object-contain"
        onClick={() => (videoRef.current?.paused ? handlePlay() : handlePause())}
      />

      <div
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="flex items-center gap-2 mb-1">
          <input
            type="range"
            min={0}
            max={video.duration || 100}
            value={videoRef.current?.currentTime || 0}
            onChange={(e) => handleSeek(parseFloat(e.target.value))}
            className="flex-1 h-1 accent-brand-500 cursor-pointer"
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSeek(Math.max(0, (videoRef.current?.currentTime || 0) - 10))}
              className="text-white/80 hover:text-white p-1"
            >
              <SkipBack size={18} />
            </button>
            <button
              onClick={() => (videoRef.current?.paused ? handlePlay() : handlePause())}
              className="text-white hover:text-brand-400 p-1"
            >
              {videoRef.current?.paused ? <Play size={22} /> : <Pause size={22} />}
            </button>
            <button
              onClick={() => handleSeek(Math.min(video.duration || 0, (videoRef.current?.currentTime || 0) + 10))}
              className="text-white/80 hover:text-white p-1"
            >
              <SkipForward size={18} />
            </button>
            <span className="text-white/80 text-xs ml-2">
              {formatDuration(videoRef.current?.currentTime || 0)} / {formatDuration(video.duration || 0)}
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
              className="w-20 h-1 accent-brand-500"
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
