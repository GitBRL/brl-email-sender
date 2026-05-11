import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/** Escape strings before interpolating into the unsub page template. Admin-set
 *  values come from app_settings — escape them to be safe against accidental
 *  HTML in the copy. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function page(title: string, message: string) {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  return `<!doctype html>
<html lang="pt-BR"><head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    body{margin:0;font-family:Inter,Arial,sans-serif;background:#f7f7f7;color:#2b2b2b;display:grid;place-items:center;min-height:100vh;padding:24px;}
    .card{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:32px;max-width:420px;width:100%;text-align:center;}
    .logo{display:inline-block;width:10px;height:10px;background:#ffcd01;border-radius:2px;margin-bottom:12px;}
    h1{font-size:18px;margin:0 0 8px;}
    p{font-size:14px;color:#666;margin:0;white-space:pre-wrap;}
  </style>
</head><body>
  <div class="card">
    <div class="logo"></div>
    <h1>${safeTitle}</h1>
    <p>${safeMessage}</p>
  </div>
</body></html>`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const uid = url.searchParams.get('uid');

  if (!uid) {
    return new NextResponse(page('Invalid request', 'No contact id was provided.'), {
      status: 400,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  try {
    const supabase = createServiceClient();
    const { data: contact, error } = await supabase
      .from('contacts')
      .update({ status: 'unsubscribed' })
      .eq('id', uid)
      .select('email')
      .maybeSingle();

    if (error || !contact) {
      return new NextResponse(
        page("We couldn't find your subscription", "If this is unexpected, contact contato@brleducacao.com.br."),
        { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
      );
    }

    await supabase.from('email_events').insert({
      contact_id: uid,
      event_type: 'unsubscribed',
    });

    // Load admin-customised unsubscribe copy if present
    const { data: settings } = await supabase
      .from('app_settings')
      .select('unsub_heading, unsub_body')
      .eq('id', true)
      .maybeSingle();
    const heading = settings?.unsub_heading || 'You have been unsubscribed';
    // Allow {{email}} merge tag in the body so the admin can personalise the message
    const bodyTemplate =
      settings?.unsub_body ||
      `{{email}} will no longer receive marketing emails from BRL Educação. Sorry to see you go.`;
    const body = bodyTemplate.replace(/\{\{\s*email\s*\}\}/gi, contact.email);

    return new NextResponse(page(heading, body), {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  } catch (e) {
    console.error('[unsubscribe] error', e);
    return new NextResponse(page('Something went wrong', 'Please try again later.'), {
      status: 500,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }
}
