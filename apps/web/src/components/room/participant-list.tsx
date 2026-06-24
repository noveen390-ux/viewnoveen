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
    <div className="flex flex-col surface-card h-full">
      <div className="border-b border-border px-4 py-3 text-sm font-semibold">
        {participants.length} Participants
      </div>
      <ul className="max-h-48 space-y-1 overflow-y-auto p-2">
        {sorted.map((participant) => {
          const isMe = participant.userId === user?.id;
          return (
            <li
              key={participant.userId}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted',
                isMe && 'bg-primary/10',
              )}
            >
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-medium flex-shrink-0">
                {participant.displayName?.charAt(0) || 'U'}
              </div>
              <div className="flex-1 min-w-0 flex items-center gap-1.5">
                <span className="truncate text-foreground">{participant.displayName}</span>
                {participant.role === 'host' && (
                  <Crown size={12} className="text-primary flex-shrink-0" />
                )}
                {isMe && <span className="text-[10px] text-muted-foreground">(you)</span>}
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                {participant.isMuted ? (
                  <MicOff size={14} className="text-destructive" />
                ) : (
                  <Mic size={14} />
                )}
                {participant.isDeafened ? (
                  <VolumeX size={14} className="text-destructive" />
                ) : (
                  <Headphones size={14} />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
