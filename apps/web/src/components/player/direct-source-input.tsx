'use client';

import { useState } from 'react';
import { ArrowLeft, Play, Link } from 'lucide-react';
import { useRoomStore } from '@/stores/room-store';
import { useAuthStore } from '@/stores/auth-store';
import { roomsApi } from '@/lib/api';
import { getSyncSocket } from '@/lib/socket';
import { toast } from 'sonner';

interface DirectSourceInputProps {
  onBack: () => void;
  onPlay: () => void;
}

export function DirectSourceInput({ onBack, onPlay }: DirectSourceInputProps) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const roomId = useRoomStore((s) => s.id);
  const accessToken = useAuthStore((s) => s.accessToken);
  const roomStore = useRoomStore();

  const handleBack = () => {
    const video = roomStore.video;
    if (video && video.source === 'direct') {
      const socket = getSyncSocket(accessToken || undefined);
      roomsApi.deleteVideo(roomId).catch(() => {});
      roomStore.setVideo(null);
      if (socket?.connected) {
        socket.emit('sync:action', {
          type: 'media_end',
          roomId,
          data: {},
        });
      }
    }
    onBack();
  };

  const handlePlay = async () => {
    if (!url.trim()) {
      toast.error('Please enter a video URL');
      return;
    }

    setLoading(true);
    try {
      const res = await roomsApi.setVideo(roomId, {
        title: 'Direct Video',
        url: url.trim(),
        thumbnail: '',
        duration: 0,
        source: 'direct',
        sourceId: url.trim(),
      });
      const videoData = res.data;
      roomStore.setVideo({
        id: videoData.id,
        title: videoData.title,
        url: videoData.url,
        thumbnail: videoData.thumbnail || '',
        duration: videoData.duration || 0,
        currentTime: videoData.currentTime || 0,
        isPlaying: false,
        playbackRate: 1.0,
        source: 'direct',
      });
      const socket = getSyncSocket(accessToken || undefined);
      if (socket?.connected) {
        socket.emit('sync:action', {
          type: 'video_change',
          roomId,
          data: { videoId: videoData.id },
        });
      }
      onPlay();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to play video');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex items-center justify-center bg-background">
      <div className="text-center max-w-lg mx-auto px-6 w-full">
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft size={16} />
          <span className="text-sm">Back to sources</span>
        </button>

        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
          <Link className="w-8 h-8 text-primary" />
        </div>
        <p className="text-lg font-medium text-foreground mb-1">Direct URL</p>
        <p className="text-sm text-muted-foreground mb-6">
          Paste a direct link to a video file
        </p>

        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/video.mp4"
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

        <p className="text-xs text-muted-foreground mt-4">
          Supports MP4, WebM, MOV, and other direct video URLs
        </p>
      </div>
    </div>
  );
}
