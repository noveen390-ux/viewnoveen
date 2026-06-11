'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { roomsApi } from '@/lib/api';
import { motion } from 'framer-motion';
import { Loader2, Globe, Lock, Users } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const roomTypes = [
  { value: 'watch', label: 'Watch Party', desc: 'Watch videos together' },
  { value: 'music', label: 'Music Session', desc: 'Listen to music together' },
  { value: 'social', label: 'Social', desc: 'Just hang out' },
];

const privacyOptions = [
  { value: 'public', icon: Globe, label: 'Public', desc: 'Anyone can find and join' },
  { value: 'private', icon: Lock, label: 'Private', desc: 'Only invited users can join' },
  { value: 'friends', icon: Users, label: 'Friends', desc: 'Only friends can join' },
];

export default function CreateRoomPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    type: 'watch' as string,
    privacy: 'public' as string,
    maxParticipants: 50,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Room name is required');
      return;
    }
    setLoading(true);
    try {
      const { data } = await roomsApi.create(form);
      toast.success('Room created!');
      router.push(`/rooms/${data.id}`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to create room');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-surface-950 via-surface-900 to-surface-950 flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl"
      >
        <div className="bg-surface-900/50 border border-surface-800 rounded-2xl p-8">
          <h1 className="text-2xl font-bold text-white mb-2">Create a Room</h1>
          <p className="text-surface-400 mb-8">Set up your watch party room</p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="text-sm text-surface-300 mb-1.5 block">Room Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-4 py-2.5 text-white placeholder:text-surface-500 focus:outline-none focus:border-brand-500"
                placeholder="Movie Night with Friends"
                maxLength={100}
                required
              />
            </div>

            <div>
              <label className="text-sm text-surface-300 mb-1.5 block">Description (optional)</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-4 py-2.5 text-white placeholder:text-surface-500 focus:outline-none focus:border-brand-500 resize-none h-24"
                placeholder="What are we watching?"
                maxLength={500}
              />
            </div>

            <div>
              <label className="text-sm text-surface-300 mb-2 block">Room Type</label>
              <div className="grid grid-cols-3 gap-3">
                {roomTypes.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, type: type.value }))}
                    className={cn(
                      'p-3 rounded-lg border text-left transition-all',
                      form.type === type.value
                        ? 'border-brand-500 bg-brand-600/10'
                        : 'border-surface-700 bg-surface-800 hover:border-surface-600',
                    )}
                  >
                    <div className="text-sm font-medium text-white">{type.label}</div>
                    <div className="text-xs text-surface-400 mt-0.5">{type.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm text-surface-300 mb-2 block">Privacy</label>
              <div className="grid grid-cols-3 gap-3">
                {privacyOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, privacy: opt.value }))}
                    className={cn(
                      'p-3 rounded-lg border text-left transition-all',
                      form.privacy === opt.value
                        ? 'border-brand-500 bg-brand-600/10'
                        : 'border-surface-700 bg-surface-800 hover:border-surface-600',
                    )}
                  >
                    <opt.icon className={cn(
                      'w-5 h-5 mb-1',
                      form.privacy === opt.value ? 'text-brand-400' : 'text-surface-400',
                    )} />
                    <div className="text-sm font-medium text-white">{opt.label}</div>
                    <div className="text-xs text-surface-400 mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm text-surface-300 mb-1.5 block">
                Max Participants: {form.maxParticipants}
              </label>
              <input
                type="range"
                min={1}
                max={500}
                value={form.maxParticipants}
                onChange={(e) => setForm((p) => ({ ...p, maxParticipants: parseInt(e.target.value) }))}
                className="w-full accent-brand-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-500 text-white py-3 rounded-xl font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={18} className="animate-spin" />}
              Create Room
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
