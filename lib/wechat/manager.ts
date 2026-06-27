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

export interface BotSession {
  supplierId: string;
  supplierName: string;
  bot: WeChatBot;
  status: 'pending_qr' | 'active' | 'expired';
  qrUrl: string | null;
  wechatUserId: string | null;
}

// Singleton map: supplierId -> BotSession
const sessions = new Map<string, BotSession>();

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
export async function startSupplierBot(
  supplierId: string,
  supplierName: string,
  onQrUrl: (url: string) => void,
  onActive: (wechatUserId: string) => void
): Promise<BotSession> {
  // If already running — return existing
  const existing = sessions.get(supplierId);
  if (existing && existing.status === 'active') return existing;

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

  const bot = new WeChatBot({
    storage: 'file',
    storageDir: supplierStorageDir,
    logLevel: 'info',
    loginCallbacks: {
      onQrUrl: (url: string) => {
        session.qrUrl = url;
        session.status = 'pending_qr';
        onQrUrl(url);
      },
      onScanned: () => {
        console.log(`[WeChat] ${supplierName} scanned QR`);
      },
      onExpired: () => {
        session.status = 'expired';
        console.log(`[WeChat] ${supplierName} session expired`);
      },
    },
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

  // Login then start long-poll — both run in background.
  // onQrUrl fires during login() before it resolves, so the caller
  // can capture the QR URL without waiting for the scan.
  (async () => {
    try {
      const creds = await bot.login();
      session.wechatUserId = creds.accountId ?? null;
      session.status = 'active';
      onActive(creds.accountId ?? '');

      // Start long-poll loop (runs until bot.stop())
      await bot.start();
    } catch (err) {
      console.error(`[WeChat][${supplierName}] bot error:`, err);
      session.status = 'expired';
    }
  })();

  return session;
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
