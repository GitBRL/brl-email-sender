import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { APP_URL } from '@/lib/resend';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cid = url.searchParams.get('cid');
  const lid = url.searchParams.get('lid');
  const uid = url.searchParams.get('uid');

  if (!cid || !lid) {
    return NextResponse.redirect(APP_URL);
  }

  let target = APP_URL;

  try {
    const supabase = createServiceClient();

    // Look up the original URL for this campaign + link
    const { data: link } = await supabase
      .from('tracked_links')
      .select('original_url, click_count')
      .eq('campaign_id', cid)
      .eq('link_id', lid)
      .maybeSingle();

    if (link?.original_url) {
      target = link.original_url;
      // Bump aggregate click count
      await supabase
        .from('tracked_links')
        .update({ click_count: (link.click_count ?? 0) + 1 })
        .eq('campaign_id', cid)
        .eq('link_id', lid);
    }

    if (uid) {
      // Log the click event
      const ua = request.headers.get('user-agent');
      const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;

      await supabase.from('email_events').insert({
        campaign_id: cid,
        contact_id: uid,
        event_type: 'clicked',
        link_url: target,
        link_id: lid,
        user_agent: ua,
        ip_address: ip,
      });

      // Update the recipient's click counter
      const { data: rec } = await supabase
        .from('campaign_recipients')
        .select('id, click_count, clicked_at')
        .eq('campaign_id', cid)
        .eq('contact_id', uid)
        .maybeSingle();

      if (rec) {
        await supabase
          .from('campaign_recipients')
          .update({
            click_count: (rec.click_count ?? 0) + 1,
            clicked_at: rec.clicked_at ?? new Date().toISOString(),
            status: 'clicked',
          })
          .eq('id', rec.id);
      }
    }
  } catch (e) {
    console.error('[track/click] error', e);
  }

  return NextResponse.redirect(target, { status: 302 });
}
