'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import ChatList from '@/components/chats/ChatList';
import ChatWindow from '@/components/chats/ChatWindow';
import type { DbChat } from '@/lib/types';
import { MessageSquare } from 'lucide-react';

export default function ChatsPage() {
  const [selectedChat, setSelectedChat] = useState<DbChat | null>(null);

  return (
    <div className="flex h-full">
      <ChatList
        selectedChatId={selectedChat?.id || null}
        onSelectChat={setSelectedChat}
      />

      <div className="flex-1 overflow-hidden">
        {selectedChat ? (
          <ChatWindow chat={selectedChat} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <MessageSquare className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">Выберите чат для начала общения</p>
          </div>
        )}
      </div>
    </div>
  );
}
