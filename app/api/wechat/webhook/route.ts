import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyWebhookSignature } from '@/lib/ilink/client';
import { translateToRussian } from '@/lib/deepseek/client';
import type { ILinkWebhookPayload } from '@/lib/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-ilink-signature') || '';

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: ILinkWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as ILinkWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = createServiceClient();

  try {
    // Find or create chat by wechat external_id (sender)
    const { data: chat } = await supabase
      .from('chats')
      .upsert(
        {
          chat_type: 'wechat',
          external_id: payload.from,
          last_message_at: new Date().toISOString(),
        },
        { onConflict: 'chat_type,external_id' }
      )
      .select()
      .single();

    if (!chat) throw new Error('Failed to upsert wechat chat');

    // Translate message to Russian
    let translated: string | null = null;
    if (payload.message && payload.message.trim()) {
      try {
        translated = await translateToRussian(payload.message);
      } catch (e) {
        console.error('Translation error:', e);
      }
    }

    // Save message
    await supabase.from('messages').insert({
      chat_id: chat.id,
      direction: 'incoming',
      content: payload.message,
      content_translated: translated,
      media_url: payload.media_url || null,
      media_type:
        payload.message_type === 'image'
          ? 'photo'
          : payload.message_type === 'file'
          ? 'document'
          : 'none',
      is_read: false,
    });

    // Update unread count
    await supabase
      .from('chats')
      .update({
        last_message_at: new Date().toISOString(),
        unread_count: (chat.unread_count || 0) + 1,
      })
      .eq('id', chat.id);

    // Find deal linked to this supplier chat and update status
    const { data: deal } = await supabase
      .from('deals')
      .select('id, status')
      .eq('supplier_chat_id', chat.id)
      .in('status', ['sent_to_supplier', 'waiting'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (deal && deal.status !== 'answer_received') {
      await supabase
        .from('deals')
        .update({ status: 'answer_received' })
        .eq('id', deal.id);

      await supabase.from('deal_status_history').insert({
        deal_id: deal.id,
        old_status: deal.status,
        new_status: 'answer_received',
        comment: 'Получен ответ от поставщика',
      });

      // Link message to deal
      await supabase
        .from('messages')
        .update({ deal_id: deal.id })
        .eq('chat_id', chat.id)
        .is('deal_id', null)
        .order('created_at', { ascending: false })
        .limit(1);
    }

    await supabase.from('logs').insert({
      level: 'info',
      source: 'wechat',
      message: `Message from WeChat: ${payload.from}`,
      metadata: { chat_id: chat.id, message: payload.message.slice(0, 100) },
    });
  } catch (err) {
    console.error('[WeChat Webhook Error]', err);
    await supabase.from('logs').insert({
      level: 'error',
      source: 'wechat',
      message: String(err),
    });
  }

  return NextResponse.json({ ok: true });
}
