'use client';

import { useState, useRef, useCallback } from 'react';
import { ArrowLeft, Upload, Play } from 'lucide-react';
import { useRoomStore } from '@/stores/room-store';
import { useAuthStore } from '@/stores/auth-store';
import { roomsApi } from '@/lib/api';
import { getSyncSocket } from '@/lib/socket';
import { uploadApi } from '@/lib/api';
import { toast } from 'sonner';

interface LocalSourceInputProps {
  onBack: () => void;
  onPlay: () => void;
}

export function LocalSourceInput({ onBack, onPlay }: LocalSourceInputProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const roomId = useRoomStore((s) => s.id);
  const accessToken = useAuthStore((s) => s.accessToken);
  const roomStore = useRoomStore();

  const handleBack = useCallback(() => {
    const video = roomStore.video;
    if (video && video.source === 'local') {
      const socket = getSyncSocket(accessToken || undefined);
      roomsApi.deleteVideo(roomId).catch(() => {});
      roomStore.setVideo(null);
      if (socket?.connected) {
        socket.emit('sync:action', { type: 'media_end', roomId, data: {} });
      }
    }
    onBack();
  }, [roomStore, roomId, accessToken, onBack]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const ext = selected.name.split('.').pop()?.toLowerCase();
    if (!['mp4', 'mkv', 'webm', 'mov'].includes(ext || '')) {
      toast.error('Unsupported file type. Use MP4, MKV, WebM, or MOV.');
      return;
    }

    if (selected.size > 5 * 1024 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 5GB.');
      return;
    }

    setFile(selected);
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Please select a file first');
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      const onProgress = (pct: number) => setProgress(pct);
      const res = await uploadApi.uploadFile(file, onProgress);
      const videoUrl = res.data.url;

      const videoRes = await roomsApi.setVideo(roomId, {
        title: file.name,
        url: videoUrl,
        thumbnail: '',
        duration: 0,
        source: 'local',
        sourceId: videoUrl,
      });
      const videoData = videoRes.data;
      roomStore.setVideo({
        id: videoData.id,
        title: videoData.title,
        url: videoUrl,
        thumbnail: videoData.thumbnail || '',
        duration: videoData.duration || 0,
        currentTime: 0,
        isPlaying: false,
        playbackRate: 1.0,
        source: 'local',
      });
      const socket = getSyncSocket(accessToken || undefined);
      if (socket?.connected) {
        socket.emit('sync:action', { type: 'video_change', roomId, data: { videoId: videoData.id } });
      }
      onPlay();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to upload file');
    } finally {
      setUploading(false);
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
          <Upload className="w-8 h-8 text-primary" />
        </div>
        <p className="text-lg font-medium text-foreground mb-1">Local File</p>
        <p className="text-sm text-muted-foreground mb-6">
          Upload a video file from your device
        </p>

        <div
          className="border-2 border-dashed border-border rounded-xl p-8 mb-4 cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          {file ? (
            <div>
              <p className="text-foreground font-medium mb-1">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {(file.size / (1024 * 1024)).toFixed(1)} MB
              </p>
            </div>
          ) : (
            <div>
              <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">
                <span className="text-primary font-medium">Click to select</span> a video file
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                MP4, MKV, WebM, MOV &bull; Up to 5GB
              </p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm,video/x-matroska,video/quicktime,video/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {uploading && (
          <div className="mb-4">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Uploading... {progress}%</p>
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="flex items-center justify-center gap-1.5 bg-primary hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground px-6 py-2.5 rounded-lg text-sm font-medium transition-colors w-full"
        >
          <Play size={16} />
          {uploading ? 'Uploading...' : file ? `Play ${file.name}` : 'Select a file first'}
        </button>
      </div>
    </div>
  );
}
