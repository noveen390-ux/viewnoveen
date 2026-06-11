'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth-store';
import { authApi } from '@/lib/api';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function RegisterPage() {
  const [form, setForm] = useState({ username: '', displayName: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const setTokens = useAuthStore((s) => s.setTokens);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data } = await authApi.register(form);
      setUser(data.user);
      setTokens(data.accessToken, data.refreshToken);
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      toast.success('Account created!');
      router.push('/dashboard');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <div className="min-h-screen bg-gradient-to-b from-surface-950 via-surface-900 to-surface-950 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md"
      >
        <div className="bg-surface-900/50 border border-surface-800 rounded-2xl p-8">
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-bold text-lg">VN</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Create account</h1>
            <p className="text-surface-400 mt-1">Start watching together</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-surface-300 mb-1 block">Username</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={updateField('username')}
                  className="w-full bg-surface-800 border border-surface-700 rounded-lg px-4 py-2.5 text-white placeholder:text-surface-500 focus:outline-none focus:border-brand-500"
                  placeholder="johndoe"
                  required
                  minLength={3}
                  maxLength={30}
                />
              </div>
              <div>
                <label className="text-sm text-surface-300 mb-1 block">Display Name</label>
                <input
                  type="text"
                  value={form.displayName}
                  onChange={updateField('displayName')}
                  className="w-full bg-surface-800 border border-surface-700 rounded-lg px-4 py-2.5 text-white placeholder:text-surface-500 focus:outline-none focus:border-brand-500"
                  placeholder="John Doe"
                  required
                  maxLength={50}
                />
              </div>
            </div>
            <div>
              <label className="text-sm text-surface-300 mb-1 block">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={updateField('email')}
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-4 py-2.5 text-white placeholder:text-surface-500 focus:outline-none focus:border-brand-500"
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label className="text-sm text-surface-300 mb-1 block">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={updateField('password')}
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-4 py-2.5 text-white placeholder:text-surface-500 focus:outline-none focus:border-brand-500"
                placeholder="At least 8 characters"
                required
                minLength={8}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-500 text-white py-2.5 rounded-lg font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={18} className="animate-spin" />}
              Create Account
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-surface-400">
            Already have an account?{' '}
            <Link href="/login" className="text-brand-400 hover:text-brand-300">
              Sign in
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
