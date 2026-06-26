import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = parseInt(searchParams.get('pageSize') || '50');

  const { data, error, count } = await supabase
    .from('messages')
    .select('*, sender:users(display_name, role)', { count: 'exact' })
    .eq('chat_id', params.id)
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mark as read
  await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('chat_id', params.id)
    .eq('is_read', false);

  await supabase
    .from('chats')
    .update({ unread_count: 0 })
    .eq('id', params.id);

  return NextResponse.json({
    data: (data || []).reverse(),
    total: count || 0,
    page,
    pageSize,
  });
}
