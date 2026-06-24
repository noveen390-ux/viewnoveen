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
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl"
      >
        <div className="surface-card p-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">Create a Room</h1>
          <p className="text-muted-foreground mb-8">Set up your watch party room</p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">Room Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring"
                placeholder="Movie Night with Friends"
                maxLength={100}
                required
              />
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">Description (optional)</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring resize-none h-24"
                placeholder="What are we watching?"
                maxLength={500}
              />
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Room Type</label>
              <div className="grid grid-cols-3 gap-3">
                {roomTypes.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, type: type.value }))}
                    className={cn(
                      'p-3 rounded-lg border text-left transition-all',
                      form.type === type.value
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-surface hover:border-muted-foreground',
                    )}
                  >
                    <div className="text-sm font-medium text-foreground">{type.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{type.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Privacy</label>
              <div className="grid grid-cols-3 gap-3">
                {privacyOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, privacy: opt.value }))}
                    className={cn(
                      'p-3 rounded-lg border text-left transition-all',
                      form.privacy === opt.value
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-surface hover:border-muted-foreground',
                    )}
                  >
                    <opt.icon className={cn(
                      'w-5 h-5 mb-1',
                      form.privacy === opt.value ? 'text-primary' : 'text-muted-foreground',
                    )} />
                    <div className="text-sm font-medium text-foreground">{opt.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">
                Max Participants: {form.maxParticipants}
              </label>
              <input
                type="range"
                min={1}
                max={500}
                value={form.maxParticipants}
                onChange={(e) => setForm((p) => ({ ...p, maxParticipants: parseInt(e.target.value) }))}
                className="w-full accent-primary"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:opacity-90 text-primary-foreground py-3 rounded-xl font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
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
