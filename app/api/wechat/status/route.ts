import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/wechat/manager';

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

  const session = getSession(supplierId);
  if (!session) {
    return NextResponse.json({ status: 'inactive' });
  }

  return NextResponse.json({
    status: session.status,
    qrUrl: session.qrUrl,
    wechatUserId: session.wechatUserId
  });
}
