/**
 * DEPRECATED — этот файл больше не используется.
 *
 * WeChat интеграция работает через Node.js SDK @wechatbot/wechatbot
 * (long-polling, QR-авторизация без API-ключей).
 *
 * Используй: lib/wechat/manager.ts
 * Docs: https://www.wechatbot.dev/en/nodejs
 */

// iLink Bot API Client — LEGACY, not used

const ILINK_API_URL = process.env.ILINK_API_URL || 'https://api.ilink.dev';
const ILINK_API_KEY = process.env.ILINK_API_KEY || '';

interface ILinkSendTextParams {
  sessionId: string;
  to: string;
  text: string;
}

interface ILinkSendMediaParams {
  sessionId: string;
  to: string;
  mediaUrl: string;
  caption?: string;
}

interface ILinkResponse {
  ok: boolean;
  message_id?: string;
  error?: string;
}

async function ilinkFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${ILINK_API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ILINK_API_KEY}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`iLink API error ${res.status}: ${err}`);
  }

  return res.json() as Promise<T>;
}

export async function sendTextMessage(
  params: ILinkSendTextParams
): Promise<ILinkResponse> {
  return ilinkFetch<ILinkResponse>('/v1/message/send', {
    method: 'POST',
    body: JSON.stringify({
      session_id: params.sessionId,
      to: params.to,
      type: 'text',
      content: params.text,
    }),
  });
}

export async function sendMediaMessage(
  params: ILinkSendMediaParams
): Promise<ILinkResponse> {
  return ilinkFetch<ILinkResponse>('/v1/message/send', {
    method: 'POST',
    body: JSON.stringify({
      session_id: params.sessionId,
      to: params.to,
      type: 'image',
      media_url: params.mediaUrl,
      caption: params.caption,
    }),
  });
}

export async function generateQRCode(label: string): Promise<{
  qr_code: string;
  session_id: string;
  expires_at: string;
}> {
  return ilinkFetch('/v1/session/create', {
    method: 'POST',
    body: JSON.stringify({ label }),
  });
}

export async function getSessionStatus(sessionId: string): Promise<{
  session_id: string;
  status: 'active' | 'expiring' | 'inactive';
  expires_at: string;
  wechat_id?: string;
}> {
  return ilinkFetch(`/v1/session/${sessionId}`);
}

export async function refreshSession(sessionId: string): Promise<{
  qr_code: string;
  session_id: string;
  expires_at: string;
}> {
  return ilinkFetch(`/v1/session/${sessionId}/refresh`, { method: 'POST' });
}

export function verifyWebhookSignature(
  payload: string,
  signature: string
): boolean {
  // In production: verify HMAC-SHA256 signature
  const secret = process.env.ILINK_WEBHOOK_SECRET;
  if (!secret) return true; // skip in dev

  const crypto = require('crypto') as typeof import('crypto');
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return signature === `sha256=${expected}`;
}
