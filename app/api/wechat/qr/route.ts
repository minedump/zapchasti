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

  let qrUrl: string | null = null;

  try {
    // Start bot — will show QR since no saved credentials
    const session = await startSupplierBot(
      supplier.id,
      supplierName,
      (url) => { qrUrl = url; },
      async (wechatUserId) => {
        // On successful scan — update supplier with WeChat user ID
        await serviceSupabase
          .from('suppliers')
          .update({
            session_status: 'active',
            session_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          })
          .eq('id', supplier.id);

        // Create/link chat
        const { data: chat } = await serviceSupabase
          .from('chats')
          .upsert(
            {
              chat_type: 'wechat',
              external_id: wechatUserId,
              last_message_at: new Date().toISOString(),
            },
            { onConflict: 'chat_type,external_id' }
          )
          .select()
          .single();

        if (chat) {
          await serviceSupabase
            .from('suppliers')
            .update({ chat_id: chat.id })
            .eq('id', supplier.id);
        }
      }
    );

    return NextResponse.json({
      supplierId: supplier.id,
      status: session.status,
      // qrUrl is a URL to a QR image — display it in the admin UI
      qrUrl: session.qrUrl,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
