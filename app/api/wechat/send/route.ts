import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { sendTextMessage, sendMediaMessage } from '@/lib/ilink/client';

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

  const serviceSupabase = createServiceClient();

  // Get chat and supplier session
  const { data: chat } = await serviceSupabase
    .from('chats')
    .select('external_id')
    .eq('id', chatId)
    .single();

  if (!chat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 });

  const { data: supplier } = await serviceSupabase
    .from('suppliers')
    .select('session_id')
    .eq('chat_id', chatId)
    .single();

  if (!supplier?.session_id) {
    return NextResponse.json({ error: 'No active session for this supplier' }, { status: 400 });
  }

  if (mediaUrl) {
    await sendMediaMessage({
      sessionId: supplier.session_id,
      to: chat.external_id,
      mediaUrl,
      caption: content,
    });
  } else {
    await sendTextMessage({
      sessionId: supplier.session_id,
      to: chat.external_id,
      text: content,
    });
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
