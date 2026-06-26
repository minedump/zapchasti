import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendTelegramMessage, sendTelegramPhoto } from '@/lib/telegram/bot';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    chatId: string;
    content: string;
    mediaUrl?: string;
    dealId?: string;
  };

  const { chatId, content, mediaUrl, dealId } = body;

  // Get chat external_id
  const { data: chat } = await supabase
    .from('chats')
    .select('external_id')
    .eq('id', chatId)
    .single();

  if (!chat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 });

  const telegramChatId = Number(chat.external_id);

  if (mediaUrl) {
    await sendTelegramPhoto(telegramChatId, mediaUrl, content);
  } else {
    await sendTelegramMessage(telegramChatId, content);
  }

  // Save outgoing message
  const serviceSupabase = (await import('@/lib/supabase/server')).createServiceClient();
  await serviceSupabase.from('messages').insert({
    chat_id: chatId,
    deal_id: dealId || null,
    sender_id: user.id,
    direction: 'outgoing',
    content,
    media_url: mediaUrl || null,
    media_type: mediaUrl ? 'photo' : 'none',
    is_read: true,
  });

  await serviceSupabase
    .from('chats')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', chatId);

  return NextResponse.json({ ok: true });
}
