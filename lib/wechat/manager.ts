﻿import { WeChatBot } from '@wechatbot/wechatbot';
import { createServiceClient } from '../supabase/service';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Генерирует QR-ссылку для поставщика и сохраняет её в БД.
 */
export async function generateAndSaveQR(supplierId: string, supplierName: string): Promise<string> {
  console.log(`[WeChat] generateAndSaveQR called for ${supplierName}`);
  
  return new Promise((resolve, reject) => {
    // Используем системную временную папку для надежности
    const storageDir = path.join(os.tmpdir(), `wechat_temp_${supplierId}`);
    if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

    const bot = new WeChatBot({ storageDir });
    const credPath = path.join(storageDir, 'credentials.json');

    const checkInterval = setInterval(async () => {
      if (fs.existsSync(credPath)) {
        try {
          const content = fs.readFileSync(credPath, 'utf8');
          const creds = JSON.parse(content);
          
          if (creds && creds.token) {
            console.log(`[WeChat] SUCCESS: Credentials found for ${supplierName}`);
            clearInterval(checkInterval);
            clearTimeout(timeout);
            
            await updateDbStatus(supplierId, 'active', null, creds.userId || creds.accountId, creds);
            
            bot.stop();
            setTimeout(() => {
              try {
                if (fs.existsSync(storageDir)) fs.rmSync(storageDir, { recursive: true, force: true });
              } catch (e) {}
            }, 5000);
          }
        } catch (e) {}
      }
    }, 2000);

    const timeout = setTimeout(() => {
      clearInterval(checkInterval);
      bot.stop();
      reject(new Error('Timeout getting QR from WeChat'));
    }, 120000);

    const onQr = async (url: string) => {
      console.log(`[WeChat] Got URL for ${supplierName}`);
      await updateDbStatus(supplierId, 'pending_qr', url);
      resolve(url);
    };

    bot.login({ 
      // @ts-ignore
      callbacks: { 
        onQrUrl: onQr
      } 
    }).catch(err => {
      clearInterval(checkInterval);
      clearTimeout(timeout);
      bot.stop();
      reject(err);
    });
  });
}

const activeBots = new Map<string, WeChatBot>();

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
      await initBotInstance(s.id, s.name, s.session_data);
    }
  } catch (err) {
    console.error(`[WeChat] Restore failed:`, err);
  }
}

async function initBotInstance(id: string, name: string, sessionData: any) {
  const storageDir = `./.wechatbot/${id}`;
  if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
  
  fs.writeFileSync(
    path.join(storageDir, 'credentials.json'), 
    JSON.stringify(sessionData)
  );

  const bot = new WeChatBot({ storageDir });
  
  bot.onMessage(async (msg) => {
    console.log(`[WeChat][${name}] Message from ${msg.userId}: ${msg.text}`);
    await handleIncomingMessage(id, msg);
  });

  bot.run().catch(err => console.error(`[WeChat][${name}] Run error:`, err));
  activeBots.set(id, bot);
  return bot;
}

export async function sendToWeChat(supplierId: string, wechatUserId: string, text: string): Promise<void> {
  let bot = activeBots.get(supplierId);
  
  if (!bot) {
    const supabase = createServiceClient();
    const { data: s } = await supabase
      .from('suppliers')
      .select('*')
      .eq('id', supplierId)
      .single();

    if (s && s.session_data) {
      bot = await initBotInstance(s.id, s.name, s.session_data);
    } else {
      throw new Error(`No active session for supplier ${supplierId}`);
    }
  }

  await bot.send(wechatUserId, text);
}

async function handleIncomingMessage(supplierId: string, msg: any) {
  try {
    const supabase = createServiceClient();
    const { data: chat } = await supabase
      .from('chats')
      .upsert({
        chat_type: 'wechat',
        external_id: msg.userId,
        last_message_at: new Date().toISOString()
      }, { onConflict: 'chat_type,external_id' })
      .select().single();

    if (!chat) return;

    await supabase.from('messages').insert({
      chat_id: chat.id,
      direction: 'incoming',
      content: msg.text || '',
      media_url: msg.url || null,
      media_type: msg.type === 'image' ? 'photo' : 'none'
    });
  } catch (err) {
    console.error(`[WeChat] Failed to handle message:`, err);
  }
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
    
    await supabase.from('suppliers').update(updateData).eq('id', supplierId);
    console.log(`[DB] Updated ${supplierId} to ${status}`);
  } catch (err) {
    console.error(`[DB Error]`, err);
  }
}

export async function startSupplierBot() {}
export function getSession() { return undefined; }
export function stopBot() {}