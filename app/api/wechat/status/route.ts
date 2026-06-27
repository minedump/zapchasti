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
  const serviceSupabase = createServiceClient();

  // If no session or expired, try to start/restart the bot
  if (!session || (session.status === 'expired' && !session.qrUrl)) {
    const { data: supplier } = await serviceSupabase
      .from('suppliers')
      .select('id, name')
      .eq('id', supplierId)
      .single();

    if (supplier) {
      console.log(`[WeChat][${supplier.name}] Starting bot from status check`);
      startSupplierBot(supplier.id, supplier.name, () => {}, () => {})
        .catch(err => console.error(`[WeChat][${supplier.name}] Start failed:`, err));
    }
  }

  // Always return the latest data from DB
  const { data: dbSupplier } = await serviceSupabase
    .from('suppliers')
    .select('session_status, qr_url, wechat_user_id')
    .eq('id', supplierId)
    .single();

  return NextResponse.json({
    status: dbSupplier?.session_status || 'inactive',
    qrUrl: dbSupplier?.qr_url || null,
    wechatUserId: dbSupplier?.wechat_user_id || null
  });
}
