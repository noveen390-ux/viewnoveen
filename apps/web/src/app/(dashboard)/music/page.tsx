'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { roomsApi, musicApi } from '@/lib/api';
import Link from 'next/link';
import { Music, Play, Plus, Users, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

export default function MusicPage() {
  const { data: rooms, isLoading } = useQuery({
    queryKey: ['music-rooms'],
    queryFn: () => roomsApi.search('music', 1),
  });

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Music className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Music Sessions</h1>
              <p className="text-sm text-muted-foreground">Listen to music together</p>
            </div>
          </div>
          <Link
            href="/rooms/create"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            <Plus size={16} />
            Create Music Room
          </Link>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : rooms?.data?.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.data.map((room: any, i: number) => (
              <motion.div
                key={room.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Link
                  href={`/rooms/${room.id}`}
                  className="block surface-card p-5 hover:border-primary/30 transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                    <Music className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-foreground font-semibold mb-1">{room.name}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                    {room.description || 'Music session'}
                  </p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Users size={14} />
                      <span>{room._count?.participants || 0} listeners</span>
                    </div>
                    <Play size={14} className="text-primary" />
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 text-muted-foreground">
            <Music className="w-16 h-16 mx-auto mb-4 text-muted-foreground/60" />
            <p className="text-lg font-medium mb-2">No music sessions</p>
            <p className="text-sm">Create a music room and start listening together</p>
          </div>
        )}
      </div>
    </div>
  );
}
