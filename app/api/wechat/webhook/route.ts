/**
 * /api/wechat/webhook — NOT USED with SDK approach.
 *
 * With @wechatbot/wechatbot SDK, messages are received via long-polling
 * inside the bot process itself (bot.start()), not via HTTP webhook.
 *
 * This route is kept as a no-op for compatibility.
 * Message handling happens in /api/wechat/start via setMessageCallback().
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    info: 'WeChat messages are received via SDK long-polling, not webhooks.',
    docs: 'https://www.wechatbot.dev/en/nodejs',
  });
}

export async function POST() {
  return NextResponse.json({ ok: true });
}
