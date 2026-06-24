'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { chatApi } from '@/lib/api';
import { getChatSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth-store';
import { useRoomStore } from '@/stores/room-store';
import { formatDate } from '@/lib/utils';
import { Send, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function ChatPanel() {
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const activeChannel = useRoomStore((s) => s.activeChannel);

  const { data, isLoading } = useQuery({
    queryKey: ['messages', activeChannel],
    queryFn: () => chatApi.getMessages(activeChannel!),
    enabled: !!activeChannel,
  });

  const [messages, setMessages] = useState<any[]>([]);

  useEffect(() => {
    setMessages([]);
  }, [activeChannel]);

  useEffect(() => {
    if (data?.data) {
      setMessages(data.data);
    }
  }, [data]);

  useEffect(() => {
    if (!activeChannel || !accessToken) return;

    const roomId = useRoomStore.getState().id;
    const socket = getChatSocket(accessToken ?? undefined);
    if (!socket.connected) socket.connect();
    socket.emit('chat:join', { roomId });

    const onMessage = (msg: any) => {
      if (msg.channelId === activeChannel) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    };
    socket.on('chat:message', onMessage);

    return () => {
      socket.off('chat:message', onMessage);
      socket.emit('chat:leave', { roomId });
    };
  }, [activeChannel, accessToken]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e?: React.FormEvent | React.KeyboardEvent) => {
    if (e) e.preventDefault();
    if (!message.trim() || !activeChannel) return;

    const roomId = useRoomStore.getState().id;
    const socket = getChatSocket(accessToken ?? undefined);
    socket.emit('chat:message', {
      channelId: activeChannel,
      roomId,
      content: message.trim(),
      type: 'text',
    });
    setMessage('');
  };

  const deleteMutation = useMutation({
    mutationFn: (messageId: string) => chatApi.deleteMessage(messageId),
    onSuccess: (_data, messageId) => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    },
  });

  return (
    <div className="flex h-full flex-col surface-card">
      <div className="border-b border-border px-4 py-3 text-sm font-semibold">
        Chat
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {isLoading && messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Loading messages...
          </div>
        ) : messages.length ? (
          <AnimatePresence initial={false}>
            {messages.map((msg: any) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-primary">
                    {msg.sender?.displayName || msg.sender?.username}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDate(msg.createdAt)}
                  </span>
                  {msg.isEdited && (
                    <span className="text-[10px] text-muted-foreground">(edited)</span>
                  )}
                </div>
                <p className="break-words text-sm text-foreground">
                  {msg.isDeleted ? (
                    <span className="italic text-muted-foreground">[deleted]</span>
                  ) : (
                    msg.content
                  )}
                </p>
                {msg.senderId === user?.id && !msg.isDeleted && (
                  <button
                    onClick={() => deleteMutation.mutate(msg.id)}
                    className="self-end text-muted-foreground hover:text-destructive p-0.5"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            No messages yet. Start the conversation!
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex items-center gap-2 border-t border-border p-3">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend(e)}
          placeholder={`Message #${useRoomStore.getState().channels.find((c) => c.id === activeChannel)?.name || 'general'}`}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring"
          maxLength={4000}
        />
        <button
          onClick={handleSend}
          disabled={!message.trim()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
