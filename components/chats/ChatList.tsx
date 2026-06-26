'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { DbChat, ChatFilter } from '@/lib/types';
import { cn, formatRelativeTime, truncate, getInitials } from '@/lib/utils/helpers';
import { Search, MessageSquare, Building2 } from 'lucide-react';

interface ChatListProps {
  selectedChatId: string | null;
  onSelectChat: (chat: DbChat) => void;
}

const FILTERS: { value: ChatFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'telegram', label: 'Клиенты' },
  { value: 'wechat', label: 'Поставщики' },
  { value: 'unread', label: 'Непрочитанные' },
];

export default function ChatList({ selectedChatId, onSelectChat }: ChatListProps) {
  const [chats, setChats] = useState<DbChat[]>([]);
  const [filter, setFilter] = useState<ChatFilter>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchChats = useCallback(async () => {
    const params = new URLSearchParams();
    if (filter === 'telegram') params.set('type', 'telegram');
    if (filter === 'wechat') params.set('type', 'wechat');
    if (filter === 'unread') params.set('unread', 'true');
    if (search) params.set('search', search);

    const res = await fetch(`/api/chats?${params}`);
    const json = await res.json() as { data: DbChat[] };
    setChats(json.data || []);
    setLoading(false);
  }, [filter, search]);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('chats-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chats' },
        () => fetchChats()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase, fetchChats]);

  return (
    <div className="flex flex-col h-full border-r border-gray-200 bg-white w-80 shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900 mb-3">Чаты</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1 px-4 py-2 border-b border-gray-100 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
              filter === f.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-10 h-10 bg-gray-200 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : chats.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            Чаты не найдены
          </div>
        ) : (
          chats.map((chat) => (
            <ChatItem
              key={chat.id}
              chat={chat}
              isSelected={chat.id === selectedChatId}
              onClick={() => onSelectChat(chat)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ChatItem({
  chat,
  isSelected,
  onClick,
}: {
  chat: DbChat;
  isSelected: boolean;
  onClick: () => void;
}) {
  const isTelegram = chat.chat_type === 'telegram';
  const name = chat.user?.display_name || chat.user?.username || chat.external_id;
  const initials = getInitials(name);

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-50',
        isSelected && 'bg-blue-50 border-blue-100'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0',
          isTelegram ? 'bg-blue-500' : 'bg-green-500'
        )}
      >
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-gray-900 truncate">{name}</span>
          <div className="flex items-center gap-1 shrink-0">
            {isTelegram ? (
              <MessageSquare className="w-3 h-3 text-blue-400" />
            ) : (
              <Building2 className="w-3 h-3 text-green-400" />
            )}
            {chat.last_message_at && (
              <span className="text-xs text-gray-400">
                {formatRelativeTime(chat.last_message_at)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-xs text-gray-500 truncate">
            {isTelegram ? 'Клиент' : 'Поставщик'}
          </span>
          {chat.unread_count > 0 && (
            <span className="bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
              {chat.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
