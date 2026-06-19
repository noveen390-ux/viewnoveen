'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { roomsApi } from '@/lib/api';
import { getSyncSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth-store';
import { AppHeader } from '@/components/layout/app-header';
import { useI18n } from '@/lib/i18n';
import { toast } from 'sonner';
import { Copy, Crown, ArrowLeft, Loader2 } from 'lucide-react';

export default function RoomByCodePage() {
  const { code } = useParams<{ code: string }>();
  const upperCode = (code || '').toUpperCase();
  const { t } = useI18n();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [room, setRoom] = useState<any>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!upperCode) return;
    setLoading(true);
    roomsApi.getByCode(upperCode)
      .then((res) => {
        setRoom(res.data);
        setLoadErr(null);
      })
      .catch((err: any) => {
        setLoadErr(err?.response?.data?.message || 'ROOM_NOT_FOUND');
      })
      .finally(() => setLoading(false));
  }, [upperCode]);

  const copyLink = () => {
    if (typeof window === 'undefined') return;
    navigator.clipboard.writeText(window.location.href);
    toast.success(t('rooms.linkCopied'));
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
      </div>
    );
  }

  if (loadErr) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
          <h1 className="text-2xl font-bold">{t('rooms.notFound')}</h1>
          <code className="mt-2 rounded-md bg-muted px-3 py-1 font-mono">{upperCode}</code>
          <button
            onClick={() => router.push('/join')}
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('nav.join')}
          </button>
        </main>
      </div>
    );
  }

  const isHost = user && room && room.hostId === user.id;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-6 lg:grid-cols-[1fr_320px]">
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold">{room?.name || upperCode}</h1>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                {isHost && (
                  <span className="inline-flex items-center gap-1 text-primary">
                    <Crown className="h-3 w-3" />{t('rooms.host')}
                  </span>
                )}
                <code className="rounded bg-muted px-2 py-0.5 font-mono tracking-widest text-primary">{upperCode}</code>
              </div>
            </div>
            <button
              onClick={copyLink}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              <Copy className="h-3.5 w-3.5" />
              {t('rooms.copyLink')}
            </button>
          </div>

          <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black surface-card">
            <div className="flex h-full items-center justify-center text-muted-foreground">
              {t('player.noSource')}
            </div>
          </div>
        </section>

        <aside className="flex flex-col gap-4 lg:h-[calc(100vh-8rem)]">
          <div className="surface-card flex flex-col">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold">
              {t('rooms.members')}
            </div>
            <div className="p-4 text-center text-sm text-muted-foreground">
              {t('common.loading')}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
