import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { createServiceClient } from '@/lib/supabase/server';
import type { EmailEventType } from '@/types';

export const runtime = 'nodejs';

/**
 * Resend → Svix-signed webhook payloads.
 * Configure at https://resend.com/webhooks pointing to:
 *   ${NEXT_PUBLIC_APP_URL}/api/webhooks/resend
 * Set RESEND_WEBHOOK_SECRET in env to the secret shown in the Resend dashboard.
 */

type ResendEvent = {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[];
    subject?: string;
    bounce?: { type?: string; subType?: string; message?: string };
    click?: { link?: string; ipAddress?: string; userAgent?: string };
    open?: { ipAddress?: string; userAgent?: string };
  };
};

function mapType(t: string): EmailEventType | null {
  const map: Record<string, EmailEventType> = {
    'email.sent': 'sent',
    'email.delivered': 'delivered',
    'email.delivery_delayed': 'delivery_delayed',
    'email.complained': 'complained',
    'email.bounced': 'bounced',
    'email.opened': 'opened',
    'email.clicked': 'clicked',
    'email.failed': 'failed',
  };
  return map[t] ?? null;
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const body = await request.text();

  // Signature verification (only enforced when a secret is configured)
  if (secret) {
    const wh = new Webhook(secret);
    const headers = {
      'svix-id': request.headers.get('svix-id') ?? '',
      'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
      'svix-signature': request.headers.get('svix-signature') ?? '',
    };
    try {
      wh.verify(body, headers);
    } catch (e) {
      console.error('[webhooks/resend] signature verification failed', e);
      return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
    }
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const evType = mapType(event.type);
  if (!evType) return NextResponse.json({ ok: true, ignored: event.type });

  const resendId = event.data?.email_id;
  if (!resendId) return NextResponse.json({ ok: true, missing: 'email_id' });

  try {
    const supabase = createServiceClient();

    // Find the recipient row by resend id
    const { data: rec } = await supabase
      .from('campaign_recipients')
      .select('id, campaign_id, contact_id, status, open_count, click_count, opened_at, clicked_at')
      .eq('resend_id', resendId)
      .maybeSingle();

    // Always log the raw event for analytics
    await supabase.from('email_events').insert({
      campaign_id: rec?.campaign_id ?? null,
      contact_id: rec?.contact_id ?? null,
      event_type: evType,
      link_url: event.data?.click?.link ?? null,
      user_agent:
        event.data?.click?.userAgent ?? event.data?.open?.userAgent ?? null,
      ip_address:
        event.data?.click?.ipAddress ?? event.data?.open?.ipAddress ?? null,
    });

    if (rec) {
      const patch: Record<string, unknown> = {};
      const now = new Date().toISOString();
      switch (evType) {
        case 'delivered':
          patch.delivered_at = now;
          patch.status = 'delivered';
          break;
        case 'bounced':
          patch.bounced_at = now;
          patch.status = 'bounced';
          // Mark contact as bounced too
          if (rec.contact_id) {
            await supabase
              .from('contacts')
              .update({ status: 'bounced' })
              .eq('id', rec.contact_id);
          }
          break;
        case 'complained':
          patch.status = 'complained';
          if (rec.contact_id) {
            await supabase
              .from('contacts')
              .update({ status: 'unsubscribed' })
              .eq('id', rec.contact_id);
          }
          break;
        case 'opened':
          patch.open_count = (rec.open_count ?? 0) + 1;
          patch.opened_at = rec.opened_at ?? now;
          if (rec.status !== 'clicked') patch.status = 'opened';
          break;
        case 'clicked':
          patch.click_count = (rec.click_count ?? 0) + 1;
          patch.clicked_at = rec.clicked_at ?? now;
          patch.status = 'clicked';
          break;
        default:
          break;
      }
      if (Object.keys(patch).length > 0) {
        await supabase.from('campaign_recipients').update(patch).eq('id', rec.id);
      }
    }
  } catch (e) {
    console.error('[webhooks/resend] processing error', e);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, message: 'POST Resend webhook events here' });
}
