import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createServiceClient();

  let supabaseOk = false;
  try {
    const { error } = await supabase.from('templates').select('id').limit(1);
    supabaseOk = !error;
  } catch {
    supabaseOk = false;
  }

  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    supabase: supabaseOk ? 'connected' : 'error',
    version: process.env.npm_package_version || '0.1.0',
  });
}
