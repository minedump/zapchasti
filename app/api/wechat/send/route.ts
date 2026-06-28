import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { sendToWeChat } from '@/lib/wechat/manager';

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { chatId, content, dealId } = body;

    const serviceSupabase = createServiceClient();
    
    // 1. Получаем данные чата
    const { data: chat } = await serviceSupabase
      .from('chats')
      .select('*, supplier:suppliers(id)')
      .eq('id', chatId)
      .single();

    if (!chat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 });

    // 2. Отправляем в WeChat
    // Нам нужен supplierId для выбора правильного бота
    const supplierId = chat.supplier?.id;
    if (!supplierId) return NextResponse.json({ error: 'Supplier not linked to this chat' }, { status: 400 });

    await sendToWeChat(supplierId, chat.external_id, content);

    // 3. Сохраняем исходящее сообщение в БД
    await serviceSupabase.from('messages').insert({
      chat_id: chatId,
      deal_id: dealId || null,
      sender_id: user.id,
      direction: 'outgoing',
      content
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[WeChat Send Error]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
