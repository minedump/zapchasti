﻿import { WeChatBot } from '@wechatbot/wechatbot';
import { createServiceClient } from '../supabase/service';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Реестр запущенных ботов в глобальной области видимости для Next.js HMR
const WECHAT_BOTS_KEY = Symbol.for('kodik.wechat.bots');
if (!(global as any)[WECHAT_BOTS_KEY]) {
  (global as any)[WECHAT_BOTS_KEY] = new Map<string, WeChatBot>();
}
const activeBots: Map<string, WeChatBot> = (global as any)[WECHAT_BOTS_KEY];

/**
 * Запускает инстанс бота для конкретного поставщика и возвращает QR-ссылку.
 */
export async function startSupplierBot(supplierId: string, supplierName: string): Promise<string> {
  const existing = activeBots.get(supplierId);
  
  return new Promise((resolve, reject) => {
    const storageDir = path.join(os.tmpdir(), `wechatbot_${supplierId}`);
    if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

    const bot = existing || new WeChatBot({ storageDir });

    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for QR from WeChat'));
    }, 45000);

    const onQr = async (url: string) => {
      clearTimeout(timeout);
      console.log(`[WeChatManager] QR URL ready for ${supplierName}: ${url}`);
      await updateDbStatus(supplierId, 'pending_qr', url);
      resolve(url);
    };

    bot.login({
      // @ts-ignore
      callbacks: { 
        onQrUrl: onQr,
        onExpired: async () => {
          console.log(`[WeChatManager] QR expired for ${supplierName}`);
          await updateDbStatus(supplierId, 'expired', null);
          activeBots.delete(supplierId);
        }
      }
    }).catch(err => {
      clearTimeout(timeout);
      reject(err);
    });

    if (!existing) {
      bot.on('login', async (creds) => {
        console.log(`[WeChatManager] ${supplierName} logged in!`);
        await updateDbStatus(supplierId, 'active', null, creds.userId || creds.accountId, creds);
      });
      
      bot.on('message', async (msg) => {
        await handleIncomingMessage(supplierId, msg);
      });

      bot.start().catch(() => {});
      activeBots.set(supplierId, bot);
    }
  });
}

/**
 * Инициализация всех активных ботов при старте сервера
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
      const storageDir = path.join(os.tmpdir(), `wechatbot_${s.id}`);
      if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
      
      fs.writeFileSync(
        path.join(storageDir, 'credentials.json'), 
        JSON.stringify(s.session_data)
      );

      const bot = new WeChatBot({ storageDir });
      
      bot.on('message', async (msg) => {
        await handleIncomingMessage(s.id, msg);
      });

      bot.run().catch(err => console.error(`[WeChat][${s.name}] Failed to restore:`, err));
      activeBots.set(s.id, bot);
    }
  } catch (err) {
    console.error(`[WeChat] Restore failed:`, err);
  }
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
    console.error(`[WeChat] Msg Handle Error:`, err);
  }
}

async function updateDbStatus(supplierId: string, status: string, qrUrl: string | null = null, wechatUserId: string | null = null, credentials: any = null) {
  try {
    const supabase = createServiceClient();
    const updateData: any = { session_status: status };
    if (qrUrl !== null) updateData.qr_url = qrUrl;
    if (wechatUserId !== null) updateData.wechat_user_id = wechatUserId;
    if (credentials !== null) updateData.session_data = credentials;
    
    await supabase.from('suppliers').update(updateData).eq('id', supplierId);
    console.log(`[DB] Updated ${supplierId} to ${status}`);
  } catch (err) {
    console.error(`[DB Error]`, err);
  }
}

export async function sendToWeChat(supplierId: string, wechatUserId: string, text: string) {
  const bot = activeBots.get(supplierId);
  if (!bot) throw new Error("Bot not running");
  await bot.send(wechatUserId, text);
}

export function getSession(id: string) { return activeBots.get(id); }
export function stopBot(id: string) {
  const b = activeBots.get(id);
  if (b) { b.stop(); activeBots.delete(id); }
}

export async function generateAndSaveQR(supplierId: string, supplierName: string) {
  return startSupplierBot(supplierId, supplierName);
}