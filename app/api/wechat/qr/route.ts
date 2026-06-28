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

    const body = await req.json() as { supplierId?: string; supplierName?: string; brands?: string[] };
    const { supplierId, supplierName, brands } = body;

    const serviceSupabase = createServiceClient();
    let targetId = supplierId;
    let targetName = supplierName || '';

    if (!targetId) {
      // Создаем нового поставщика
      if (!supplierName) return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 });
      
      const { data: newSupplier, error: createError } = await serviceSupabase
        .from('suppliers')
        .insert({
          name: supplierName,
          brands: (brands || []).map(b => b.toLowerCase()),
          session_status: 'inactive'
        })
        .select()
        .single();

      if (createError || !newSupplier) throw new Error(createError?.message || 'Failed to create supplier');
      
      targetId = newSupplier.id;
      targetName = newSupplier.name;
    } else {
      // Ищем существующего
      const { data: existing } = await serviceSupabase
        .from('suppliers')
        .select('name')
        .eq('id', targetId)
        .single();
      
      if (!existing) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
      targetName = existing.name;
    }

    // Запускаем процесс получения QR
    generateAndSaveQR(targetId, targetName).catch(console.error);

    return NextResponse.json({ success: true, supplierId: targetId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
