﻿import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const supplierId = searchParams.get('supplierId');

    if (!supplierId) return NextResponse.json({ error: 'Missing supplierId' }, { status: 400 });

    const supabase = createServiceClient();
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('session_status, qr_url, wechat_user_id')
      .eq('id', supplierId)
      .single();

    return NextResponse.json({
      status: supplier?.session_status || 'inactive',
      qrUrl: supplier?.qr_url || null,
      wechatUserId: supplier?.wechat_user_id || null
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}