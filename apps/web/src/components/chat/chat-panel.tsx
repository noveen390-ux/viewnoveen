'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { chatApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useRoomStore } from '@/stores/room-store';
import { formatDate, cn } from '@/lib/utils';
import { Send, Smile, Edit2, Trash2, Reply, MoreHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function ChatPanel() {
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const activeChannel = useRoomStore((s) => s.activeChannel);

  const { data, isLoading } = useQuery({
    queryKey: ['messages', activeChannel],
    queryFn: () => chatApi.getMessages(activeChannel!),
    enabled: !!activeChannel,
    refetchInterval: 2000,
  });

  const sendMutation = useMutation({
    mutationFn: chatApi.sendMessage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', activeChannel] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (messageId: string) => chatApi.deleteMessage(messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', activeChannel] });
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !activeChannel) return;

    sendMutation.mutate({
      channelId: activeChannel,
      roomId: useRoomStore.getState().id,
      content: message.trim(),
      type: 'text',
    });
    setMessage('');
  };

  return (
    <div className="h-full flex flex-col bg-surface-900">
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-surface-500 text-sm">
            Loading messages...
          </div>
        ) : data?.data?.length ? (
          <AnimatePresence>
            {data.data.map((msg: any) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'group flex gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-800/50 transition-colors',
                  msg.senderId === user?.id ? 'flex-row-reverse' : '',
                )}
              >
                <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                  {msg.sender?.displayName?.charAt(0) || 'U'}
                </div>
                <div className={cn('flex-1 min-w-0', msg.senderId === user?.id ? 'items-end' : '')}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-white">
                      {msg.sender?.displayName || msg.sender?.username}
                    </span>
                    <span className="text-[10px] text-surface-500">
                      {formatDate(msg.createdAt)}
                    </span>
                    {msg.isEdited && (
                      <span className="text-[10px] text-surface-500">(edited)</span>
                    )}
                  </div>
                  <p className="text-sm text-surface-200 break-words">
                    {msg.isDeleted ? (
                      <span className="italic text-surface-500">[deleted]</span>
                    ) : (
                      msg.content
                    )}
                  </p>
                </div>
                {msg.senderId === user?.id && !msg.isDeleted && (
                  <div className="hidden group-hover:flex items-center gap-1">
                    <button
                      onClick={() => deleteMutation.mutate(msg.id)}
                      className="text-surface-500 hover:text-red-400 p-0.5"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        ) : (
          <div className="flex items-center justify-center h-full text-surface-500 text-sm">
            No messages yet. Start the conversation!
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="p-3 border-t border-surface-800">
        <div className="flex items-center gap-2 bg-surface-800 rounded-lg px-3 py-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={`Message #${useRoomStore.getState().channels.find((c) => c.id === activeChannel)?.name || 'general'}`}
            className="flex-1 bg-transparent text-white placeholder:text-surface-500 focus:outline-none text-sm"
            maxLength={4000}
          />
          <button
            type="submit"
            disabled={!message.trim()}
            className="text-brand-400 hover:text-brand-300 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Send size={18} />
          </button>
        </div>
      </form>
    </div>
  );
}
