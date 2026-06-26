/**
 * POST /api/wechat/start
 * Start a bot for a supplier (shows QR if no saved session).
 * Body: { supplierId, supplierName }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { startSupplierBot, setMessageCallback } from '@/lib/wechat/manager';
import { translateToRussian } from '@/lib/deepseek/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Register global message handler once
setMessageCallback(async (supplierId, wechatUserId, text, _raw) => {
  const supabase = createServiceClient();

  // Find chat by supplier external_id
  const { data: chat } = await supabase
    .from('chats')
    .upsert(
      {
        chat_type: 'wechat',
        external_id: wechatUserId,
        last_message_at: new Date().toISOString(),
      },
      { onConflict: 'chat_type,external_id' }
    )
    .select()
    .single();

  if (!chat) return;

  // Translate to Russian
  let translated: string | null = null;
  try {
    translated = await translateToRussian(text);
  } catch {}

  // Save message
  await supabase.from('messages').insert({
    chat_id: chat.id,
    direction: 'incoming',
    content: text,
    content_translated: translated,
    media_type: 'none',
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

  // Update deal status if applicable
  const { data: deal } = await supabase
    .from('deals')
    .select('id, status')
    .eq('supplier_chat_id', chat.id)
    .in('status', ['sent_to_supplier', 'waiting'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (deal) {
    await supabase.from('deals').update({ status: 'answer_received' }).eq('id', deal.id);
    await supabase.from('deal_status_history').insert({
      deal_id: deal.id,
      old_status: deal.status,
      new_status: 'answer_received',
      comment: 'Получен ответ от поставщика через WeChat SDK',
    });
  }

  await supabase.from('logs').insert({
    level: 'info',
    source: 'wechat',
    message: `Message from ${wechatUserId} via supplier ${supplierId}`,
    metadata: { chat_id: chat.id, text: text.slice(0, 100) },
  });
});

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { supplierId, supplierName } = await req.json() as {
    supplierId: string;
    supplierName: string;
  };

  let qrUrl: string | null = null;
  let wechatUserId: string | null = null;

  try {
    const session = await startSupplierBot(
      supplierId,
      supplierName,
      (url) => { qrUrl = url; },
      (uid) => { wechatUserId = uid; }
    );

    // Update supplier session status in DB
    const serviceSupabase = createServiceClient();
    await serviceSupabase
      .from('suppliers')
      .update({
        session_status: session.status === 'active' ? 'active' : 'inactive',
        session_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq('id', supplierId);

    return NextResponse.json({
      status: session.status,
      qrUrl: session.qrUrl,
      wechatUserId: session.wechatUserId,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
