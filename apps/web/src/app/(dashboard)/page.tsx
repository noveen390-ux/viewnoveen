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
    { icon: Users, label: 'Friends Online', value: '0', color: 'text-success' },
    { icon: Tv, label: 'Active Rooms', value: recommendations?.data?.length?.toString() || '0', color: 'text-primary' },
    { icon: Clock, label: 'Watch Time', value: '0h', color: 'text-foreground' },
  ];

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Welcome back, {user?.displayName}
            </h1>
            <p className="text-muted-foreground mt-1">What are we watching today?</p>
          </div>
          <div className="flex items-center gap-3">
            <form onSubmit={handleJoinByCode} className="flex items-center gap-2">
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="Enter room code"
                maxLength={8}
                className="w-40 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring uppercase"
              />
              <button
                type="submit"
                className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Join
              </button>
            </form>
            <Link
              href="/rooms/create"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
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
              className="surface-card p-4"
            >
              <div className="flex items-center gap-3">
                <stat.icon className={cn('w-8 h-8', stat.color)} />
                <div>
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <TrendingUp size={18} className="text-primary" />
              Recommended Rooms
            </h2>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
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
                  className="surface-card p-4 hover:border-primary/30 cursor-pointer transition-all group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-foreground font-semibold group-hover:text-primary transition-colors">
                        {room.name}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        by {room.host?.displayName || room.host?.username}
                      </p>
                    </div>
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded capitalize">
                      {room.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground text-sm">
                    <Users size={14} />
                    <span>{room._count?.participants || 0} watching</span>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border border-border rounded-xl bg-surface/50">
              <Tv className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No rooms yet</p>
              <Link
                href="/rooms/create"
                className="text-primary hover:text-primary/80 text-sm mt-2 inline-block"
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
