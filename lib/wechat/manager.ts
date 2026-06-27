﻿﻿﻿/**
 * WeChat Bot Manager
 *
 * Manages multiple WeChatBot instances (one per supplier).
 * Uses @wechatbot/wechatbot Node.js SDK.
 */

import { WeChatBot } from '@wechatbot/wechatbot';
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

// Use a unique key for the global session map to avoid re-declaration issues in Next.js HMR
const WECHAT_SESSIONS_KEY = Symbol.for('kodik.wechat.sessions');

if (!(global as any)[WECHAT_SESSIONS_KEY]) {
  (global as any)[WECHAT_SESSIONS_KEY] = new Map<string, BotSession>();
}

const sessions: Map<string, BotSession> = (global as any)[WECHAT_SESSIONS_KEY];

// Callbacks registered by the webhook layer
type MessageCallback = (supplierId: string, userId: string, text: string, raw: unknown) => Promise<void>;
let globalMessageCallback: MessageCallback | null = null;

export function setMessageCallback(cb: MessageCallback) {
  globalMessageCallback = cb;
}

/**
 * Start a bot for a supplier.
 */
export async function startSupplierBot(
  supplierId: string,
  supplierName: string,
  onQrUrl: (url: string) => void,
  onActive: (wechatUserId: string) => void
): Promise<BotSession> {
  // If already running — return existing
  const existing = sessions.get(supplierId);
  if (existing && (existing.status === 'active' || existing.status === 'online' || existing.status === 'pending_qr')) {
    console.log(`[WeChatManager] Bot for ${supplierName} is already in state: ${existing.status}`);
    return existing;
  }

  console.log(`[WeChatManager] Initializing bot for supplier ${supplierName} (${supplierId})...`);

  const proxy = process.env.PROXY_URL || process.env.WECHAT_PROXY;
  const storagePath = path.join(os.homedir(), '.wechatbot', supplierId);
  
  const session: BotSession = {
    supplierId,
    supplierName,
    bot: null as unknown as WeChatBot,
    status: 'offline',
    qrUrl: null,
    wechatUserId: null,
  };

  try {
    const bot = new WeChatBot({
      storageDir: storagePath,
      loginCallbacks: {
        onQrUrl: async (url: string) => {
          console.log(`[WeChatManager] QR URL: ${url}`);
          session.qrUrl = url;
          session.status = 'pending_qr';
          onQrUrl(url);
          await updateDbStatus(supplierId, 'pending_qr', url);
        },
        onScanned: async () => {
          session.status = 'scanned';
          await updateDbStatus(supplierId, 'scanned');
        },
        onExpired: async () => {
          session.status = 'expired';
          session.qrUrl = null;
          await updateDbStatus(supplierId, 'inactive');
        }
      }
    });

    session.bot = bot;
    sessions.set(supplierId, session);

    bot.on('login', async (creds) => {
      console.log(`[WeChatManager] Login Success: ${supplierName}`);
      session.status = 'active';
      session.wechatUserId = creds.userId;
      onActive(creds.userId);
      await updateDbStatus(supplierId, 'online', null, creds.userId);
    });

    // Start the bot in background - NO RETRIES, NO PROXY
    bot.run().catch(err => {
      console.error(`[WeChatManager] Bot ${supplierName} stopped:`, err?.message || err);
      session.status = 'error';
      updateDbStatus(supplierId, 'error');
    });

    return session;
  } catch (error) {
    console.error(`[WeChatManager] Init error:`, error);
    sessions.delete(supplierId);
    throw error;
  }
}

export async function sendToWeChat(supplierId: string, wechatUserId: string, text: string): Promise<void> {
  const session = sessions.get(supplierId);
  if (!session) throw new Error(`No session for supplier ${supplierId}`);
  await session.bot.send(wechatUserId, text);
}

export async function sendMediaToWeChat(supplierId: string, wechatUserId: string, mediaUrl: string, caption?: string): Promise<void> {
  const session = sessions.get(supplierId);
  if (!session) throw new Error(`No session for supplier ${supplierId}`);
  await session.bot.send(wechatUserId, { url: mediaUrl, caption });
}

export function getSession(supplierId: string): BotSession | undefined {
  return sessions.get(supplierId);
}

export function getAllSessions(): BotSession[] {
  return Array.from(sessions.values());
}

export function stopBot(supplierId: string): void {
  const session = sessions.get(supplierId);
  if (session) {
    session.bot.stop();
    sessions.delete(supplierId);
  }
}

async function updateDbStatus(supplierId: string, status: string, qrUrl: string | null = null, wechatUserId: string | null = null) {
  try {
    console.log(`[WeChatManager] Updating DB: supplier=${supplierId}, status=${status}, hasQr=${!!qrUrl}`);
    const supabase = createServiceClient();
    const updateData: any = { session_status: status };
    if (qrUrl !== null) updateData.qr_url = qrUrl;
    if (wechatUserId !== null) updateData.wechat_user_id = wechatUserId;
    
    await supabase
      .from('suppliers')
      .update(updateData)
      .eq('id', supplierId);
  } catch (err) {
    console.error(`[WeChatManager] Failed to update DB status for ${supplierId}:`, err);
  }
}
