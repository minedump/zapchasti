// Telegram Bot via grammY
import { Bot, webhookCallback } from 'grammy';

let botInstance: Bot | null = null;

export function getBot(): Bot {
  if (!botInstance) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');
    botInstance = new Bot(token);
  }
  return botInstance;
}

export async function sendTelegramMessage(
  chatId: number | string,
  text: string
): Promise<void> {
  const bot = getBot();
  await bot.api.sendMessage(chatId, text, { parse_mode: 'HTML' });
}

export async function sendTelegramPhoto(
  chatId: number | string,
  photoUrl: string,
  caption?: string
): Promise<void> {
  const bot = getBot();
  await bot.api.sendPhoto(chatId, photoUrl, {
    caption,
    parse_mode: 'HTML',
  });
}

export async function setWebhook(url: string): Promise<void> {
  const bot = getBot();
  await bot.api.setWebhook(url, {
    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
  });
}
