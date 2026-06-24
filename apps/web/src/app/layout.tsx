import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { QueryProvider } from '@/components/providers/query-provider';
import { I18nProvider } from '@/lib/i18n';
import { Toaster } from 'sonner';
import AnimatedBackground from '@/components/AnimatedBackground';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ViewNoveen - Social Watch Party Platform',
  description: 'Watch videos together in real-time with friends. Voice chat, video calls, and more.',
  keywords: ['watch party', 'video sync', 'social viewing', 'stream together'],
  openGraph: {
    title: 'ViewNoveen - Watch Together',
    description: 'World-class social watch-party platform',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <I18nProvider>
              <AnimatedBackground />
              {children}
            </I18nProvider>
            <Toaster
              position="bottom-right"
              theme="dark"
              toastOptions={{
                style: {
                  background: 'oklch(0.208 0.042 265.755)',
                  border: '1px solid oklch(1 0 0 / 10%)',
                  color: 'oklch(0.984 0.003 247.858)',
                },
              }}
            />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
