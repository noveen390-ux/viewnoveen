'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { motion } from 'framer-motion';
import { Monitor, Users, Music, MessageCircle, Video, Shield } from 'lucide-react';
import Link from 'next/link';

const features = [
  { icon: Monitor, title: 'Watch Party', description: 'Synchronized video playback with friends' },
  { icon: Users, title: 'Social Rooms', description: 'Create public or private watch rooms' },
  { icon: Music, title: 'Music Sessions', description: 'Collaborative music listening' },
  { icon: MessageCircle, title: 'Chat & Calls', description: 'Text, voice, and video calls' },
  { icon: Video, title: 'Google Drive', description: 'Stream your Drive videos' },
  { icon: Shield, title: 'Privacy First', description: 'Secure and private rooms' },
];

export default function HomePage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, router]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-surface-950 via-surface-900 to-surface-950">
      <header className="fixed top-0 w-full z-50 glass border-b border-surface-800">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
              <span className="text-white font-bold text-sm">VN</span>
            </div>
            <span className="text-xl font-bold text-white">ViewNoveen</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-surface-300 hover:text-white transition-colors px-4 py-2"
            >
              Login
            </Link>
            <Link
              href="/register"
              className="bg-brand-600 hover:bg-brand-500 text-white px-6 py-2 rounded-lg font-medium transition-all"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="pt-32 pb-20 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-5xl md:text-7xl font-bold text-white mb-6"
            >
              Watch Together.
              <br />
              <span className="bg-gradient-to-r from-brand-400 to-brand-200 bg-clip-text text-transparent">
                Feel Together.
              </span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-lg text-surface-400 mb-8 max-w-2xl mx-auto"
            >
              The ultimate platform for watching videos with friends in real-time.
              Synced playback, voice chat, and more.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex items-center justify-center gap-4"
            >
              <Link
                href="/register"
                className="bg-brand-600 hover:bg-brand-500 text-white px-8 py-3 rounded-xl font-semibold text-lg transition-all"
              >
                Start Watching
              </Link>
              <Link
                href="/login"
                className="bg-surface-800 hover:bg-surface-700 text-white px-8 py-3 rounded-xl font-semibold text-lg transition-all"
              >
                Sign In
              </Link>
            </motion.div>
          </div>
        </section>

        <section className="py-20 px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold text-white text-center mb-12">
              Everything You Need
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature, i) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * i }}
                  className="bg-surface-900/50 border border-surface-800 rounded-xl p-6 hover:border-brand-500/30 transition-all group"
                >
                  <div className="w-12 h-12 rounded-lg bg-brand-600/10 flex items-center justify-center mb-4 group-hover:bg-brand-600/20 transition-colors">
                    <feature.icon className="w-6 h-6 text-brand-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                  <p className="text-surface-400">{feature.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
