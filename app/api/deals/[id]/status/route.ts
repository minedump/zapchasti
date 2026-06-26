import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { DealStatus } from '@/lib/types';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { status: DealStatus; comment?: string };
  const { status, comment } = body;

  // Get current status
  const { data: current } = await supabase
    .from('deals')
    .select('status')
    .eq('id', params.id)
    .single();

  if (!current) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });

  const updateData: Record<string, unknown> = { status };
  if (status === 'closed') updateData.closed_at = new Date().toISOString();

  const { data: deal, error } = await supabase
    .from('deals')
    .update(updateData)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from('deal_status_history').insert({
    deal_id: params.id,
    old_status: current.status,
    new_status: status,
    changed_by: user.id,
    comment: comment || null,
  });

  return NextResponse.json({ data: deal });
}
