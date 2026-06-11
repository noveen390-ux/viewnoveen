'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { usersApi } from '@/lib/api';
import { Settings, User, Globe, Palette, LogOut } from 'lucide-react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const { theme, setTheme } = useTheme();
  const [bio, setBio] = useState(user?.bio || '');

  const updateMutation = useMutation({
    mutationFn: (data: any) => usersApi.updateProfile(data),
    onSuccess: () => toast.success('Profile updated'),
    onError: () => toast.error('Failed to update'),
  });

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-3xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-8">
          <Settings className="w-6 h-6 text-brand-400" />
          <h1 className="text-2xl font-bold text-white">Settings</h1>
        </div>

        <div className="space-y-6">
          <section className="bg-surface-900/50 border border-surface-800 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <User className="w-5 h-5 text-brand-400" />
              <h2 className="text-lg font-semibold text-white">Profile</h2>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-brand-600 flex items-center justify-center text-white text-xl font-bold">
                  {user?.displayName?.charAt(0) || 'U'}
                </div>
                <div>
                  <p className="text-white font-medium text-lg">{user?.displayName}</p>
                  <p className="text-sm text-surface-400">@{user?.username}</p>
                </div>
              </div>
              <div>
                <label className="text-sm text-surface-300 mb-1 block">Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full bg-surface-800 border border-surface-700 rounded-lg px-4 py-2.5 text-white placeholder:text-surface-500 focus:outline-none focus:border-brand-500 resize-none h-24"
                  placeholder="Tell people about yourself"
                  maxLength={500}
                />
              </div>
              <button
                onClick={() => updateMutation.mutate({ bio })}
                className="bg-brand-600 hover:bg-brand-500 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Save Changes
              </button>
            </div>
          </section>

          <section className="bg-surface-900/50 border border-surface-800 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Palette className="w-5 h-5 text-brand-400" />
              <h2 className="text-lg font-semibold text-white">Appearance</h2>
            </div>
            <div className="space-y-3">
              {[
                { value: 'dark', label: 'Dark Mode' },
                { value: 'light', label: 'Light Mode' },
                { value: 'system', label: 'System' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setTheme(option.value)}
                  className={cn(
                    'w-full text-left px-4 py-3 rounded-lg border transition-all',
                    theme === option.value
                      ? 'border-brand-500 bg-brand-600/10 text-white'
                      : 'border-surface-700 bg-surface-800 text-surface-300 hover:border-surface-600',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="bg-surface-900/50 border border-surface-800 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="w-5 h-5 text-brand-400" />
              <h2 className="text-lg font-semibold text-white">Language</h2>
            </div>
            <div className="space-y-3">
              {[
                { value: 'en', label: 'English' },
                { value: 'ar', label: 'العربية' },
              ].map((lang) => (
                <button
                  key={lang.value}
                  className="w-full text-left px-4 py-3 rounded-lg border border-surface-700 bg-surface-800 text-surface-300 hover:border-surface-600 transition-all"
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
