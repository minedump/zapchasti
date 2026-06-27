/**
 * WeChat Bot Manager
 *
 * Manages multiple WeChatBot instances (one per supplier).
 * Uses @wechatbot/wechatbot Node.js SDK.
 */

import { WeChatBot } from '@wechatbot/wechatbot';
import path from 'path';
import os from 'os';
import { createServiceClient } from '../supabase/service';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

export interface BotSession {
  supplierId: string;
  supplierName: string;
  bot: WeChatBot;
  status: 'pending_qr' | 'scanned' | 'online' | 'offline' | 'error' | 'active' | 'expired';
  qrUrl: string | null;
  wechatUserId: string | null;
}

// Singleton map: supplierId -> BotSession
const sessions = (global as any).wechatSessions || new Map<string, BotSession>();
if (!(global as any).wechatSessions) {
  (global as any).wechatSessions = sessions;
}

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
  console.log(`[WeChatManager] Proxy status: ${proxy ? 'CONFIGURED' : 'NOT CONFIGURED'}`);
  
  const storagePath = path.join(os.homedir(), '.wechatbot', supplierId);
  
  if (proxy) {
    console.log(`[WeChatManager] Using proxy: ${proxy}`);
  }

  const session: BotSession = {
    supplierId,
    supplierName,
    bot: null as unknown as WeChatBot,
    status: 'offline',
    qrUrl: null,
    wechatUserId: null,
  };

  try {
    const proxy = process.env.PROXY_URL;
    const agent = proxy 
      ? (proxy.startsWith('socks') ? new SocksProxyAgent(proxy) : new HttpsProxyAgent(proxy))
      : undefined;

    const bot = new WeChatBot({
      storageDir: storagePath,
      // @ts-ignore - Passing custom agent for proxy support
      fetchOptions: agent ? {
        agent
      } : undefined,
      loginCallbacks: {
        onQrUrl: async (url) => {
          console.log(`[WeChatManager] SUCCESS: QR URL received for ${supplierName}: ${url}`);
          session.qrUrl = url;
          session.status = 'pending_qr';
          onQrUrl(url);
          await updateDbStatus(supplierId, 'pending_qr', url);
        },
        onScanned: async () => {
          console.log(`[WeChatManager] INFO: QR Scanned for ${supplierName}`);
          session.status = 'scanned';
          await updateDbStatus(supplierId, 'scanned');
        },
        onExpired: async () => {
          console.log(`[WeChatManager] WARN: QR Expired for ${supplierName}`);
          session.status = 'expired';
          session.qrUrl = null;
          await updateDbStatus(supplierId, 'inactive');
        }
      }
    });

    session.bot = bot;
    sessions.set(supplierId, session);

    bot.on('login', async (creds) => {
      console.log(`[WeChatManager] SUCCESS: Login complete for ${supplierName}. UserID: ${creds.userId}`);
      session.status = 'active';
      session.qrUrl = null;
      session.wechatUserId = creds.userId;
      onActive(creds.userId);
      await updateDbStatus(supplierId, 'online', null, creds.userId);
    });

    bot.on('error', async (err: any) => {
      console.error(`[WeChatManager] SDK ERROR for ${supplierName}:`, err?.message || err);
      if (session.status !== 'pending_qr' && session.status !== 'scanned') {
        await updateDbStatus(supplierId, 'error');
      }
    });

    bot.onMessage(async (msg) => {
      const text = msg.text || '[media]';
      console.log(`[WeChatManager][${supplierName}] ${msg.userId}: ${text}`);
      if (globalMessageCallback) {
        await globalMessageCallback(supplierId, msg.userId, text, msg.raw);
      }
    });

  // Start the bot in background with retry logic
  const startWithRetry = async (attempt = 1) => {
    try {
      await bot.run();
    } catch (err: any) {
      const isNetworkError = err?.toString().includes('fetch failed') || err?.code === 'EAI_AGAIN';
      
      if (isNetworkError && attempt <= 5) {
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`[WeChatManager] Network error for ${supplierName}. Retrying in ${delay}ms (Attempt ${attempt}/5)...`);
        setTimeout(() => startWithRetry(attempt + 1), delay);
      } else {
        console.error(`[WeChatManager] Failed to run bot for ${supplierName} after ${attempt} attempts:`, err);
        session.status = 'error';
        updateDbStatus(supplierId, 'error');
      }
    }
  };

  startWithRetry();

  return session;  } catch (error) {
    console.error(`[WeChatManager] Error initializing bot for ${supplierName}:`, error);
    sessions.delete(supplierId);
    throw error;
  }
}

/**
 * Send a text message to a WeChat user via a supplier's bot.
 */
export async function sendToWeChat(
  supplierId: string,
  wechatUserId: string,
  text: string
): Promise<void> {
  const session = sessions.get(supplierId);
  if (!session) throw new Error(`No session for supplier ${supplierId}`);
  await session.bot.send(wechatUserId, text);
}

/**
 * Send a media message (image/file) to a WeChat user.
 */
export async function sendMediaToWeChat(
  supplierId: string,
  wechatUserId: string,
  mediaUrl: string,
  caption?: string
): Promise<void> {
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
