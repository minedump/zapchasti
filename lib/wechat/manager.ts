import { WeChatBot } from '@wechatbot/wechatbot';
import { createServiceClient } from '../supabase/service';
import fs from 'fs';
import path from 'path';

export interface BotSession {
  supplierId: string;
  supplierName: string;
  bot: WeChatBot;
  status: string;
}

// Реестр запущенных ботов
const activeBots = (global as any).wechatBots || new Map<string, WeChatBot>();
if (!(global as any).wechatBots) (global as any).wechatBots = activeBots;

/**
 * Запускает инстанс бота для конкретного поставщика.
 * Если бот уже запущен — возвращает его.
 */
export async function startSupplierBot(supplierId: string, supplierName: string) {
  if (activeBots.has(supplierId)) {
    console.log(`[WeChat] Bot for ${supplierName} already running`);
    return activeBots.get(supplierId);
  }

  const storageDir = path.resolve(`./.wechatbot/${supplierId}`);
  if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

  console.log(`[WeChat] Starting bot instance for ${supplierName}...`);

  const bot = new WeChatBot({
    storageDir,
    loginCallbacks: {
      onQrUrl: async (url) => {
        console.log(`[WeChat] QR URL for ${supplierName}: ${url}`);
        await updateDbStatus(supplierId, 'pending_qr', url);
      },
      onScanned: async () => {
        console.log(`[WeChat] ${supplierName} scanned QR`);
        await updateDbStatus(supplierId, 'scanned');
      },
      onExpired: async () => {
        console.log(`[WeChat] QR expired for ${supplierName}`);
        await updateDbStatus(supplierId, 'expired');
        activeBots.delete(supplierId);
      }
    }
  });

  // События после успешного входа
  bot.on('login', async (creds) => {
    console.log(`[WeChat] ${supplierName} logged in successfully!`);
    await updateDbStatus(supplierId, 'active', null, creds.userId || creds.accountId, creds);
  });

  bot.on('message', async (msg) => {
    console.log(`[WeChat][${supplierName}] Message from ${msg.userId}: ${msg.text}`);
    await handleIncomingMessage(supplierId, msg);
  });

  bot.on('error', (err) => {
    console.error(`[WeChat][${supplierName}] Error:`, err);
  });

  // Запускаем цикл бота
  bot.run().catch(err => {
    console.error(`[WeChat][${supplierName}] Failed to run:`, err);
    activeBots.delete(supplierId);
  });

  activeBots.set(supplierId, bot);
  return bot;
}

/**
 * Генерирует QR (просто обертка над стартом бота)
 */
export async function generateAndSaveQR(supplierId: string, supplierName: string): Promise<string> {
  await startSupplierBot(supplierId, supplierName);
  return "Bot started, check DB for QR URL";
}

/**
 * Инициализация всех активных ботов при старте сервера
 */
export async function restoreSessionsFromDb() {
  const supabase = createServiceClient();
  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('*')
    .eq('session_status', 'active');

  if (!suppliers) return;

  for (const s of suppliers) {
    await startSupplierBot(s.id, s.name);
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