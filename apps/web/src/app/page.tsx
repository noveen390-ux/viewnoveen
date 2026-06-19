'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useI18n } from '@/lib/i18n';
import { AppHeader } from '@/components/layout/app-header';
import { motion } from 'framer-motion';
import { Film, Play, MessageSquare, RefreshCw, Users } from 'lucide-react';
import Link from 'next/link';

const features = [
  { icon: Film, key: 'sync' },
  { icon: Play, key: 'sources' },
  { icon: MessageSquare, key: 'chat' },
  { icon: RefreshCw, key: 'recovery' },
] as const;

export default function HomePage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { t } = useI18n();

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, router]);

  return (
    <div className="min-h-screen">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 pb-24 pt-12 md:pt-20">
        <section className="relative text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              {t('app.tagline')}
            </div>
            <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-6xl">
              {t('landing.headline')}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground md:text-lg">
              {t('landing.subhead')}
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link
                href="/rooms/create"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 glow-primary"
              >
                <Play className="h-4 w-4" />
                {t('landing.ctaPrimary')}
              </Link>
              <Link
                href="/join"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-6 py-3 text-sm font-semibold text-foreground transition hover:bg-muted"
              >
                <Users className="h-4 w-4" />
                {t('landing.ctaSecondary')}
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.2 }}
            className="surface-card mx-auto mt-16 max-w-4xl overflow-hidden p-2 glow-primary"
          >
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_240px]">
              <div className="aspect-video w-full rounded-md bg-black/80" />
              <div className="flex flex-col gap-2">
                <div className="surface-card flex-1 p-3 text-start text-xs text-muted-foreground">
                  <div className="mb-2 font-semibold text-foreground">3 {t('rooms.members')}</div>
                  <div role="img" aria-label="crown">{'\uD83D\uDC51'} Salma &middot; {t('rooms.host')}</div>
                  <div>&bull; Ahmed</div>
                  <div>&bull; {t('auth.continueGuest')}</div>
                </div>
                <div className="surface-card flex-1 p-3 text-start text-xs">
                  <div className="text-primary">Salma</div>
                  <div className="text-foreground">{'\u062F\u0642\u064A\u0642\u0629'} 12:34 {'\uD83D\uDD25'}</div>
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        <section className="mt-24 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <motion.div
              key={f.key}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              className="surface-card p-5"
            >
              <f.icon className="mb-3 h-6 w-6 text-primary" />
              <h3 className="text-sm font-semibold">{t(`landing.features.${f.key}Title`)}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{t(`landing.features.${f.key}Desc`)}</p>
            </motion.div>
          ))}
        </section>
      </main>
    </div>
  );
}
