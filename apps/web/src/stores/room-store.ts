'use client';

import { create } from 'zustand';

interface Participant {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  role: string;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
}

interface RoomVideo {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  playbackRate: number;
  source: string;
}

interface Channel {
  id: string;
  name: string;
  type: string;
  topic: string;
  isVoice: boolean;
  position: number;
}

interface RoomState {
  id: string;
  name: string;
  code: string;
  type: string;
  privacy: string;
  hostId: string;
  video: RoomVideo | null;
  participants: Participant[];
  channels: Channel[];
  activeChannel: string | null;
  setRoom: (room: any) => void;
  setVideo: (video: RoomVideo | null) => void;
  setParticipants: (participants: Participant[]) => void;
  addParticipant: (participant: Participant) => void;
  removeParticipant: (userId: string) => void;
  updateParticipant: (userId: string, data: Partial<Participant>) => void;
  setActiveChannel: (channelId: string) => void;
  setChannels: (channels: Channel[]) => void;
  reset: () => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  id: '',
  name: '',
  code: '',
  type: 'watch',
  privacy: 'public',
  hostId: '',
  video: null,
  participants: [],
  channels: [],
  activeChannel: null,
  setRoom: (room) =>
    set({
      id: room.id,
      name: room.name,
      code: room.code,
      type: room.type,
      privacy: room.privacy,
      hostId: room.hostId,
    }),
  setVideo: (video) => set({ video }),
  setParticipants: (participants) => set({ participants }),
  addParticipant: (participant) =>
    set((state) => ({
      participants: [...state.participants.filter((p) => p.userId !== participant.userId), participant],
    })),
  removeParticipant: (userId) =>
    set((state) => ({
      participants: state.participants.filter((p) => p.userId !== userId),
    })),
  updateParticipant: (userId, data) =>
    set((state) => ({
      participants: state.participants.map((p) =>
        p.userId === userId ? { ...p, ...data } : p,
      ),
    })),
  setActiveChannel: (channelId) => set({ activeChannel: channelId }),
  setChannels: (channels) => set({ channels }),
  reset: () =>
    set({
      id: '',
      name: '',
      code: '',
      type: 'watch',
      privacy: 'public',
      hostId: '',
      video: null,
      participants: [],
      channels: [],
      activeChannel: null,
    }),
}));
