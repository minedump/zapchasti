import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function PUT(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { service: 'deepseek' | 'ilink'; key: string };
  const { service, key } = body;

  // In production: encrypt the key before storing
  // For now: store as-is (use env vars in production)
  const serviceSupabase = createServiceClient();

  await serviceSupabase
    .from('api_keys')
    .upsert(
      { service, key_encrypted: key, is_active: true },
      { onConflict: 'service' }
    );

  // Log action
  await serviceSupabase.from('logs').insert({
    level: 'info',
    source: 'admin',
    message: `API key updated for service: ${service}`,
    user_id: user.id,
  });

  return NextResponse.json({ ok: true });
}
