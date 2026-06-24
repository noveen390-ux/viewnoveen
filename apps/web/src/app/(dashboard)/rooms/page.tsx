'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { roomsApi } from '@/lib/api';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Search, Tv, Users, Plus, Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';

export default function RoomsPage() {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['rooms-search', search],
    queryFn: () => roomsApi.search(search, 1),
    enabled: true,
  });

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Rooms</h1>
            <p className="text-sm text-muted-foreground">Discover and join watch parties</p>
          </div>
          <Link
            href="/rooms/create"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            <Plus size={16} />
            Create Room
          </Link>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rooms..."
            className="w-full rounded-md border border-input bg-background pl-10 pr-4 py-2.5 text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : data?.data?.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.data.map((room: any, i: number) => (
              <motion.div
                key={room.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Link
                  href={`/rooms/${room.id}`}
                  className="block surface-card p-4 hover:border-primary/30 transition-all group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-foreground font-semibold group-hover:text-primary transition-colors">
                      {room.name}
                    </h3>
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded capitalize">
                      {room.type}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                    {room.description || 'No description'}
                  </p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Users size={14} />
                      <span>{room._count?.participants || 0}</span>
                    </div>
                    <span>{formatDate(room.createdAt)}</span>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 text-muted-foreground">
            <Tv className="w-16 h-16 mx-auto mb-4 text-muted-foreground/60" />
            <p className="text-lg font-medium mb-2">No rooms found</p>
            <p className="text-sm">Create a room or try a different search</p>
          </div>
        )}
      </div>
    </div>
  );
}
