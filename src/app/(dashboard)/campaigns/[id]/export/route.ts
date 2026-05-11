import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';

export const runtime = 'nodejs';

/** Convert an array of objects to a CSV string. Quotes values that contain
 *  delimiters or newlines. RFC 4180-ish. */
function toCsv(rows: Record<string, string | number | null | undefined>[]): string {
  if (rows.length === 0) return '';
  const headers = Array.from(
    rows.reduce<Set<string>>((set, r) => {
      for (const k of Object.keys(r)) set.add(k);
      return set;
    }, new Set()),
  );
  const escape = (v: unknown): string => {
    if (v == null) return '';
    const s = String(v);
    if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => escape(r[h])).join(','));
  }
  return lines.join('\n');
}

/**
 * GET /campaigns/[id]/export
 * Returns a CSV of recipients with their per-email outcome (delivered/opened/
 * clicked/bounced/complained/unsubscribed counts + timestamps).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const { id } = await context.params;
  const supabase = createServiceClient();

  // Verify campaign exists
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, name')
    .eq('id', id)
    .maybeSingle();
  if (!campaign) return new NextResponse('Not Found', { status: 404 });

  // Pull recipients + events in parallel
  const [{ data: recipients }, { data: events }] = await Promise.all([
    supabase
      .from('campaign_recipients')
      .select('contact_id, status, resend_id, error, created_at')
      .eq('campaign_id', id),
    supabase
      .from('email_events')
      .select('contact_id, event_type, created_at')
      .eq('campaign_id', id),
  ]);

  // Group events by contact_id
  type EventBucket = {
    delivered_at?: string;
    first_opened_at?: string;
    first_clicked_at?: string;
    last_opened_at?: string;
    bounced_at?: string;
    complained_at?: string;
    unsubscribed_at?: string;
    open_count: number;
    click_count: number;
  };
  const byContact = new Map<string, EventBucket>();
  for (const e of events ?? []) {
    if (!e.contact_id) continue;
    let b = byContact.get(e.contact_id);
    if (!b) {
      b = { open_count: 0, click_count: 0 };
      byContact.set(e.contact_id, b);
    }
    if (e.event_type === 'delivered' && !b.delivered_at) b.delivered_at = e.created_at;
    else if (e.event_type === 'opened') {
      b.open_count++;
      b.first_opened_at = b.first_opened_at ?? e.created_at;
      b.last_opened_at = e.created_at;
    } else if (e.event_type === 'clicked') {
      b.click_count++;
      b.first_clicked_at = b.first_clicked_at ?? e.created_at;
    } else if (e.event_type === 'bounced') b.bounced_at = e.created_at;
    else if (e.event_type === 'complained') b.complained_at = e.created_at;
    else if (e.event_type === 'unsubscribed') b.unsubscribed_at = e.created_at;
  }

  // Resolve contact emails
  const contactIds = (recipients ?? []).map((r) => r.contact_id);
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, email, name, tag, company')
    .in('id', contactIds.length > 0 ? contactIds : ['00000000-0000-0000-0000-000000000000']);
  const contactMap = new Map((contacts ?? []).map((c) => [c.id, c]));

  const csvRows = (recipients ?? []).map((r) => {
    const c = contactMap.get(r.contact_id);
    const b = byContact.get(r.contact_id);
    return {
      email: c?.email ?? '',
      name: c?.name ?? '',
      tag: c?.tag ?? '',
      company: c?.company ?? '',
      delivery_status: r.status,
      resend_id: r.resend_id ?? '',
      error: r.error ?? '',
      sent_at: r.created_at ?? '',
      delivered_at: b?.delivered_at ?? '',
      first_opened_at: b?.first_opened_at ?? '',
      last_opened_at: b?.last_opened_at ?? '',
      open_count: b?.open_count ?? 0,
      first_clicked_at: b?.first_clicked_at ?? '',
      click_count: b?.click_count ?? 0,
      bounced_at: b?.bounced_at ?? '',
      complained_at: b?.complained_at ?? '',
      unsubscribed_at: b?.unsubscribed_at ?? '',
    };
  });

  const csv = toCsv(csvRows);
  const safeName = (campaign.name || 'campaign').replace(/[^a-z0-9-_]+/gi, '_').slice(0, 50);
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `campaign_${safeName}_${stamp}.csv`;

  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}
