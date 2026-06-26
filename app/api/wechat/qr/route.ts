import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { generateQRCode } from '@/lib/ilink/client';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { supplierName: string; brands: string[] };
  const { supplierName, brands } = body;

  const qrData = await generateQRCode(supplierName);

  // Create supplier record
  const serviceSupabase = createServiceClient();
  await serviceSupabase.from('suppliers').insert({
    name: supplierName,
    brands: brands.map((b) => b.toLowerCase()),
    session_id: qrData.session_id,
    session_status: 'inactive',
    session_expires_at: qrData.expires_at,
  });

  return NextResponse.json({
    qrCode: qrData.qr_code,
    sessionId: qrData.session_id,
    expiresAt: qrData.expires_at,
  });
}
