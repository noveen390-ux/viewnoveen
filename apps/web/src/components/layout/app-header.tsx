'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useI18n } from '@/lib/i18n';
import { Film, Globe, LogOut } from 'lucide-react';

export function AppHeader() {
  const { lang, setLang, t } = useI18n();
  const { user, isAuthenticated, logout } = useAuthStore();
  const router = useRouter();

  const signOut = () => {
    logout();
    router.push('/');
  };

  const switchLang = () => setLang(lang === 'ar' ? 'en' : 'ar');

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
          <Film className="h-5 w-5 text-primary" />
          <span className="text-foreground">VIEWNOVEEN</span>
        </Link>

        <nav className="ms-4 hidden items-center gap-1 text-sm md:flex">
          <Link
            href="/join"
            className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {t('nav.join')}
          </Link>
          {isAuthenticated && (
            <>
              <Link
                href="/dashboard"
                className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {t('nav.rooms')}
              </Link>
              <Link
                href="/settings"
                className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {t('nav.settings')}
              </Link>
            </>
          )}
        </nav>

        <div className="ms-auto flex items-center gap-2">
          <button
            onClick={switchLang}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
            aria-label="Switch language"
          >
            <Globe className="h-3.5 w-3.5" />
            {lang === 'ar' ? 'EN' : 'ع'}
          </button>
          {isAuthenticated ? (
            <button
              onClick={signOut}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
            >
              <LogOut className="h-3.5 w-3.5" />
              {t('nav.signOut')}
            </button>
          ) : (
            <Link
              href="/auth"
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
            >
              {t('nav.signIn')}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
