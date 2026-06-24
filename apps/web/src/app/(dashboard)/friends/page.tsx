'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { socialApi, usersApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { motion } from 'framer-motion';
import { Users, UserPlus, Search, Loader2, Check, X, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function FriendsPage() {
  const [tab, setTab] = useState<'friends' | 'requests' | 'add'>('friends');
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data: friends, isLoading: friendsLoading } = useQuery({
    queryKey: ['friends'],
    queryFn: () => socialApi.getFriends(1),
  });

  const { data: requests } = useQuery({
    queryKey: ['friend-requests'],
    queryFn: socialApi.getFriendRequests,
  });

  const addFriendMutation = useMutation({
    mutationFn: socialApi.sendFriendRequest,
    onSuccess: () => {
      toast.success('Friend request sent!');
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to send request'),
  });

  const acceptMutation = useMutation({
    mutationFn: (userId: string) => socialApi.acceptFriendRequest(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (userId: string) => socialApi.rejectFriendRequest(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
    },
  });

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <Users className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Friends</h1>
        </div>

        <div className="flex gap-2 mb-6 border-b border-border">
          {[
            { id: 'friends', label: `All Friends (${(friends?.data as any)?.total ?? friends?.data?.length ?? 0})` },
            { id: 'requests', label: `Requests (${requests?.data?.length || 0})` },
            { id: 'add', label: 'Add Friend' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-[1px]',
                tab === t.id
                  ? 'text-primary border-primary'
                  : 'text-muted-foreground hover:text-foreground border-transparent',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'add' && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by username..."
                className="w-full rounded-md border border-input bg-background pl-10 pr-4 py-2.5 text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="text-center py-12 text-muted-foreground">
              <UserPlus className="w-16 h-16 mx-auto mb-4 text-muted-foreground/60" />
              <p>Search for users to add as friends</p>
            </div>
          </div>
        )}

        {tab === 'requests' && (
          <div className="space-y-2">
            {requests?.data?.length ? requests.data.map((req: any) => (
              <div key={req.id} className="surface-card p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-medium">
                  {req.user.displayName?.charAt(0)}
                </div>
                <div className="flex-1">
                  <p className="text-foreground font-medium">{req.user.displayName}</p>
                  <p className="text-xs text-muted-foreground">@{req.user.username}</p>
                </div>
                <button
                  onClick={() => acceptMutation.mutate(req.userId)}
                  className="bg-success text-success-foreground p-2 rounded-lg transition-colors hover:opacity-90"
                >
                  <Check size={18} />
                </button>
                <button
                  onClick={() => rejectMutation.mutate(req.userId)}
                  className="bg-destructive/20 hover:bg-destructive/30 text-destructive p-2 rounded-lg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            )) : (
              <div className="text-center py-12 text-muted-foreground">
                <Clock className="w-16 h-16 mx-auto mb-4 text-muted-foreground/60" />
                <p>No pending friend requests</p>
              </div>
            )}
          </div>
        )}

        {tab === 'friends' && (
          <div className="space-y-2">
            {friendsLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : friends?.data?.length ? (
              friends.data.map((f: any, i: number) => (
                <motion.div
                  key={f.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="surface-card p-3 flex items-center gap-3"
                >
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-medium">
                      {f.friend.displayName?.charAt(0)}
                    </div>
                    <div className={cn(
                      'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background',
                      f.friend.isOnline ? 'bg-success' : 'bg-muted-foreground',
                    )} />
                  </div>
                  <div className="flex-1">
                    <p className="text-foreground font-medium">{f.friend.displayName}</p>
                    <p className="text-xs text-muted-foreground">@{f.friend.username}</p>
                  </div>
                  <span className={cn(
                    'text-xs px-2 py-1 rounded-full',
                    f.friend.isOnline ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground',
                  )}>
                    {f.friend.isOnline ? 'Online' : 'Offline'}
                  </span>
                </motion.div>
              ))
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-16 h-16 mx-auto mb-4 text-muted-foreground/60" />
                <p>No friends yet</p>
                <p className="text-sm">Search for users to add</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
