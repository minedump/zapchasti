import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateDealNumber } from '@/lib/utils/helpers';

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const supplier = searchParams.get('supplier');
  const client = searchParams.get('client');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const brand = searchParams.get('brand');
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = parseInt(searchParams.get('pageSize') || '20');

  let query = supabase
    .from('deals')
    .select(
      `*, client_chat:chats!deals_client_chat_id_fkey(id, external_id, user:users(display_name, username)),
       supplier_chat:chats!deals_supplier_chat_id_fkey(id, external_id, user:users(display_name, username))`,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (status) query = query.eq('status', status);
  if (dateFrom) query = query.gte('created_at', dateFrom);
  if (dateTo) query = query.lte('created_at', dateTo);
  if (brand) query = query.ilike('data->>brand', `%${brand}%`);

  const { data, error, count } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data,
    total: count || 0,
    page,
    pageSize,
  });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { clientChatId, data: dealData } = body;

  const dealNumber = generateDealNumber();

  const { data: deal, error } = await supabase
    .from('deals')
    .insert({
      deal_number: dealNumber,
      client_chat_id: clientChatId || null,
      status: 'new',
      data: dealData || {},
      created_by: 'operator',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from('deal_status_history').insert({
    deal_id: deal.id,
    old_status: null,
    new_status: 'new',
    changed_by: user.id,
    comment: 'Заявка создана оператором',
  });

  return NextResponse.json({ data: deal });
}
