import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// 43-byte fully transparent 1x1 GIF
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
  'base64',
);

const HEADERS = {
  'content-type': 'image/gif',
  'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
  pragma: 'no-cache',
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cid = url.searchParams.get('cid');
  const uid = url.searchParams.get('uid');

  // Always return the pixel — never let a logging failure break the email render.
  if (cid && uid) {
    try {
      await logOpen(cid, uid, request);
    } catch (e) {
      console.error('[track/open] log error', e);
    }
  }

  return new NextResponse(new Uint8Array(PIXEL), { status: 200, headers: HEADERS });
}

async function logOpen(cid: string, uid: string, request: Request) {
  const supabase = createServiceClient();
  const ua = request.headers.get('user-agent');
  const fwd = request.headers.get('x-forwarded-for');
  const ip = fwd?.split(',')[0]?.trim() ?? null;

  await supabase.from('email_events').insert({
    campaign_id: cid,
    contact_id: uid,
    event_type: 'opened',
    user_agent: ua,
    ip_address: ip,
  });

  // Update aggregate counters on the matching recipient row (first open wins for opened_at)
  const { data: rec } = await supabase
    .from('campaign_recipients')
    .select('id, open_count, opened_at')
    .eq('campaign_id', cid)
    .eq('contact_id', uid)
    .maybeSingle();

  if (rec) {
    await supabase
      .from('campaign_recipients')
      .update({
        open_count: (rec.open_count ?? 0) + 1,
        opened_at: rec.opened_at ?? new Date().toISOString(),
        status: 'opened',
      })
      .eq('id', rec.id);
  }
}
