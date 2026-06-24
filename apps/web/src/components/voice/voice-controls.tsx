'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRoomStore } from '@/stores/room-store';
import { getWebRTCSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';
import {
  Mic, MicOff, Headphones, VolumeX, Video, VideoOff,
  MonitorUp, Phone, Monitor,
} from 'lucide-react';
import { toast } from 'sonner';

export function VoiceControls() {
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<MediaStream[]>([]);
  const roomId = useRoomStore((s) => s.id);
  const accessToken = useAuthStore((s) => s.accessToken);
  const localStreamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<any>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());

  const getSocket = useCallback(() => {
    if (!socketRef.current && accessToken) {
      const socket = getWebRTCSocket(accessToken);
      socket.connect();

      socket.on('connect', () => {
        socket.emit('call:join', { roomId });
      });

      socket.on('call:offer', async ({ offer, from }: { offer: RTCSessionDescriptionInit; from: string }) => {
        if (!localStreamRef.current) return;
        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        peerConnectionsRef.current.set(from, pc);

        localStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current!));

        pc.ontrack = (event) => {
          setRemoteStreams((prev) => [...prev.filter((s) => s.id !== event.streams[0].id), event.streams[0]]);
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit('call:ice-candidate', { candidate: event.candidate, to: from });
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('call:answer', { answer, to: from });
      });

      socket.on('call:answer', async ({ answer, from }: { answer: RTCSessionDescriptionInit; from: string }) => {
        const pc = peerConnectionsRef.current.get(from);
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
      });

      socket.on('call:ice-candidate', async ({ candidate, from }: { candidate: RTCIceCandidateInit; from: string }) => {
        const pc = peerConnectionsRef.current.get(from);
        if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
      });

      socket.on('call:user-left', ({ userId }: { userId: string }) => {
        const pc = peerConnectionsRef.current.get(userId);
        if (pc) { pc.close(); peerConnectionsRef.current.delete(userId); }
        setRemoteStreams((prev) => prev.filter((s) => s.id !== userId));
      });

      socket.on('disconnect', () => {
        setInCall(false);
      });

      socketRef.current = socket;
    }
    return socketRef.current;
  }, [roomId, accessToken]);

  const startLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideoEnabled,
      });
      localStreamRef.current = stream;
      return stream;
    } catch {
      toast.error('Microphone access denied');
      return null;
    }
  };

  const stopLocalStream = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
  };

  const cleanupPeerConnections = () => {
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    setRemoteStreams([]);
  };

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = isMuted;
      });
    }
    setIsMuted((prev) => !prev);
  }, [isMuted]);

  const toggleDeafen = useCallback(() => {
    setIsDeafened((prev) => !prev);
  }, []);

  const toggleVideo = useCallback(async () => {
    setIsVideoEnabled((prev) => !prev);
    if (localStreamRef.current && inCall) {
      const hasVideo = localStreamRef.current.getVideoTracks().length > 0;
      if (hasVideo) {
        localStreamRef.current.getVideoTracks().forEach((t) => t.stop());
        localStreamRef.current.removeTrack(localStreamRef.current.getVideoTracks()[0]);
      } else {
        try {
          const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
          videoStream.getVideoTracks().forEach((t) => localStreamRef.current?.addTrack(t));
        } catch {}
      }
    }
  }, [inCall]);

  const toggleScreenShare = useCallback(async () => {
    try {
      if (!isScreenSharing) {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        peerConnectionsRef.current.forEach((pc) => {
          displayStream.getVideoTracks().forEach((t) => pc.addTrack(t, displayStream));
        });
        setIsScreenSharing(true);

        displayStream.getVideoTracks()[0]?.addEventListener('ended', () => {
          setIsScreenSharing(false);
        });
      } else {
        setIsScreenSharing(false);
      }
    } catch {
      console.error('Screen share failed');
    }
  }, [isScreenSharing]);

  const toggleCall = useCallback(async () => {
    if (inCall) {
      cleanupPeerConnections();
      stopLocalStream();
      if (socketRef.current?.connected) {
        socketRef.current.emit('call:leave', { roomId });
      }
      setInCall(false);
    } else {
      const socket = getSocket();
      const stream = await startLocalStream();
      if (stream) {
        socket.emit('call:start', { roomId });
        setInCall(true);
      }
    }
  }, [inCall, roomId, getSocket]);

  useEffect(() => {
    return () => {
      cleanupPeerConnections();
      stopLocalStream();
      if (socketRef.current?.connected) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  const buttons = [
    { icon: isMuted ? MicOff : Mic, label: isMuted ? 'Unmute' : 'Mute', active: !isMuted, danger: isMuted, onClick: toggleMute },
    { icon: isDeafened ? VolumeX : Headphones, label: isDeafened ? 'Undeafen' : 'Deafen', active: !isDeafened, danger: isDeafened, onClick: toggleDeafen },
    { icon: isVideoEnabled ? Video : VideoOff, label: isVideoEnabled ? 'Video Off' : 'Video On', active: isVideoEnabled, onClick: toggleVideo },
    { icon: MonitorUp, label: isScreenSharing ? 'Stop Share' : 'Share Screen', active: isScreenSharing, onClick: toggleScreenShare },
  ];

  return (
    <div className="h-full flex flex-col p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-4">
        Voice Channel
      </div>

      <div className="flex-1 flex flex-col items-center justify-center">
        {inCall ? (
          <>
            <div className="text-center mb-4">
              <div className="w-20 h-20 rounded-full bg-success/20 border-2 border-success flex items-center justify-center mx-auto mb-3 animate-pulse">
                <Phone className="w-8 h-8 text-success" />
              </div>
              <p className="text-foreground font-medium">In Voice Channel</p>
              <p className="text-xs text-muted-foreground mt-1">Connected</p>
            </div>
            {remoteStreams.length > 0 && (
              <div className="w-full space-y-2">
                {remoteStreams.map((stream) => (
                  <audio key={stream.id} ref={(el) => { if (el) el.srcObject = stream; }} autoPlay />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <Headphones className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-foreground font-medium">No voice channel</p>
            <p className="text-xs text-muted-foreground mt-1">Join a voice channel to start talking</p>
          </div>
        )}
      </div>

      <button
        onClick={toggleCall}
        className={cn(
          'flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all mb-3',
          inCall
            ? 'bg-destructive/20 text-destructive hover:bg-destructive/30'
            : 'bg-success/20 text-success hover:bg-success/30',
        )}
      >
        <Phone size={16} />
        {inCall ? 'Leave Call' : 'Join Call'}
      </button>

      {inCall && (
        <div className="grid grid-cols-2 gap-2">
          {buttons.map((btn) => (
            <button
              key={btn.label}
              onClick={btn.onClick}
              className={cn(
                'flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                btn.danger
                  ? 'bg-destructive/20 text-destructive hover:bg-destructive/30'
                  : btn.active
                    ? 'bg-primary/20 text-primary hover:bg-primary/30'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
            >
              <btn.icon size={16} />
              {btn.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
