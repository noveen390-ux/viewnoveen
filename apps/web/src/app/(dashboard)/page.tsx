'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { roomsApi, socialApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { motion } from 'framer-motion';
import { Plus, Users, Tv, TrendingUp, Clock, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [roomCode, setRoomCode] = useState('');

  const { data: recommendations, isLoading } = useQuery({
    queryKey: ['room-recommendations'],
    queryFn: () => roomsApi.search('', 1),
  });

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (roomCode.trim()) {
      router.push(`/rooms/join/${roomCode.trim().toUpperCase()}`);
    }
  };

  const stats = [
    { icon: Users, label: 'Friends Online', value: '0', color: 'text-green-400' },
    { icon: Tv, label: 'Active Rooms', value: recommendations?.data?.length?.toString() || '0', color: 'text-brand-400' },
    { icon: Clock, label: 'Watch Time', value: '0h', color: 'text-yellow-400' },
  ];

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Welcome back, {user?.displayName}
            </h1>
            <p className="text-surface-400 mt-1">What are we watching today?</p>
          </div>
          <div className="flex items-center gap-3">
            <form onSubmit={handleJoinByCode} className="flex items-center gap-2">
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="Enter room code"
                maxLength={8}
                className="w-40 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-surface-500 focus:outline-none focus:border-brand-500 uppercase"
              />
              <button
                type="submit"
                className="bg-surface-800 hover:bg-surface-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Join
              </button>
            </form>
            <Link
              href="/rooms/create"
              className="bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
            >
              <Plus size={16} />
              Create Room
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="bg-surface-900/50 border border-surface-800 rounded-xl p-4"
            >
              <div className="flex items-center gap-3">
                <stat.icon className={cn('w-8 h-8', stat.color)} />
                <div>
                  <p className="text-2xl font-bold text-white">{stat.value}</p>
                  <p className="text-xs text-surface-400">{stat.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <TrendingUp size={18} className="text-brand-400" />
              Recommended Rooms
            </h2>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-surface-400" />
            </div>
          ) : recommendations?.data?.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recommendations.data.map((room: any, i: number) => (
                <motion.div
                  key={room.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => router.push(`/rooms/${room.id}`)}
                  className="bg-surface-900/50 border border-surface-800 rounded-xl p-4 hover:border-brand-500/30 cursor-pointer transition-all group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-white font-semibold group-hover:text-brand-400 transition-colors">
                        {room.name}
                      </h3>
                      <p className="text-xs text-surface-400 mt-0.5">
                        by {room.host?.displayName || room.host?.username}
                      </p>
                    </div>
                    <span className="text-xs bg-surface-800 text-surface-300 px-2 py-1 rounded capitalize">
                      {room.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-surface-400 text-sm">
                    <Users size={14} />
                    <span>{room._count?.participants || 0} watching</span>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-surface-900/30 rounded-xl border border-surface-800">
              <Tv className="w-12 h-12 text-surface-600 mx-auto mb-3" />
              <p className="text-surface-400">No rooms yet</p>
              <Link
                href="/rooms/create"
                className="text-brand-400 hover:text-brand-300 text-sm mt-2 inline-block"
              >
                Create the first room
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
