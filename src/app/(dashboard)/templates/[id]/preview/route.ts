import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireProfile();
  const { id } = await params;
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('templates')
    .select('html_content')
    .eq('id', id)
    .maybeSingle();
  if (!data) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(data.html_content || '<!doctype html><body><p>Empty template</p></body>', {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
