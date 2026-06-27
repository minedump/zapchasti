import { WeChatBot } from '@wechatbot/wechatbot';
import { createServiceClient } from '../supabase/service';
import fs from 'fs';
import path from 'path';

/**
 * Генерирует QR-ссылку для поставщика и сохраняет её в БД.
 */
export async function generateAndSaveQR(supplierId: string, supplierName: string): Promise<string> {
  console.log(`[WeChat] Generating QR for ${supplierName}...`);
  
  return new Promise((resolve, reject) => {
    const storageDir = `./.wechatbot/temp_${supplierId}`;
    const bot = new WeChatBot({
      storageDir
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

    // Обработка успешного сканирования и входа
    bot.on('login', async (creds) => {
      console.log(`[WeChat] Login success for ${supplierName}`);
      clearTimeout(timeout);
      
      // Сохраняем кредиты в БД
      await updateDbStatus(supplierId, 'active', null, creds.userId, creds);
      
      // Останавливаем бота и удаляем временные файлы
      bot.stop();
      try {
        if (fs.existsSync(storageDir)) {
          fs.rmSync(storageDir, { recursive: true, force: true });
        }
      } catch (e) {
        console.error(`[WeChat] Failed to clean temp storage:`, e);
      }
    });

    // Работающий способ: передача колбэков в login()
    bot.login({ 
      // @ts-ignore - SDK types are incomplete
      callbacks: {
        onQrUrl: save,
        onScan: save
      } 
    }).catch(err => {
      clearTimeout(timeout);
      bot.stop();
      reject(err);
    });
  });
}

async function updateDbStatus(supplierId: string, status: string, qrUrl: string | null = null, wechatUserId: string | null = null, credentials: any = null) {
  try {
    const supabase = createServiceClient();
    const updateData: any = {
      session_status: status,
      qr_url: qrUrl,
      wechat_user_id: wechatUserId,
      session_data: credentials
    };
    
    await supabase
      .from('suppliers')
      .update(updateData)
      .eq('id', supplierId);
      
    console.log(`[DB] Updated ${supplierId} to ${status}`);
  } catch (err) {
    console.error(`[DB Error]`, err);
  }
}

// Заглушки для совместимости
export async function startSupplierBot() {}
export function getSession() { return undefined; }
export function stopBot() {}