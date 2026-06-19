'use client';

import { useRoomStore } from '@/stores/room-store';
import { useAuthStore } from '@/stores/auth-store';
import { Users, Crown, Mic, MicOff, Headphones, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ParticipantList() {
  const participants = useRoomStore((s) => s.participants);
  const user = useAuthStore((s) => s.user);

  const host = participants.find((p) => p.role === 'host');
  const others = participants.filter((p) => p.role !== 'host');

  const sorted = host ? [host, ...others] : participants;

  return (
    <div className="h-full overflow-y-auto scrollbar-thin p-3">
      <div className="flex items-center gap-2 mb-3 text-xs text-surface-400 uppercase tracking-wider">
        <Users size={14} />
        <span>{participants.length} Participants</span>
      </div>
      <div className="space-y-1">
        {sorted.map((participant) => {
          const isMe = participant.userId === user?.id;
          return (
            <div
              key={participant.userId}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
                isMe ? 'bg-brand-600/10' : 'hover:bg-surface-800',
              )}
            >
              <div className="relative flex-shrink-0">
                <div className="w-9 h-9 rounded-full bg-brand-600 flex items-center justify-center text-white text-sm font-medium">
                  {participant.displayName?.charAt(0) || 'U'}
                </div>
                <div
                  className={cn(
                    'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-surface-900',
                    true ? 'bg-green-500' : 'bg-surface-600',
                  )}
                />
                {participant.isSpeaking && (
                  <div className="absolute inset-0 rounded-full ring-2 ring-green-400 animate-pulse" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-white truncate">
                    {participant.displayName}
                  </span>
                  {participant.role === 'host' && (
                    <Crown size={12} className="text-yellow-500 flex-shrink-0" />
                  )}
                  {isMe && <span className="text-[10px] text-surface-500">(you)</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 text-surface-500">
                {participant.isMuted ? (
                  <MicOff size={14} className="text-red-400" />
                ) : (
                  <Mic size={14} />
                )}
                {participant.isDeafened ? (
                  <VolumeX size={14} className="text-red-400" />
                ) : (
                  <Headphones size={14} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
