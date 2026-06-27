﻿import { WeChatBot } from '@wechatbot/wechatbot';
import { createServiceClient } from '../supabase/service';
import fs from 'fs';
import path from 'path';

/**
 * Генерирует QR-ссылку для поставщика и сохраняет её в БД.
 */
export async function generateAndSaveQR(supplierId: string, supplierName: string): Promise<string> {
  console.log(`[WeChat] Generating QR for ${supplierName}...`);
  
  return new Promise((resolve, reject) => {
    const storageDir = `./.wechatbot/temp_${supplierId}`;
    const bot = new WeChatBot({
      storageDir
    });

    const save = async (url: string) => {
      console.log(`[WeChat] SUCCESS: Got URL, saving to DB...`);
      clearTimeout(timeout);
      await updateDbStatus(supplierId, 'pending_qr', url);
      bot.stop();
      resolve(url);
    };

    const timeout = setTimeout(() => {
      bot.stop();
      reject(new Error('Timeout getting QR from WeChat'));
    }, 60000);

    // Обработка успешного сканирования и входа
    bot.on('login', async (creds) => {
      console.log(`[WeChat] Login success for ${supplierName}`);
      clearTimeout(timeout);
      
      // Сохраняем кредиты в БД
      await updateDbStatus(supplierId, 'active', null, creds.userId, creds);
      
      // Останавливаем бота и удаляем временные файлы
      bot.stop();
      try {
        if (fs.existsSync(storageDir)) {
          fs.rmSync(storageDir, { recursive: true, force: true });
        }
      } catch (e) {
        console.error(`[WeChat] Failed to clean temp storage:`, e);
      }
    });

    // Работающий способ: передача колбэков в login()
    bot.login({ 
      // @ts-ignore - SDK types are incomplete
      callbacks: {
        onQrUrl: save,
        onScan: save
      } 
    }).catch(err => {
      clearTimeout(timeout);
      bot.stop();
      reject(err);
    });
  });
}

async function updateDbStatus(supplierId: string, status: string, qrUrl: string | null = null, wechatUserId: string | null = null, credentials: any = null) {
  try {
    const supabase = createServiceClient();
    const updateData: any = {
      session_status: status,
      qr_url: qrUrl,
      wechat_user_id: wechatUserId,
      session_data: credentials
    };
    
    await supabase
      .from('suppliers')
      .update(updateData)
      .eq('id', supplierId);
      
    console.log(`[DB] Updated ${supplierId} to ${status}`);
  } catch (err) {
    console.error(`[DB Error]`, err);
  }
}

/**
 * Восстанавливает сессии всех активных поставщиков из БД.
 */
export async function restoreSessionsFromDb() {
  try {
    const supabase = createServiceClient();
    const { data: suppliers } = await supabase
      .from('suppliers')
      .select('*')
      .eq('session_status', 'active')
      .not('session_data', 'is', null);

    if (!suppliers) return;

    console.log(`[WeChat] Restoring ${suppliers.length} sessions...`);

    for (const s of suppliers) {
      const storageDir = `./.wechatbot/${s.id}`;
      
      // Создаем папку и файл кредитов, если их нет
      if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
      
      // SDK ожидает файл credentials.json внутри storageDir
      fs.writeFileSync(
        path.join(storageDir, 'credentials.json'), 
        JSON.stringify(s.session_data)
      );

      // Запускаем бота для этого поставщика
      const bot = new WeChatBot({ storageDir });
      
      bot.onMessage(async (msg) => {
        console.log(`[WeChat][${s.name}] New message from ${msg.userId}: ${msg.text}`);
        await handleIncomingMessage(s.id, msg);
      });

      bot.run().catch(err => console.error(`[WeChat][${s.name}] Failed to restore:`, err));
    }
  } catch (err) {
    console.error(`[WeChat] Restore failed:`, err);
  }
}

async function handleIncomingMessage(supplierId: string, msg: any) {
  try {
    const supabase = createServiceClient();
    
    // 1. Ищем или создаем чат
    const { data: chat } = await supabase
      .from('chats')
      .upsert({
        chat_type: 'wechat',
        external_id: msg.userId,
        last_message_at: new Date().toISOString()
      }, { onConflict: 'chat_type,external_id' })
      .select().single();

    if (!chat) return;

    // 2. Сохраняем сообщение
    await supabase.from('messages').insert({
      chat_id: chat.id,
      direction: 'incoming',
      content: msg.text || '',
      media_url: msg.url || null,
      media_type: msg.type === 'image' ? 'photo' : 'none'
    });

    console.log(`[WeChat] Message saved to DB for chat ${chat.id}`);
  } catch (err) {
    console.error(`[WeChat] Failed to handle message:`, err);
  }
}