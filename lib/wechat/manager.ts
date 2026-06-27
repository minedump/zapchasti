﻿import { WeChatBot } from '@wechatbot/wechatbot';
import { createServiceClient } from '../supabase/service';

/**
 * Генерирует QR-ссылку для поставщика и сохраняет её в БД.
 * Работает по принципу: запустил -> получил ссылку -> сохранил -> закрыл.
 */
export async function generateAndSaveQR(supplierId: string, supplierName: string): Promise<string> {
  console.log(`[WeChat] Generating QR for ${supplierName}...`);
  
  return new Promise((resolve, reject) => {
    const bot = new WeChatBot({
      storageDir: `./.wechatbot/temp_${supplierId}`
    });

    const save = async (url: string) => {
      console.log(`[WeChat] SUCCESS: Got URL, saving to DB...`);
      clearTimeout(timeout);
      await updateDbStatus(supplierId, 'pending_qr', url);
      bot.stop();
      resolve(url);
    };

    const timeout = setTimeout(() => {
      bot.stop();
      reject(new Error('Timeout getting QR from WeChat'));
    }, 60000);

    // Работающий способ: передача колбэков в login()
    bot.login({ 
      // @ts-ignore - SDK types are incomplete, but these callbacks work in runtime
      callbacks: {
        onQrUrl: save
      } 
    }).catch(err => {
      clearTimeout(timeout);
      bot.stop();
      reject(err);
    });
  });
}

async function updateDbStatus(supplierId: string, status: string, qrUrl: string | null = null) {
  try {
    const supabase = createServiceClient();
    await supabase
      .from('suppliers')
      .update({
        session_status: status,
        qr_url: qrUrl
      })
      .eq('id', supplierId);
    console.log(`[DB] Updated ${supplierId} status to ${status}`);
  } catch (err) {
    console.error(`[DB Error]`, err);
  }
}

// Заглушки для совместимости с другими частями кода (если они еще где-то импортируются)
export async function startSupplierBot() {}
export function getSession() { return undefined; }
export function stopBot() {}