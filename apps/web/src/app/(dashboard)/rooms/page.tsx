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
            <h1 className="text-2xl font-bold text-white">Rooms</h1>
            <p className="text-sm text-surface-400">Discover and join watch parties</p>
          </div>
          <Link
            href="/rooms/create"
            className="bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <Plus size={16} />
            Create Room
          </Link>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rooms..."
            className="w-full bg-surface-800 border border-surface-700 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder:text-surface-500 focus:outline-none focus:border-brand-500"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-surface-400" />
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
                  className="block bg-surface-900/50 border border-surface-800 rounded-xl p-4 hover:border-brand-500/30 transition-all group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-white font-semibold group-hover:text-brand-400 transition-colors">
                      {room.name}
                    </h3>
                    <span className="text-xs bg-surface-800 text-surface-300 px-2 py-1 rounded capitalize">
                      {room.type}
                    </span>
                  </div>
                  <p className="text-sm text-surface-400 line-clamp-2 mb-3">
                    {room.description || 'No description'}
                  </p>
                  <div className="flex items-center justify-between text-xs text-surface-500">
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
          <div className="text-center py-20 text-surface-500">
            <Tv className="w-16 h-16 mx-auto mb-4 text-surface-600" />
            <p className="text-lg font-medium mb-2">No rooms found</p>
            <p className="text-sm">Create a room or try a different search</p>
          </div>
        )}
      </div>
    </div>
  );
}
