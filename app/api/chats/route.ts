import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const serviceSupabase = createServiceClient();
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const unread = searchParams.get('unread') === 'true';
  const search = searchParams.get('search');

  let query = serviceSupabase
    .from('chats')
    .select('*, user:users(id, display_name, username, role, telegram_id, wechat_id)')
    .eq('is_active', true)
    .order('last_message_at', { ascending: false });

  if (type) query = query.eq('chat_type', type);
  if (unread) query = query.gt('unread_count', 0);
  if (search) {
    query = query.or(
      `external_id.ilike.%${search}%`
    );
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}
