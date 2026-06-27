﻿﻿﻿import { WeChatBot } from '@wechatbot/wechatbot';
import path from 'path';
import os from 'os';
import { createServiceClient } from '../supabase/service';

export interface BotSession {
  supplierId: string;
  supplierName: string;
  bot: WeChatBot;
  status: 'pending_qr' | 'scanned' | 'online' | 'offline' | 'error' | 'active' | 'expired';
  qrUrl: string | null;
  wechatUserId: string | null;
}

const WECHAT_SESSIONS_KEY = Symbol.for('kodik.wechat.sessions');

if (!(global as any)[WECHAT_SESSIONS_KEY]) {
  (global as any)[WECHAT_SESSIONS_KEY] = new Map<string, BotSession>();
}

const sessions: Map<string, BotSession> = (global as any)[WECHAT_SESSIONS_KEY];

type MessageCallback = (supplierId: string, userId: string, text: string, raw: unknown) => Promise<void>;
let globalMessageCallback: MessageCallback | null = null;

export function setMessageCallback(cb: MessageCallback) {
  globalMessageCallback = cb;
}

export async function generateAndSaveQR(supplierId: string, supplierName: string): Promise<string> {
  console.log(`[WeChat] Generating QR for ${supplierName}...`);
  
  return new Promise((resolve, reject) => {
    const save = async (url: string) => {
      console.log(`[WeChat] Saving URL to DB: ${url}`);
      clearTimeout(timeout);
      await updateDbStatus(supplierId, 'pending_qr', url);
      bot.stop();
      resolve(url);
    };

    const bot = new WeChatBot({
      storageDir: `./.wechatbot/temp_${supplierId}`,
      loginCallbacks: {
        onQrUrl: async (url: string) => {
          console.log(`[WeChat] SUCCESS (onQrUrl): Got URL: ${url}`);
          await save(url);
        }
      }
    });

    // Listen to events as well, as callbacks might be unreliable in this SDK version
    // @ts-ignore
    bot.on('qr', async (url: string) => {
      console.log(`[WeChat] SUCCESS (event qr): Got URL: ${url}`);
      await save(url);
    });

    // @ts-ignore
    bot.on('qrUrl', async (url: string) => {
      console.log(`[WeChat] SUCCESS (event qrUrl): Got URL: ${url}`);
      await save(url);
    });

    const timeout = setTimeout(() => {
      bot.stop();
      reject(new Error('Timeout getting QR from WeChat'));
    }, 60000);

    bot.login().catch(err => {
      clearTimeout(timeout);
      bot.stop();
      reject(err);
    });
  });
}

export async function startSupplierBot(
  supplierId: string,
  supplierName: string,
  onQrUrl: (url: string) => void,
  onActive: (wechatUserId: string) => void
): Promise<BotSession> {
  const existing = sessions.get(supplierId);
  if (existing && (existing.status === 'active' || existing.status === 'online')) return existing;

  const storagePath = path.join(os.homedir(), '.wechatbot', supplierId);
  const session: BotSession = {
    supplierId,
    supplierName,
    bot: null as unknown as WeChatBot,
    status: 'offline',
    qrUrl: null,
    wechatUserId: null,
  };

  const bot = new WeChatBot({ storageDir: storagePath });
  session.bot = bot;
  sessions.set(supplierId, session);

  bot.on('login', async (creds) => {
    session.status = 'active';
    session.wechatUserId = creds.userId;
    onActive(creds.userId);
    await updateDbStatus(supplierId, 'online', null, creds.userId);
  });

  bot.onMessage(async (msg) => {
    if (globalMessageCallback) {
      await globalMessageCallback(supplierId, msg.userId, msg.text || '[media]', msg.raw);
    }
  });

  bot.run().catch(() => {});
  return session;
}

export async function sendToWeChat(supplierId: string, wechatUserId: string, text: string): Promise<void> {
  const session = sessions.get(supplierId);
  if (!session) throw new Error(`No session for ${supplierId}`);
  await session.bot.send(wechatUserId, text);
}

export async function sendMediaToWeChat(supplierId: string, wechatUserId: string, mediaUrl: string, caption?: string): Promise<void> {
  const session = sessions.get(supplierId);
  if (!session) throw new Error(`No session for ${supplierId}`);
  await session.bot.send(wechatUserId, { url: mediaUrl, caption });
}

export function getSession(id: string) { return sessions.get(id); }
export function getAllSessions() { return Array.from(sessions.values()); }
export function stopBot(id: string) {
  const s = sessions.get(id);
  if (s) { s.bot.stop(); sessions.delete(id); }
}

async function updateDbStatus(supplierId: string, status: string, qrUrl: string | null = null, wechatUserId: string | null = null) {
  try {
    const supabase = createServiceClient();
    const updateData: any = { session_status: status };
    if (qrUrl !== null) updateData.qr_url = qrUrl;
    if (wechatUserId !== null) updateData.wechat_user_id = wechatUserId;
    await supabase.from('suppliers').update(updateData).eq('id', supplierId);
  } catch (err) {
    console.error(`[WeChatManager] DB Error:`, err);
  }
}