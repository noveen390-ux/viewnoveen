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
          <Settings className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        </div>

        <div className="space-y-6">
          <section className="surface-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <User className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Profile</h2>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xl font-bold">
                  {user?.displayName?.charAt(0) || 'U'}
                </div>
                <div>
                  <p className="text-foreground font-medium text-lg">{user?.displayName}</p>
                  <p className="text-sm text-muted-foreground">@{user?.username}</p>
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring resize-none h-24"
                  placeholder="Tell people about yourself"
                  maxLength={500}
                />
              </div>
              <button
                onClick={() => updateMutation.mutate({ bio })}
                className="rounded-md bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              >
                Save Changes
              </button>
            </div>
          </section>

          <section className="surface-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Palette className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Appearance</h2>
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
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-surface text-muted-foreground hover:border-muted-foreground',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="surface-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Language</h2>
            </div>
            <div className="flex gap-2">
              {[
                { value: 'en', label: 'English' },
                { value: 'ar', label: 'العربية' },
              ].map((lang) => (
                <button
                  key={lang.value}
                  className="flex-1 rounded-md border px-3 py-2 text-sm transition border-border text-foreground hover:bg-muted"
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
