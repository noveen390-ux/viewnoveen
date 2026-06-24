'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { motion } from 'framer-motion';
import { Shield, Users, Tv, Flag, BarChart3, Search, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AdminPage() {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<'overview' | 'users' | 'reports'>('overview');
  const [search, setSearch] = useState('');

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: adminApi.getDashboard,
  });

  const { data: reports } = useQuery({
    queryKey: ['admin-reports'],
    queryFn: () => adminApi.getReports(1),
  });

  const { data: users } = useQuery({
    queryKey: ['admin-users', search],
    queryFn: () => adminApi.getUsers(1, search),
    enabled: !!search,
  });

  const stats = [
    { icon: Users, label: 'Total Users', value: dashboard?.data?.totalUsers || 0, color: 'text-blue-400' },
    { icon: Users, label: 'Active Users', value: dashboard?.data?.activeUsers || 0, color: 'text-green-400' },
    { icon: Tv, label: 'Total Rooms', value: dashboard?.data?.totalRooms || 0, color: 'text-purple-400' },
    { icon: Tv, label: 'Active Rooms', value: dashboard?.data?.activeRooms || 0, color: 'text-primary' },
    { icon: Flag, label: 'Pending Reports', value: dashboard?.data?.totalReports || 0, color: 'text-red-400' },
  ];

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-8">
          <Shield className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">Manage ViewNoveen platform</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-5 gap-4 mb-8">
              {stats.map((stat) => (
                <div key={stat.label} className="surface-card p-4">
                  <stat.icon className={cn('w-6 h-6 mb-2', stat.color)} />
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-2 mb-6 border-b border-border">
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'users', label: 'Users' },
                { id: 'reports', label: 'Reports' },
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

            {tab === 'reports' && (
              <div className="space-y-3">
                {reports?.data?.length ? reports.data.map((report: any) => (
                  <div key={report.id} className="surface-card p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-foreground font-medium">{report.category}</p>
                        <p className="text-sm text-muted-foreground mt-1">{report.reason}</p>
                        <p className="text-xs text-muted-foreground mt-1">Target: {report.targetType}</p>
                      </div>
                      <span className={cn(
                        'text-xs px-2 py-1 rounded-full',
                        report.status === 'pending' ? 'bg-yellow-600/20 text-yellow-400' : 'bg-green-600/20 text-green-400',
                      )}>
                        {report.status}
                      </span>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-12 text-muted-foreground">No pending reports</div>
                )}
              </div>
            )}

            {tab === 'users' && (
              <div>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search users by username, email..."
                    className="w-full rounded-md border border-input bg-background pl-10 pr-4 py-2 text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                {users?.data?.map((u: any) => (
                  <div key={u.id} className="flex items-center gap-3 surface-card p-3 mb-2">
                    <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-medium">
                      {u.displayName?.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <p className="text-foreground text-sm font-medium">{u.displayName}</p>
                      <p className="text-xs text-muted-foreground">{u.email} · @{u.username}</p>
                    </div>
                    <span className={cn(
                      'text-xs px-2 py-1 rounded-full',
                      u.status === 'online' ? 'bg-green-600/20 text-green-400' : 'bg-muted text-muted-foreground',
                    )}>
                      {u.status}
                    </span>
                    <span className={cn(
                      'p-1 rounded',
                      u.isVerified ? 'text-blue-400' : 'text-muted-foreground',
                    )}>
                      {u.isVerified ? <CheckCircle size={16} /> : <XCircle size={16} />}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
