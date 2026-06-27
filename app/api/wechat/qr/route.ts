import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { generateAndSaveQR } from '@/lib/wechat/manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json() as { supplierId: string };
    const { supplierId } = body;

    const serviceSupabase = createServiceClient();
    const { data: supplier } = await serviceSupabase
      .from('suppliers')
      .select('name')
      .eq('id', supplierId)
      .single();

    if (!supplier) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });

    // Запускаем процесс получения QR (он сам сохранит в БД)
    // Мы не ждем завершения здесь, чтобы не вешать HTTP запрос
    generateAndSaveQR(supplierId, supplier.name).catch(console.error);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
