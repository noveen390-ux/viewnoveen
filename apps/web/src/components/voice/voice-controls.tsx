'use client';

import { useState, useCallback } from 'react';
import { useRoomStore } from '@/stores/room-store';
import { getWebRTCSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';
import {
  Mic, MicOff, Headphones, HeadphoneOff, Video, VideoOff,
  MonitorUp, Phone, Monitor,
} from 'lucide-react';

export function VoiceControls() {
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [inCall, setInCall] = useState(false);
  const roomId = useRoomStore((s) => s.id);
  const accessToken = useAuthStore((s) => s.accessToken);

  const getSocket = () => getWebRTCSocket(accessToken || undefined);

  const toggleMute = useCallback(() => {
    const socket = getSocket();
    setIsMuted((prev) => {
      socket?.emit('call:mute', { roomId, isMuted: !prev });
      return !prev;
    });
  }, [roomId, accessToken]);

  const toggleDeafen = useCallback(() => {
    setIsDeafened((prev) => !prev);
  }, []);

  const toggleVideo = useCallback(() => {
    const socket = getSocket();
    setIsVideoEnabled((prev) => !prev);
  }, []);

  const toggleScreenShare = useCallback(async () => {
    try {
      if (!isScreenSharing) {
        await navigator.mediaDevices.getDisplayMedia({ video: true });
        setIsScreenSharing(true);
      } else {
        setIsScreenSharing(false);
      }
    } catch {
      console.error('Screen share failed');
    }
  }, [isScreenSharing]);

  const toggleCall = useCallback(() => {
    const socket = getSocket();
    setInCall((prev) => !prev);
  }, [roomId, accessToken]);

  const buttons = [
    { icon: isMuted ? MicOff : Mic, label: isMuted ? 'Unmute' : 'Mute', active: !isMuted, danger: isMuted, onClick: toggleMute },
    { icon: isDeafened ? HeadphoneOff : Headphones, label: isDeafened ? 'Undeafen' : 'Deafen', active: !isDeafened, danger: isDeafened, onClick: toggleDeafen },
    { icon: isVideoEnabled ? Video : VideoOff, label: isVideoEnabled ? 'Video Off' : 'Video On', active: isVideoEnabled, onClick: toggleVideo },
    { icon: MonitorUp, label: isScreenSharing ? 'Stop Share' : 'Share Screen', active: isScreenSharing, onClick: toggleScreenShare },
  ];

  return (
    <div className="h-full flex flex-col p-4">
      <div className="text-xs text-surface-400 uppercase tracking-wider mb-4">
        Voice Channel
      </div>

      <div className="flex-1 flex items-center justify-center">
        {inCall ? (
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-green-600/20 border-2 border-green-500 flex items-center justify-center mx-auto mb-3 animate-pulse">
              <Phone className="w-8 h-8 text-green-400" />
            </div>
            <p className="text-white font-medium">In Voice Channel</p>
            <p className="text-xs text-surface-400 mt-1">Connected</p>
          </div>
        ) : (
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-surface-800 flex items-center justify-center mx-auto mb-3">
              <Headphones className="w-8 h-8 text-surface-500" />
            </div>
            <p className="text-white font-medium">No voice channel</p>
            <p className="text-xs text-surface-400 mt-1">Join a voice channel to start talking</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 mt-4">
        {buttons.map((btn) => (
          <button
            key={btn.label}
            onClick={btn.onClick}
            className={cn(
              'flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
              btn.danger
                ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
                : btn.active
                  ? 'bg-brand-600/20 text-brand-400 hover:bg-brand-600/30'
                  : 'bg-surface-800 text-surface-400 hover:bg-surface-700',
            )}
          >
            <btn.icon size={16} />
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}
