import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Download } from 'lucide-react';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { pct } from '@/lib/utils';
import { SendNowButton } from './_send-button';
import { CampaignRowActions } from '../_row-actions';
import { SparkLine } from '@/components/charts/spark-line';
import { BarList } from '@/components/charts/bar-list';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-zinc-100 text-zinc-700',
  scheduled: 'bg-blue-50 text-blue-700',
  sending: 'bg-amber-50 text-amber-700',
  sent: 'bg-emerald-50 text-emerald-700',
  paused: 'bg-zinc-200 text-zinc-700',
  failed: 'bg-red-50 text-red-700',
};

type EventRow = {
  event_type: string;
  link_id: string | null;
  contact_id: string | null;
  created_at: string;
};

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireProfile();
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!campaign) notFound();

  // Pull all events for this campaign — needed for both stats and time-series
  const { data: rawEvents } = await supabase
    .from('email_events')
    .select('event_type, link_id, contact_id, created_at')
    .eq('campaign_id', id)
    .order('created_at', { ascending: true });
  const events: EventRow[] = rawEvents ?? [];

  // ---- Counts (deduped per contact for engagement metrics) ----
  const counts = {
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    complained: 0,
    unsubscribed: 0,
  };
  const uniqueOpens = new Set<string>();
  const uniqueClicks = new Set<string>();
  for (const e of events) {
    if (e.event_type in counts) {
      (counts as Record<string, number>)[e.event_type]++;
    }
    if (e.event_type === 'opened' && e.contact_id) uniqueOpens.add(e.contact_id);
    if (e.event_type === 'clicked' && e.contact_id) uniqueClicks.add(e.contact_id);
  }
  const total = campaign.total_recipients || counts.sent || 1;
  const openRate = pct(uniqueOpens.size, total);
  const clickRate = pct(uniqueClicks.size, total);
  const ctr = uniqueOpens.size > 0 ? pct(uniqueClicks.size, uniqueOpens.size) : 0;

  // ---- Time series: bucket opens & clicks by hour or day after sent_at ----
  const sentAt = campaign.sent_at ? new Date(campaign.sent_at) : null;
  let timeSeriesLabels: string[] = [];
  let opensSeries: number[] = [];
  let clicksSeries: number[] = [];

  if (sentAt && events.length > 0) {
    const now = new Date();
    const ageHours = Math.max(1, (now.getTime() - sentAt.getTime()) / 3_600_000);
    // < 72h since send: hourly buckets, capped at 48
    // >= 72h: daily buckets
    const useHourly = ageHours <= 72;
    const bucketMs = useHourly ? 3_600_000 : 86_400_000;
    const lastEventTime = new Date(events[events.length - 1].created_at).getTime();
    const span = Math.max(bucketMs, lastEventTime - sentAt.getTime());
    const N = Math.min(useHourly ? 48 : 30, Math.ceil(span / bucketMs) + 1);

    opensSeries = new Array(N).fill(0);
    clicksSeries = new Array(N).fill(0);
    timeSeriesLabels = new Array(N).fill('').map((_, i) => {
      const t = new Date(sentAt.getTime() + i * bucketMs);
      return useHourly
        ? `${String(t.getHours()).padStart(2, '0')}:00`
        : `${t.getDate()}/${t.getMonth() + 1}`;
    });

    for (const e of events) {
      const idx = Math.floor((new Date(e.created_at).getTime() - sentAt.getTime()) / bucketMs);
      if (idx < 0 || idx >= N) continue;
      if (e.event_type === 'opened') opensSeries[idx]++;
      else if (e.event_type === 'clicked') clicksSeries[idx]++;
    }
  }

  // ---- Top clicked links (heatmap) ----
  const { data: trackedLinks } = await supabase
    .from('tracked_links')
    .select('id, original_url, click_count')
    .eq('campaign_id', id)
    .order('click_count', { ascending: false });

  const linkClickMap = new Map<string, number>();
  for (const e of events) {
    if (e.event_type === 'clicked' && e.link_id) {
      linkClickMap.set(e.link_id, (linkClickMap.get(e.link_id) ?? 0) + 1);
    }
  }

  const heatmapItems = (trackedLinks ?? [])
    .map((l) => ({
      label: prettyUrl(l.original_url),
      sub: l.original_url,
      value: linkClickMap.get(l.id) ?? l.click_count ?? 0,
      href: l.original_url,
    }))
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // ---- Problem recipients (bounces + complaints) ----
  const problemContactIds = new Set<string>();
  for (const e of events) {
    if ((e.event_type === 'bounced' || e.event_type === 'complained') && e.contact_id) {
      problemContactIds.add(e.contact_id);
    }
  }
  let problemContacts: Array<{
    id: string;
    email: string;
    name: string | null;
    type: 'bounced' | 'complained';
    when: string;
  }> = [];
  if (problemContactIds.size > 0) {
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, email, name')
      .in('id', Array.from(problemContactIds));
    const contactMap = new Map(contacts?.map((c) => [c.id, c]) ?? []);
    const seen = new Set<string>();
    for (const e of events) {
      if (
        (e.event_type === 'bounced' || e.event_type === 'complained') &&
        e.contact_id &&
        !seen.has(e.contact_id)
      ) {
        seen.add(e.contact_id);
        const c = contactMap.get(e.contact_id);
        if (c) {
          problemContacts.push({
            id: c.id,
            email: c.email,
            name: c.name,
            type: e.event_type as 'bounced' | 'complained',
            when: e.created_at,
          });
        }
      }
    }
    problemContacts = problemContacts.sort(
      (a, b) => new Date(b.when).getTime() - new Date(a.when).getTime()
    );
  }

  const canEdit = profile.role === 'admin' || profile.role === 'editor';
  const canDelete = profile.role === 'admin';

  return (
    <div className="p-8 max-w-6xl space-y-8">
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-brl-dark"
      >
        <ChevronLeft size={14} /> Back to campaigns
      </Link>

      <header className="flex items-start justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold truncate">{campaign.name}</h1>
          <p className="text-sm text-zinc-500 mt-1 truncate">{campaign.subject}</p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_STYLES[campaign.status]}`}
            >
              {campaign.status}
            </span>
            {campaign.sent_at && (
              <span className="text-xs text-zinc-500">
                sent {new Date(campaign.sent_at).toLocaleString('pt-BR')}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {campaign.status === 'sent' && (
            <a
              href={`/campaigns/${campaign.id}/export`}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50"
              title="Export recipients + per-email outcomes as CSV"
            >
              <Download size={14} /> Export CSV
            </a>
          )}
          {canEdit && campaign.status === 'draft' && <SendNowButton id={campaign.id} />}
          <CampaignRowActions id={campaign.id} name={campaign.name} canDelete={canDelete} />
        </div>
      </header>

      {/* Headline rates */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BigStat label="Open rate" value={`${openRate}%`} sub={`${uniqueOpens.size.toLocaleString('pt-BR')} unique opens`} accent="emerald" />
        <BigStat label="Click rate" value={`${clickRate}%`} sub={`${uniqueClicks.size.toLocaleString('pt-BR')} unique clicks`} accent="blue" />
        <BigStat label="Click-to-open" value={`${ctr}%`} sub="clicks ÷ opens" accent="zinc" />
      </section>

      {/* Funnel counts */}
      <section className="grid grid-cols-2 md:grid-cols-7 gap-3">
        <Stat label="Recipients" value={campaign.total_recipients} />
        <Stat label="Sent" value={counts.sent} />
        <Stat label="Delivered" value={counts.delivered} />
        <Stat label="Opens" value={counts.opened} />
        <Stat label="Clicks" value={counts.clicked} />
        <Stat label="Bounced" value={counts.bounced} flag={counts.bounced > 0 ? 'red' : undefined} />
        <Stat label="Complaints" value={counts.complained} flag={counts.complained > 0 ? 'red' : undefined} />
      </section>

      {/* Time series */}
      <section className="bg-white rounded-lg border border-zinc-200 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-4">
          Engagement over time
        </h2>
        {timeSeriesLabels.length > 0 ? (
          <SparkLine
            labels={timeSeriesLabels}
            series={[
              { name: 'Opens', color: '#10b981', data: opensSeries },
              { name: 'Clicks', color: '#3b82f6', data: clicksSeries },
            ]}
            height={220}
          />
        ) : (
          <p className="text-sm text-zinc-400 italic py-8 text-center">
            {campaign.status === 'sent'
              ? 'No engagement events recorded yet.'
              : 'Engagement chart will appear once the campaign is sent.'}
          </p>
        )}
      </section>

      {/* Heatmap of links */}
      <section className="bg-white rounded-lg border border-zinc-200 p-6">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Click heatmap — top links
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-400">
              {heatmapItems.length} link{heatmapItems.length === 1 ? '' : 's'}
            </span>
            {campaign.template_id && (
              <Link
                href={`/campaigns/${campaign.id}/heatmap`}
                className="text-xs font-medium text-brl-orange hover:underline"
              >
                View visual heatmap →
              </Link>
            )}
          </div>
        </div>
        <BarList
          items={heatmapItems}
          showRank
          emptyMessage={
            campaign.status === 'sent'
              ? 'No clicks recorded yet.'
              : 'Click data will appear once the campaign is sent and recipients engage.'
          }
        />
      </section>

      {/* Problem recipients */}
      {problemContacts.length > 0 && (
        <section className="bg-white rounded-lg border border-zinc-200 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-4">
            Bounces &amp; complaints
          </h2>
          <ul className="divide-y divide-zinc-100">
            {problemContacts.map((c) => (
              <li key={c.id} className="py-2 flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <Link href={`/contacts/${c.id}`} className="font-medium hover:underline truncate block">
                    {c.name || c.email}
                  </Link>
                  {c.name && <div className="text-xs text-zinc-500 truncate">{c.email}</div>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`text-[10px] uppercase font-medium px-2 py-0.5 rounded-full ${
                      c.type === 'bounced'
                        ? 'bg-red-50 text-red-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {c.type}
                  </span>
                  <span className="text-xs text-zinc-400 tabular-nums">
                    {new Date(c.when).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Settings */}
      <section className="bg-white rounded-lg border border-zinc-200 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-4">
          Settings
        </h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <Row label="From" value={`${campaign.from_name} <${campaign.from_email}>`} />
          {campaign.reply_to && <Row label="Reply-to" value={campaign.reply_to} />}
          <Row
            label="Sent at"
            value={campaign.sent_at ? new Date(campaign.sent_at).toLocaleString('pt-BR') : '—'}
          />
          <Row label="Audience filter" value={campaign.filter_tag ?? 'all tags'} />
          <Row
            label="Lists"
            value={campaign.list_ids?.length ? `${campaign.list_ids.length} list(s)` : 'all subscribed'}
          />
        </dl>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  flag,
}: {
  label: string;
  value: number;
  flag?: 'red';
}) {
  return (
    <div
      className={`bg-white border rounded-lg p-3 ${
        flag === 'red' ? 'border-red-200' : 'border-zinc-200'
      }`}
    >
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div
        className={`text-xl font-bold mt-1 tabular-nums ${
          flag === 'red' ? 'text-red-700' : ''
        }`}
      >
        {(value ?? 0).toLocaleString('pt-BR')}
      </div>
    </div>
  );
}

function BigStat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: 'emerald' | 'blue' | 'zinc';
}) {
  const accentClass =
    accent === 'emerald'
      ? 'text-emerald-600'
      : accent === 'blue'
        ? 'text-blue-600'
        : 'text-zinc-700';
  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-5">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`text-3xl font-bold mt-1 tabular-nums ${accentClass}`}>{value}</div>
      <div className="text-xs text-zinc-500 mt-1">{sub}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === '/' ? '' : u.pathname;
    return `${u.host}${path}`;
  } catch {
    return url;
  }
}
