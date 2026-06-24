'use client';

import { useState, useCallback } from 'react';
import { ArrowLeft, Play, Film } from 'lucide-react';
import { useRoomStore } from '@/stores/room-store';
import { useAuthStore } from '@/stores/auth-store';
import { roomsApi } from '@/lib/api';
import { getSyncSocket } from '@/lib/socket';
import { toast } from 'sonner';

interface YoutubeSourceInputProps {
  onBack: () => void;
  onPlay: () => void;
}

function extractYoutubeId(val: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = val.trim().match(p);
    if (m) return m[1];
  }
  return null;
}

export function YoutubeSourceInput({ onBack, onPlay }: YoutubeSourceInputProps) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const roomId = useRoomStore((s) => s.id);
  const accessToken = useAuthStore((s) => s.accessToken);
  const roomStore = useRoomStore();

  const handleBack = useCallback(() => {
    const video = roomStore.video;
    if (video && video.source === 'youtube') {
      const socket = getSyncSocket(accessToken || undefined);
      roomsApi.deleteVideo(roomId).catch(() => {});
      roomStore.setVideo(null);
      if (socket?.connected) {
        socket.emit('sync:action', { type: 'media_end', roomId, data: {} });
      }
    }
    onBack();
  }, [roomStore, roomId, accessToken, onBack]);

  const handlePlay = async () => {
    if (!url.trim()) {
      toast.error('Please enter a YouTube URL or video ID');
      return;
    }

    const videoId = extractYoutubeId(url);
    if (!videoId) {
      toast.error('Invalid YouTube URL');
      return;
    }

    setLoading(true);
    try {
      const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1`;
      const res = await roomsApi.setVideo(roomId, {
        title: 'YouTube Video',
        url: embedUrl,
        thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        duration: 0,
        source: 'youtube',
        sourceId: videoId,
      });
      const videoData = res.data;
      roomStore.setVideo({
        id: videoData.id,
        title: videoData.title,
        url: embedUrl,
        thumbnail: videoData.thumbnail || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        duration: videoData.duration || 0,
        currentTime: videoData.currentTime || 0,
        isPlaying: true,
        playbackRate: 1.0,
        source: 'youtube',
      });
      const socket = getSyncSocket(accessToken || undefined);
      if (socket?.connected) {
        socket.emit('sync:action', { type: 'video_change', roomId, data: { videoId: videoData.id } });
      }
      onPlay();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to load YouTube video');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex items-center justify-center bg-background">
      <div className="text-center max-w-lg mx-auto px-6 w-full">
        <button onClick={handleBack} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft size={16} />
          <span className="text-sm">Back to sources</span>
        </button>

        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
          <Film className="w-8 h-8 text-primary" />
        </div>
        <p className="text-lg font-medium text-foreground mb-1">YouTube</p>
        <p className="text-sm text-muted-foreground mb-6">
          Paste a YouTube video URL or video ID
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=... or video ID"
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring transition-colors"
            onKeyDown={(e) => e.key === 'Enter' && handlePlay()}
          />
          <button
            onClick={handlePlay}
            disabled={loading || !url.trim()}
            className="flex items-center gap-1.5 bg-primary hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Play size={16} />
            {loading ? 'Loading...' : 'Play'}
          </button>
        </div>
      </div>
    </div>
  );
}
