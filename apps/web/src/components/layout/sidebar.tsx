'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  Home, Compass, Tv, Music, Users, MessageCircle, Settings,
  LogOut, Plus, Search, Bell, ChevronDown,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

const navItems = [
  { icon: Home, label: 'nav.home', href: '/dashboard' },
  { icon: Compass, label: 'nav.discover', href: '/dashboard/discover' },
  { icon: Tv, label: 'nav.rooms', href: '/dashboard/rooms' },
  { icon: Music, label: 'nav.music', href: '/dashboard/music' },
  { icon: Users, label: 'nav.friends', href: '/dashboard/friends' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    logout();
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  };

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 240 }}
      className="flex flex-col bg-surface-900 border-r border-surface-800 overflow-hidden"
    >
      <div className="h-14 flex items-center px-4 border-b border-surface-800">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">VN</span>
          </div>
          {!collapsed && (
            <span className="text-lg font-bold text-white truncate">ViewNoveen</span>
          )}
        </Link>
      </div>

      <nav className="flex-1 p-2 space-y-1 overflow-y-auto scrollbar-thin">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group',
                isActive
                  ? 'bg-brand-600/15 text-brand-400'
                  : 'text-surface-400 hover:text-white hover:bg-surface-800',
              )}
            >
              <item.icon size={20} className="flex-shrink-0" />
              {!collapsed && (
                <span className="text-sm font-medium truncate">{t(item.label)}</span>
              )}
            </Link>
          );
        })}

        {!collapsed && (
          <>
            <div className="pt-4 pb-2">
              <div className="flex items-center justify-between px-3">
                <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider">
                  Direct Messages
                </span>
                <button className="text-surface-400 hover:text-white">
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <div className="text-center text-surface-500 text-sm py-8">
              No conversations yet
            </div>
          </>
        )}
      </nav>

      <div className="p-2 border-t border-surface-800">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-800 transition-colors cursor-pointer">
          <div className="relative flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-sm font-medium">
              {user?.displayName?.charAt(0) || 'U'}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-surface-900" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.displayName}</p>
              <p className="text-xs text-surface-400 truncate">@{user?.username}</p>
            </div>
          )}
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-surface-400 hover:text-red-400 hover:bg-surface-800 transition-colors w-full mt-1"
        >
          <LogOut size={18} />
          {!collapsed && <span className="text-sm">Logout</span>}
        </button>
      </div>
    </motion.aside>
  );
}
