'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppHeader } from '@/components/layout/app-header';
import { useI18n } from '@/lib/i18n';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';
import { Film } from 'lucide-react';

export default function AuthPage() {
  const { t } = useI18n();
  const router = useRouter();
  const setTokens = useAuthStore((s) => s.setTokens);
  const setUser = useAuthStore((s) => s.setUser);
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'up') {
        const { data } = await authApi.register({
          username: name || email.split('@')[0],
          displayName: name || email.split('@')[0],
          email,
          password,
        });
        setTokens(data.accessToken, data.refreshToken);
        setUser(data.user);
        toast.success(t('settings.saved'));
        router.push('/dashboard');
      } else {
        const { data } = await authApi.login({ email, password });
        setTokens(data.accessToken, data.refreshToken);
        setUser(data.user);
        router.push('/dashboard');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('auth.errors.invalid'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto flex max-w-md flex-col items-center px-4 py-12">
        <div className="mb-6 flex items-center gap-2">
          <Film className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold">VIEWNOVEEN</span>
        </div>

        <div className="w-full surface-card p-6">
          <div className="mb-4 flex rounded-md bg-muted p-1 text-sm">
            <button
              onClick={() => setMode('in')}
              className={`flex-1 rounded px-3 py-1.5 transition ${mode === 'in' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
            >
              {t('auth.signIn')}
            </button>
            <button
              onClick={() => setMode('up')}
              className={`flex-1 rounded px-3 py-1.5 transition ${mode === 'up' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
            >
              {t('auth.signUp')}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'up' && (
              <input
                type="text"
                placeholder={t('auth.displayName')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            )}
            <input
              type="email"
              required
              placeholder={t('auth.email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder={t('auth.password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {mode === 'in' ? t('auth.signIn') : t('auth.signUp')}
            </button>
          </form>

          <div className="my-4 flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            <span>{t('auth.or')}</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <button
            onClick={() => {}}
            disabled={busy}
            className="w-full rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
          >
            {t('auth.continueGoogle')}
          </button>

          <div className="mt-4 text-center text-xs text-muted-foreground">
            <Link href="/join" className="text-primary hover:underline">
              {t('auth.continueGuest')} &rarr;
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
