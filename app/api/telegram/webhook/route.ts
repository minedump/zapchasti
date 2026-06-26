import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { buildQuestionnairePrompt, runQuestionnaireStep } from '@/lib/deepseek/client';
import { sendTelegramMessage } from '@/lib/telegram/bot';
import type {
  TelegramUpdate,
  QuestionnaireState,
  DbChat,
  DbUser,
  TemplateField,
} from '@/lib/types';
import { generateDealNumber } from '@/lib/utils/helpers';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // Verify secret token
  const secret = req.headers.get('x-telegram-bot-api-secret-token');
  if (
    process.env.TELEGRAM_WEBHOOK_SECRET &&
    secret !== process.env.TELEGRAM_WEBHOOK_SECRET
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const message = update.message;
  if (!message || !message.from) {
    return NextResponse.json({ ok: true });
  }

  const supabase = createServiceClient();

  try {
    // 1. Upsert user
    const tgUser = message.from;
    const displayName = [
      tgUser.first_name,
      tgUser.last_name,
    ]
      .filter(Boolean)
      .join(' ');

    const { data: user } = await supabase
      .from('users')
      .upsert(
        {
          telegram_id: tgUser.id,
          username: tgUser.username || null,
          display_name: displayName,
          role: 'client',
        },
        { onConflict: 'telegram_id' }
      )
      .select()
      .single<DbUser>();

    if (!user) throw new Error('Failed to upsert user');

    // 2. Upsert chat
    const { data: chat } = await supabase
      .from('chats')
      .upsert(
        {
          chat_type: 'telegram',
          external_id: String(message.chat.id),
          user_id: user.id,
          last_message_at: new Date().toISOString(),
        },
        { onConflict: 'chat_type,external_id' }
      )
      .select()
      .single<DbChat>();

    if (!chat) throw new Error('Failed to upsert chat');

    // 3. Save incoming message
    const text = message.text || message.caption || '';
    await supabase.from('messages').insert({
      chat_id: chat.id,
      direction: 'incoming',
      content: text,
      media_type: message.photo ? 'photo' : message.document ? 'document' : 'none',
    });

    // 4. Update unread count
    await supabase
      .from('chats')
      .update({
        last_message_at: new Date().toISOString(),
        unread_count: (chat.unread_count || 0) + 1,
      })
      .eq('id', chat.id);

    // 5. Get or create questionnaire state
    const { data: qsData } = await supabase
      .from('questionnaire_states')
      .select('*')
      .eq('chat_id', chat.id)
      .single();

    // If questionnaire is complete, just save message and return
    if (qsData?.is_complete) {
      return NextResponse.json({ ok: true });
    }

    // 6. Get active template
    const { data: template } = await supabase
      .from('templates')
      .select('*')
      .eq('is_active', true)
      .single();

    if (!template) {
      await sendTelegramMessage(
        message.chat.id,
        'Извините, система временно недоступна. Попробуйте позже.'
      );
      return NextResponse.json({ ok: true });
    }

    const fields = template.schema.fields as TemplateField[];
    const systemPrompt = buildQuestionnairePrompt(fields);

    // 7. Build conversation history
    let state: QuestionnaireState;
    if (!qsData) {
      // First message — create state
      state = {
        chat_id: chat.id,
        deal_id: null,
        messages: [{ role: 'system', content: systemPrompt }],
        current_field: null,
        retry_count: 0,
        filled_data: {},
        is_complete: false,
      };

      // Greeting
      const greeting =
        'Здравствуйте! Я помогу вам найти нужную автозапчасть. Давайте начнём — какая марка вашего автомобиля?';
      await sendTelegramMessage(message.chat.id, greeting);

      state.messages.push({ role: 'assistant', content: greeting });
      state.messages.push({ role: 'user', content: text });
    } else {
      state = {
        chat_id: chat.id,
        deal_id: qsData.deal_id,
        messages: qsData.messages as QuestionnaireState['messages'],
        current_field: qsData.current_field,
        retry_count: qsData.retry_count,
        filled_data: qsData.filled_data,
        is_complete: false,
      };
    }

    // 8. Run AI step
    const { reply, dealJson } = await runQuestionnaireStep(
      state.messages,
      text
    );

    // 9. Send reply to user (strip JSON tags)
    const cleanReply = reply
      .replace(/<DEAL_JSON>[\s\S]*?<\/DEAL_JSON>/g, '')
      .trim();

    if (cleanReply) {
      await sendTelegramMessage(message.chat.id, cleanReply);
    }

    // 10. Update state
    state.messages.push({ role: 'assistant', content: reply });

    if (dealJson) {
      // Questionnaire complete — create deal
      const dealNumber = generateDealNumber();
      const { data: deal } = await supabase
        .from('deals')
        .insert({
          deal_number: dealNumber,
          client_chat_id: chat.id,
          status: 'new',
          data: dealJson,
          template_version: template.version,
          created_by: 'client',
        })
        .select()
        .single();

      if (deal) {
        // Save deal status history
        await supabase.from('deal_status_history').insert({
          deal_id: deal.id,
          old_status: null,
          new_status: 'new',
          comment: 'Заявка создана через Telegram-бот',
        });

        state.deal_id = deal.id;
        state.is_complete = true;

        // Notify user
        await sendTelegramMessage(
          message.chat.id,
          `✅ Ваша заявка <b>${dealNumber}</b> принята! Мы свяжемся с поставщиком и сообщим вам о результате.`
        );

        // Trigger supplier routing (via Inngest or direct)
        await triggerSupplierRouting(deal.id, dealJson.brand || '', supabase);
      }
    }

    // 11. Save/update questionnaire state
    await supabase.from('questionnaire_states').upsert(
      {
        chat_id: chat.id,
        deal_id: state.deal_id,
        messages: state.messages,
        current_field: state.current_field,
        retry_count: state.retry_count,
        filled_data: state.filled_data,
        is_complete: state.is_complete,
      },
      { onConflict: 'chat_id' }
    );

    // Log
    await supabase.from('logs').insert({
      level: 'info',
      source: 'telegram',
      message: `Message from ${displayName} (${tgUser.id})`,
      metadata: { chat_id: chat.id, text: text.slice(0, 100) },
    });
  } catch (err) {
    console.error('[Telegram Webhook Error]', err);
    await supabase.from('logs').insert({
      level: 'error',
      source: 'telegram',
      message: String(err),
      metadata: { update_id: update.update_id },
    });
  }

  return NextResponse.json({ ok: true });
}

async function triggerSupplierRouting(
  dealId: string,
  brand: string,
  supabase: ReturnType<typeof createServiceClient>
) {
  // Find supplier by brand
  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('*, chat:chats(*)')
    .eq('is_active', true)
    .eq('session_status', 'active')
    .contains('brands', [brand.toLowerCase()]);

  if (!suppliers || suppliers.length === 0) {
    // No supplier found — notify operators via realtime (deal stays 'new')
    return;
  }

  // Pick first matching supplier
  const supplier = suppliers[0];

  // Update deal with supplier chat
  await supabase
    .from('deals')
    .update({
      supplier_chat_id: supplier.chat_id,
      status: 'sent_to_supplier',
    })
    .eq('id', dealId);

  await supabase.from('deal_status_history').insert({
    deal_id: dealId,
    old_status: 'new',
    new_status: 'sent_to_supplier',
    comment: `Автоматически назначен поставщик: ${supplier.name}`,
  });
}
