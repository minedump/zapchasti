/**
 * POST /api/wechat/qr
 * Create a new supplier record and start a bot session.
 * The bot will show a QR URL — supplier scans it in WeChat.
 * No API keys needed — auth happens via QR scan.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { startSupplierBot } from '@/lib/wechat/manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { supplierName: string; brands: string[] };
  const { supplierName, brands } = body;

  const serviceSupabase = createServiceClient();

  // Create supplier record first to get an ID
  const { data: supplier, error } = await serviceSupabase
    .from('suppliers')
    .insert({
      name: supplierName,
      brands: brands.map((b) => b.toLowerCase()),
      session_status: 'inactive',
    })
    .select()
    .single();

  if (error || !supplier) {
    return NextResponse.json({ error: error?.message || 'Failed to create supplier' }, { status: 500 });
  }

  // Start the bot in the background
  startSupplierBot(
    supplier.id,
    supplier.name,
    () => {}, // QR URL is stored in the session manager
    onActive
  ).catch(err => console.error(`[WeChat][${supplierName}] Failed to start bot:`, err));

  return NextResponse.json({
    supplierId: supplier.id,
    message: 'Supplier created successfully'
  });
}
