/**
 * WeChat Bot Manager
 *
 * Manages multiple WeChatBot instances (one per supplier).
 * Uses @wechatbot/wechatbot Node.js SDK — no API keys needed.
 * Authentication happens via QR code scan in WeChat.
 *
 * Sessions are persisted to ~/.wechatbot/<supplierId>.json
 * and auto-recovered on restart.
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

function credPath(supplierId: string): string {
  return path.join(os.homedir(), '.wechatbot', `${supplierId}.json`);
}

/**
 * Start a bot for a supplier.
 * If credentials exist on disk — auto-login (no QR needed).
 * If not — shows QR URL via onQrUrl callback.
 */
/**
 * Start a bot for a supplier.
 * Returns a Promise that resolves once the QR URL is ready (or creds restored).
 * The login + long-poll loop continues running in the background after that.
 */
export function startSupplierBot(
  supplierId: string,
  supplierName: string,
  onQrUrl: (url: string) => void,
  onActive: (wechatUserId: string) => void
): Promise<BotSession> {
  // If already running — return existing
  const existing = sessions.get(supplierId);
  if (existing && existing.status === 'active') return Promise.resolve(existing);

  const session: BotSession = {
    supplierId,
    supplierName,
    bot: null as unknown as WeChatBot,
    status: 'pending_qr',
    qrUrl: null,
    wechatUserId: null,
  };

  // Each supplier gets its own storage directory so credentials don't collide
  const supplierStorageDir = path.join(os.homedir(), '.wechatbot', supplierId);

  return new Promise<BotSession>((resolve, reject) => {
    let resolved = false;

    console.log(`[WeChatManager] Starting bot for supplier ${supplierId}...`);
    const bot = new WeChatBot({
      storageDir: `./.wechatbot/${supplierId}`,
      loginCallbacks: {
        onScan: async (url) => {
          console.log(`[WeChatManager] QR Code received for ${supplierId}: ${url}`);
          await updateDbStatus(supplierId, 'pending_qr', url);
        },
        onSuccess: async (user) => {
          console.log(`[WeChatManager] Login success for ${supplierId}: ${user.name}`);
          await updateDbStatus(supplierId, 'online', null, user.id);
        },
        onFailure: async (reason) => {
          console.error(`[WeChatManager] Login failed for ${supplierId}: ${reason}`);
          await updateDbStatus(supplierId, 'error');
        }
      }
    });

    // Register event handlers
    bot.on('login', (creds: any) => {
      console.log(`[WeChat][${supplierName}] Logged in, account: ${creds.accountId}`);
      session.status = 'online';
      session.qrUrl = null;
      session.wechatUserId = creds.accountId || null;
      updateDbStatus(supplierId, 'active', null, creds.accountId).catch(console.error);
    });

    bot.on('session:expired', () => {
      console.log(`[WeChat][${supplierName}] Session expired`);
      session.status = 'offline';
      updateDbStatus(supplierId, 'inactive').catch(console.error);
    });

    bot.on('error', (error: any) => {
      // If we have a QR URL, ignore ALL errors for 2 minutes to allow scanning
      if (session.qrUrl) {
        console.log(`[WeChat][${supplierName}] Bot reported error, but QR is available. Ignoring to allow scan:`, error?.message || error);
        return;
      }
      console.error(`[WeChat][${supplierName}] Bot error:`, error);
      session.status = 'error';
      updateDbStatus(supplierId, 'error').catch(console.error);
    });

    bot.on('close', () => {
      console.log(`[WeChat][${supplierName}] Bot closed`);
      session.status = 'offline';
    });

    session.bot = bot;
    sessions.set(supplierId, session);

    // Register message handler
    bot.onMessage(async (msg) => {
      const text = msg.text || '[медиа]';
      console.log(`[WeChat][${supplierName}] ${msg.userId} → ${text}`);
      if (globalMessageCallback) {
        await globalMessageCallback(supplierId, msg.userId, text, msg.raw);
      }
    });

    // Safety timeout: if no QR or login in 60s, resolve anyway so API doesn't hang
    const timeout = setTimeout(() => {
      if (!resolved) {
        console.log(`[WeChat][${supplierName}] Login timeout reached (60s), resolving with current state`);
        resolved = true;
        resolve(session);
      }
    }, 60000);

    // Run login + long-poll in background
    (async () => {
      try {
        const creds = await bot.login();
        clearTimeout(timeout);
        session.wechatUserId = creds.accountId ?? null;
        session.status = 'active';
        // If creds were restored from disk (no QR shown), resolve here
        if (!resolved) { resolved = true; resolve(session); }
        onActive(creds.accountId ?? '');
        await bot.start();
      } catch (err: any) {
        clearTimeout(timeout);
        
        const isTimeout = err?.toString().includes('TimeoutError') || err?.name === 'TimeoutError';
        if (isTimeout && session.qrUrl) {
          console.log(`[WeChat][${supplierName}] Login timed out but QR is available. Continuing in background...`);
          // Don't delete session, just wait for user to scan
          try {
            await bot.start();
          } catch (startErr) {
            console.error(`[WeChat][${supplierName}] Failed to start after timeout:`, startErr);
          }
          return;
        }

        console.error(`[WeChat][${supplierName}] bot error:`, err);
        session.status = 'expired';
        sessions.delete(supplierId);
        if (!resolved) { resolved = true; reject(err); }
      }
    })();
  });
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
  if (!session || session.status !== 'active') {
    throw new Error(`No active bot for supplier ${supplierId}`);
  }
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
  if (!session || session.status !== 'active') {
    throw new Error(`No active bot for supplier ${supplierId}`);
  }
  await (session.bot as any).reply(
    { userId: wechatUserId } as any,
    { url: mediaUrl, caption }
  );
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
    if (qrUrl !== undefined) updateData.qr_url = qrUrl;
    if (wechatUserId !== undefined) updateData.wechat_user_id = wechatUserId;
    
    await supabase
      .from('suppliers')
      .update(updateData)
      .eq('id', supplierId);
  } catch (err) {
    console.error(`[WeChat][${supplierId}] Failed to update DB status:`, err);
  }
}
