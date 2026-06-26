import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { sendToWeChat, sendMediaToWeChat } from '@/lib/wechat/manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  const serviceSupabase = createServiceClient();

  // Get chat external_id (WeChat user ID) and supplier
  const { data: chat } = await serviceSupabase
    .from('chats')
    .select('external_id')
    .eq('id', chatId)
    .single();

  if (!chat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 });

  const { data: supplier } = await serviceSupabase
    .from('suppliers')
    .select('id')
    .eq('chat_id', chatId)
    .single();

  if (!supplier) {
    return NextResponse.json({ error: 'No supplier linked to this chat' }, { status: 400 });
  }

  try {
    if (mediaUrl) {
      await sendMediaToWeChat(supplier.id, chat.external_id, mediaUrl, content);
    } else {
      await sendToWeChat(supplier.id, chat.external_id, content);
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 503 });
  }

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
