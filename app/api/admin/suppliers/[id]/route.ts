import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { deleteSupplierData } from '@/lib/wechat/manager';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supplierId = params.id;

    // 1. Удаляем файлы и останавливаем бота
    await deleteSupplierData(supplierId);

    // 2. Удаляем из БД
    const serviceSupabase = createServiceClient();
    const { error } = await serviceSupabase
      .from('suppliers')
      .delete()
      .eq('id', supplierId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
