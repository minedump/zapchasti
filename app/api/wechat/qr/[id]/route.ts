import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { startSupplierBot, getSession } from '@/lib/wechat/manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supplierId = params.id;
  const serviceSupabase = createServiceClient();

  // 1. Get supplier info
  const { data: supplier, error: fetchError } = await serviceSupabase
    .from('suppliers')
    .select('*')
    .eq('id', supplierId)
    .single();

  if (fetchError || !supplier) {
    return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
  }

  const onActive = async (wechatUserId: string) => {
    await serviceSupabase
      .from('suppliers')
      .update({
        session_status: 'active',
        session_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq('id', supplierId);
  };

  try {
    // 2. Start/Restart bot for this specific supplier
    const session = await startSupplierBot(
      supplierId,
      supplier.name,
      () => {}, // QR URL will be in session
      onActive
    );

    return NextResponse.json({
      qrCode: session.qrUrl,
      status: session.status
    });
  } catch (err) {
    console.error('[WeChat] QR generation failed:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
