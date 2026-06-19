'use client';

import { useState, useCallback } from 'react';
import { ArrowLeft, Play, Upload } from 'lucide-react';
import { useRoomStore } from '@/stores/room-store';
import { useAuthStore } from '@/stores/auth-store';
import { roomsApi } from '@/lib/api';
import { getSyncSocket } from '@/lib/socket';
import { toast } from 'sonner';

interface DriveSourceInputProps {
  onBack: () => void;
  onPlay: () => void;
}

function extractDriveId(val: string): string | null {
  const m = val.trim().match(/\/file\/d\/([a-zA-Z0-9_-]+)\//);
  return m ? m[1] : null;
}

export function DriveSourceInput({ onBack, onPlay }: DriveSourceInputProps) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const roomId = useRoomStore((s) => s.id);
  const accessToken = useAuthStore((s) => s.accessToken);
  const roomStore = useRoomStore();

  const handleBack = useCallback(() => {
    const video = roomStore.video;
    if (video && video.source === 'google_drive') {
      const socket = getSyncSocket(accessToken || undefined);
      roomsApi.deleteVideo(roomId).catch(() => {});
      roomStore.setVideo(null);
      if (socket?.connected) {
        socket.emit('sync:action', { type: 'direct_media_end', roomId, data: {} });
      }
    }
    onBack();
  }, [roomStore, roomId, accessToken, onBack]);

  const handlePlay = async () => {
    if (!url.trim()) {
      toast.error('Please enter a Google Drive share link');
      return;
    }

    const fileId = extractDriveId(url);
    if (!fileId) {
      toast.error('Invalid Google Drive link. Use the share link format: https://drive.google.com/file/d/.../view');
      return;
    }

    setLoading(true);
    try {
      const directUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
      const res = await roomsApi.setVideo(roomId, {
        title: 'Google Drive Video',
        url: directUrl,
        thumbnail: '',
        duration: 0,
        source: 'google_drive',
        sourceId: fileId,
      });
      const videoData = res.data;
      roomStore.setVideo({
        id: videoData.id,
        title: videoData.title,
        url: directUrl,
        thumbnail: videoData.thumbnail || '',
        duration: videoData.duration || 0,
        currentTime: videoData.currentTime || 0,
        isPlaying: false,
        playbackRate: 1.0,
        source: 'google_drive',
      });
      const socket = getSyncSocket(accessToken || undefined);
      if (socket?.connected) {
        socket.emit('sync:action', { type: 'video_change', roomId, data: { videoId: videoData.id } });
      }
      onPlay();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to load Drive video');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex items-center justify-center bg-surface-950">
      <div className="text-center max-w-lg mx-auto px-6 w-full">
        <button onClick={handleBack} className="flex items-center gap-1.5 text-surface-400 hover:text-white mb-6 transition-colors">
          <ArrowLeft size={16} />
          <span className="text-sm">Back to sources</span>
        </button>

        <div className="w-16 h-16 rounded-2xl bg-surface-800 flex items-center justify-center mx-auto mb-4">
          <Upload className="w-8 h-8 text-brand-400" />
        </div>
        <p className="text-lg font-medium text-white mb-1">Google Drive</p>
        <p className="text-sm text-surface-400 mb-6">
          Paste a Google Drive video share link
        </p>

        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://drive.google.com/file/d/.../view"
            className="flex-1 bg-surface-800 border border-surface-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder-surface-500 focus:outline-none focus:border-brand-500 transition-colors"
            onKeyDown={(e) => e.key === 'Enter' && handlePlay()}
          />
          <button
            onClick={handlePlay}
            disabled={loading || !url.trim()}
            className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Play size={16} />
            {loading ? 'Loading...' : 'Play'}
          </button>
        </div>

        <p className="text-xs text-surface-600 mt-4">
          Make sure the Drive file is publicly accessible or shared with link
        </p>
      </div>
    </div>
  );
}
