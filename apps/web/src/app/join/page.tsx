'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppHeader } from '@/components/layout/app-header';
import { useI18n } from '@/lib/i18n';
import { toast } from 'sonner';
import { Users } from 'lucide-react';

export default function JoinPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [code, setCode] = useState('');

  const go = () => {
    const c = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(c)) {
      toast.error(t('rooms.notFound'));
      return;
    }
    router.push(`/room/${c}`);
  };

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto flex max-w-md flex-col items-center px-4 py-16">
        <Users className="mb-3 h-10 w-10 text-primary" />
        <h1 className="text-2xl font-bold">{t('rooms.joinByCode')}</h1>
        <div className="mt-6 flex w-full flex-col gap-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && go()}
            maxLength={6}
            placeholder="ABC123"
            className="w-full rounded-md border border-input bg-background px-3 py-3 text-center text-lg font-mono tracking-[0.4em] outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={go}
            className="w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            {t('rooms.join')}
          </button>
        </div>
      </main>
    </div>
  );
}
