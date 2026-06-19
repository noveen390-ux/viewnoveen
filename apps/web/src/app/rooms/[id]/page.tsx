'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { roomsApi, chatApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useRoomStore } from '@/stores/room-store';
import { getSyncSocket, getWebRTCSocket } from '@/lib/socket';
import { VideoPlayer } from '@/components/player/video-player';
import { SourceSelection } from '@/components/player/source-selection';
import { DirectSourceInput } from '@/components/player/direct-source-input';
import { YoutubeSourceInput } from '@/components/player/youtube-source-input';
import { DriveSourceInput } from '@/components/player/drive-source-input';
import { LocalSourceInput } from '@/components/player/local-source-input';
import { ChatPanel } from '@/components/chat/chat-panel';
import { ParticipantList } from '@/components/room/participant-list';
import { VoiceControls } from '@/components/voice/voice-controls';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  Users, MessageCircle, Music, Copy, ArrowLeft, Loader2, Share2, UserPlus,
} from 'lucide-react';

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const roomStore = useRoomStore();
  const [activeTab, setActiveTab] = useState<'chat' | 'participants' | 'voice'>('chat');
  const [connected, setConnected] = useState(false);
  const syncSocketRef = useRef<any>(null);
  const [videoView, setVideoView] = useState<'player' | 'source-selection' | 'direct-input' | 'youtube-input' | 'drive-input' | 'local-input'>(
    roomStore.video ? 'player' : 'source-selection',
  );

  const { data: roomData, isLoading, error } = useQuery({
    queryKey: ['room', id],
    queryFn: () => roomsApi.get(id),
    enabled: !!id,
    refetchInterval: 30000,
  });

  const joinMutation = useMutation({
    mutationFn: () => roomsApi.join(id),
    onSuccess: () => {
      roomsApi.get(id).then((res) => {
        roomStore.setRoom(res.data);
        roomStore.setParticipants(
          res.data.participants?.map((p: any) => ({
            ...p,
            username: p.user.username,
            displayName: p.user.displayName,
            avatar: p.user.avatar,
          })) || [],
        );
        roomStore.setChannels(res.data.channels || []);
        if (res.data.channels?.length > 0) {
          roomStore.setActiveChannel(res.data.channels[0].id);
        }
      });
    },
  });

  useEffect(() => {
    if (roomData) {
      roomStore.setRoom(roomData.data);
      if (roomData.data.video) {
        roomStore.setVideo(roomData.data.video);
        setVideoView('player');
      } else {
        setVideoView('source-selection');
      }
      if (roomData.data.participants) {
        roomStore.setParticipants(
          roomData.data.participants.map((p: any) => ({
            ...p,
            username: p.user.username,
            displayName: p.user.displayName,
            avatar: p.user.avatar,
          })),
        );
      }
      if (roomData.data.channels) {
        roomStore.setChannels(roomData.data.channels);
        if (!roomStore.activeChannel && roomData.data.channels.length > 0) {
          roomStore.setActiveChannel(roomData.data.channels[0].id);
        }
      }
    }
  }, [roomData]);

  useEffect(() => {
    if (id && accessToken) {
      joinMutation.mutate();

      const socket = getSyncSocket(accessToken);
      syncSocketRef.current = socket;

      socket.connect();

      socket.on('connect', () => {
        setConnected(true);
        socket.emit('join:room', { roomId: id });
      });

      socket.on('disconnect', () => {
        setConnected(false);
        toast.error('Connection lost. Reconnecting...');
      });

      socket.on('sync:action', (action: any) => {
        if (action.type === 'play') roomStore.setVideo({ ...roomStore.video!, isPlaying: true, currentTime: action.data.currentTime } as any);
        if (action.type === 'pause') roomStore.setVideo({ ...roomStore.video!, isPlaying: false, currentTime: action.data.currentTime } as any);
        if (action.type === 'seek') roomStore.setVideo({ ...roomStore.video!, currentTime: action.data.currentTime } as any);
        if (action.type === 'video_change' && action.data.videoId) {
          roomsApi.get(id).then((res) => {
            if (res.data.video) {
              roomStore.setVideo(res.data.video);
              setVideoView('player');
            }
          });
        }
        if (action.type === 'direct_media_end') {
          roomStore.setVideo(null);
          setVideoView('source-selection');
        }
      });

      socket.on('room:participants', (participants: any[]) => {
        roomStore.setParticipants(participants);
      });

      return () => {
        if (socket.connected) {
          socket.emit('leave:room', id);
          socket.disconnect();
        }
        roomStore.reset();
      };
    }
  }, [id, accessToken]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomStore.code);
    toast.success('Room code copied!');
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-surface-950">
        <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-surface-950">
        <div className="text-center">
          <p className="text-red-400 mb-4">Room not found</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="text-brand-400 hover:text-brand-300"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-surface-950">
      <div className="h-12 bg-surface-900 border-b border-surface-800 flex items-center px-4 gap-3">
        <button onClick={() => router.push('/dashboard')} className="text-surface-400 hover:text-white">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-white font-medium truncate">{roomStore.name}</span>
          <span className="text-xs bg-surface-800 text-surface-400 px-2 py-0.5 rounded capitalize">{roomStore.type}</span>
          <span className="text-xs text-surface-500">#{roomStore.code}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-xs text-surface-400">{connected ? 'Synced' : 'Disconnected'}</span>
        </div>
        <button onClick={handleCopyCode} className="text-surface-400 hover:text-white p-1.5">
          <Copy size={16} />
        </button>
        <button className="text-surface-400 hover:text-white p-1.5">
          <Share2 size={16} />
        </button>
        <button className="text-surface-400 hover:text-white p-1.5">
          <UserPlus size={16} />
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col">
          <div className="flex-1 bg-black relative">
            {videoView === 'player' && <VideoPlayer />}
            {videoView === 'source-selection' && (
              <SourceSelection
                onSelectDirect={() => setVideoView('direct-input')}
                onSelectYoutube={() => setVideoView('youtube-input')}
                onSelectDrive={() => setVideoView('drive-input')}
                onSelectLocal={() => setVideoView('local-input')}
              />
            )}
            {videoView === 'direct-input' && (
              <DirectSourceInput
                onBack={() => setVideoView('source-selection')}
                onPlay={() => setVideoView('player')}
              />
            )}
            {videoView === 'youtube-input' && (
              <YoutubeSourceInput
                onBack={() => setVideoView('source-selection')}
                onPlay={() => setVideoView('player')}
              />
            )}
            {videoView === 'drive-input' && (
              <DriveSourceInput
                onBack={() => setVideoView('source-selection')}
                onPlay={() => setVideoView('player')}
              />
            )}
            {videoView === 'local-input' && (
              <LocalSourceInput
                onBack={() => setVideoView('source-selection')}
                onPlay={() => setVideoView('player')}
              />
            )}
          </div>
        </div>

        <div className="w-80 bg-surface-900 border-l border-surface-800 flex flex-col">
          <div className="flex border-b border-surface-800">
            {[
              { id: 'chat', icon: MessageCircle, label: 'Chat' },
              { id: 'participants', icon: Users, label: 'Participants' },
              { id: 'voice', icon: Music, label: 'Voice' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-brand-400 border-b-2 border-brand-400'
                    : 'text-surface-400 hover:text-white'
                }`}
              >
                <tab.icon size={14} />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden">
            {activeTab === 'chat' && <ChatPanel />}
            {activeTab === 'participants' && <ParticipantList />}
            {activeTab === 'voice' && <VoiceControls />}
          </div>
        </div>
      </div>
    </div>
  );
}
