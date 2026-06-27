import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getSession, startSupplierBot } from '@/lib/wechat/manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const supplierId = searchParams.get('supplierId');

  if (!supplierId) {
    return NextResponse.json({ error: 'Missing supplierId' }, { status: 400 });
  }

  let session = getSession(supplierId);

  // If no session or expired, try to start/restart the bot
  // But DON'T restart if we already have a QR URL (even if status is error/pending)
  if (!session || (session.status === 'expired' || session.status === 'error') && !session.qrUrl) {
    const serviceSupabase = createServiceClient();
    const { data: supplier } = await serviceSupabase
      .from('suppliers')
      .select('id, name')
      .eq('id', supplierId)
      .single();

    if (supplier) {
      console.log(`[WeChat][${supplier.name}] Restarting bot from status check`);
      // Start in background, don't await full login
      startSupplierBot(
        supplier.id,
        supplier.name,
        () => {},
        async (wechatUserId) => {
          // This callback is already handled in manager.ts for DB updates,
          // but we can add extra logic here if needed.
        }
      ).catch(err => console.error(`[WeChat][${supplier.name}] Restart failed:`, err));
      
      // Wait a bit for the bot to initialize and potentially get a QR URL
      await new Promise(resolve => setTimeout(resolve, 3000));
      session = getSession(supplierId);
    }
  }

  if (!session) {
    return NextResponse.json({ status: 'inactive' });
  }

  return NextResponse.json({
    status: session.status,
    qrUrl: session.qrUrl,
    wechatUserId: session.wechatUserId
  });
}
