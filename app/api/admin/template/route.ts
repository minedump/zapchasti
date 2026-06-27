import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { buildQuestionnairePrompt } from '@/lib/deepseek/client';
import type { TemplateField } from '@/lib/types';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const serviceSupabase = createServiceClient();
  const { data, error } = await serviceSupabase
    .from('templates')
    .select('*')
    .eq('is_active', true)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  return NextResponse.json({ data });
}

export async function PUT(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const serviceSupabase = createServiceClient();
  const body = await req.json() as { schema: { fields: TemplateField[] } };
  const { schema } = body;

  // Get current version
  const { data: current } = await serviceSupabase
    .from('templates')
    .select('version')
    .eq('is_active', true)
    .single();

  const newVersion = (current?.version || 0) + 1;

  // Generate prompt from schema
  const prompt = buildQuestionnairePrompt(schema.fields);

  // Deactivate old template
  await serviceSupabase
    .from('templates')
    .update({ is_active: false })
    .eq('is_active', true);

  // Create new template
  const { data, error } = await serviceSupabase
    .from('templates')
    .insert({
      version: newVersion,
      schema,
      prompt,
      is_active: true,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}
