'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { DbChat, DbMessage, DbDeal } from '@/lib/types';
import { cn, formatDateTime, getInitials } from '@/lib/utils/helpers';
import {
  Send,
  Paperclip,
  MessageSquare,
  Building2,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';

interface ChatWindowProps {
  chat: DbChat;
}

export default function ChatWindow({ chat }: ChatWindowProps) {
  const [messages, setMessages] = useState<DbMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deal, setDeal] = useState<DbDeal | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const isTelegram = chat.chat_type === 'telegram';
  const name = chat.user?.display_name || chat.user?.username || chat.external_id;

  const fetchMessages = useCallback(async () => {
    const res = await fetch(`/api/chats/${chat.id}/messages`);
    const json = await res.json() as { data: DbMessage[] };
    setMessages(json.data || []);
    setLoading(false);
  }, [chat.id]);

  const fetchDeal = useCallback(async () => {
    const { data } = await supabase
      .from('deals')
      .select('id, deal_number, status')
      .or(`client_chat_id.eq.${chat.id},supplier_chat_id.eq.${chat.id}`)
      .not('status', 'in', '(closed,rejected)')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    setDeal(data as DbDeal | null);
  }, [chat.id, supabase]);

  useEffect(() => {
    fetchMessages();
    fetchDeal();
  }, [fetchMessages, fetchDeal]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`messages-${chat.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chat.id}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as DbMessage]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [chat.id, supabase]);

  async function handleSend() {
    if (!input.trim() || sending) return;
    setSending(true);

    const endpoint = isTelegram ? '/api/telegram/send' : '/api/wechat/send';
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: chat.id,
        content: input.trim(),
        dealId: deal?.id,
      }),
    });

    setInput('');
    setSending(false);
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-medium',
              isTelegram ? 'bg-blue-500' : 'bg-green-500'
            )}
          >
            {getInitials(name)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900">{name}</span>
              {isTelegram ? (
                <MessageSquare className="w-4 h-4 text-blue-400" />
              ) : (
                <Building2 className="w-4 h-4 text-green-400" />
              )}
            </div>
            <span className="text-xs text-gray-500">
              {isTelegram ? 'Telegram · Клиент' : 'WeChat · Поставщик'}
            </span>
          </div>
        </div>

        {/* Deal link */}
        {deal && (
          <Link
            href={`/deals/${deal.id}`}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100 transition-colors"
          >
            <span className="font-medium">{deal.deal_number}</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-400 text-sm">Загрузка...</div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-400 text-sm">Нет сообщений</div>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-gray-200">
        <div className="flex items-end gap-3">
          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Написать сообщение... (Enter — отправить)"
              rows={1}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 max-h-32"
              style={{ minHeight: '44px' }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: DbMessage }) {
  const isOutgoing = message.direction === 'outgoing';

  return (
    <div className={cn('flex', isOutgoing ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[70%] rounded-2xl px-4 py-2.5',
          isOutgoing
            ? 'bg-blue-600 text-white rounded-br-sm'
            : 'bg-gray-100 text-gray-900 rounded-bl-sm'
        )}
      >
        {message.media_url && (
          <a
            href={message.media_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs underline mb-1 opacity-80"
          >
            <Paperclip className="w-3 h-3" />
            Вложение
          </a>
        )}
        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
        {message.content_translated && (
          <p
            className={cn(
              'text-xs mt-1 pt-1 border-t opacity-70',
              isOutgoing ? 'border-blue-400' : 'border-gray-300'
            )}
          >
            🇷🇺 {message.content_translated}
          </p>
        )}
        <p
          className={cn(
            'text-xs mt-1 text-right',
            isOutgoing ? 'text-blue-200' : 'text-gray-400'
          )}
        >
          {formatDateTime(message.created_at)}
        </p>
      </div>
    </div>
  );
}
