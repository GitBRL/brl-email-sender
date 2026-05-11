import Link from 'next/link';
import { createServiceClient } from '@/lib/supabase/server';
import { pct } from '@/lib/utils';
import { requireProfile } from '@/lib/auth';
import { SparkLine } from '@/components/charts/spark-line';
import { BarList } from '@/components/charts/bar-list';

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = createServiceClient();

  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceISO = since.toISOString();

  const [
    contactsAgg,
    campaignsAgg,
    recentRes,
    eventsRes,
  ] = await Promise.all([
    supabase.from('contacts').select('id, tag, status'),
    supabase.from('campaigns').select('*', { count: 'exact', head: true }).eq('status', 'sent'),
    supabase
      .from('campaigns')
      .select('id, name, subject, status, sent_at, total_recipients')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('email_events')
      .select('event_type, created_at')
      .gte('created_at', sinceISO),
  ]);

  const contacts = contactsAgg.data ?? [];
  const totalContacts = contacts.length;
  const subscribed = contacts.filter((c) => c.status === 'subscribed').length;
  const tagCounts = { hot: 0, warm: 0, cold: 0, untagged: 0 };
  for (const c of contacts) {
    if (c.tag === 'hot') tagCounts.hot++;
    else if (c.tag === 'warm') tagCounts.warm++;
    else if (c.tag === 'cold') tagCounts.cold++;
    else tagCounts.untagged++;
  }

  const events = eventsRes.data ?? [];
  const counts = { sent: 0, opened: 0, clicked: 0 };
  for (const e of events) {
    if (e.event_type === 'sent' || e.event_type === 'delivered') counts.sent++;
    else if (e.event_type === 'opened') counts.opened++;
    else if (e.event_type === 'clicked') counts.clicked++;
  }
  const openRate = pct(counts.opened, counts.sent);
  const ctr = pct(counts.clicked, counts.sent);

  // 30-day daily series for opens vs clicks
  const labels: string[] = [];
  const opens: number[] = [];
  const clicks: number[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    labels.push(`${d.getDate()}/${d.getMonth() + 1}`);
    opens.push(0);
    clicks.push(0);
  }
  const startMs = new Date();
  startMs.setDate(startMs.getDate() - 29);
  startMs.setHours(0, 0, 0, 0);
  for (const e of events) {
    const dayIdx = Math.floor(
      (new Date(e.created_at).getTime() - startMs.getTime()) / 86_400_000
    );
    if (dayIdx < 0 || dayIdx >= 30) continue;
    if (e.event_type === 'opened') opens[dayIdx]++;
    else if (e.event_type === 'clicked') clicks[dayIdx]++;
  }

  return (
    <div className="p-8 space-y-8 max-w-6xl">
      <header>
        <h1 className="text-2xl font-bold">Hello{profile.name ? `, ${profile.name}` : ''}</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Here&apos;s what&apos;s happening with your campaigns.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat
          label="Total contacts"
          value={String(totalContacts)}
          sub={`${subscribed.toLocaleString('pt-BR')} subscribed`}
        />
        <Stat label="Campaigns sent" value={String(campaignsAgg.count ?? 0)} sub="all-time" />
        <Stat label="Avg. open rate" value={`${openRate}%`} sub="last 30 days" />
        <Stat label="Avg. click-through" value={`${ctr}%`} sub="last 30 days" />
      </section>

      <section className="bg-white rounded-lg border border-zinc-200 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-4">
          Engagement — last 30 days
        </h2>
        <SparkLine
          labels={labels}
          series={[
            { name: 'Opens', color: '#10b981', data: opens },
            { name: 'Clicks', color: '#3b82f6', data: clicks },
          ]}
          height={200}
        />
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-white rounded-lg border border-zinc-200 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-4">
            Audience by tag
          </h2>
          <BarList
            items={[
              { label: 'Hot', value: tagCounts.hot, color: '#ef4444' },
              { label: 'Warm', value: tagCounts.warm, color: '#f59e0b' },
              { label: 'Cold', value: tagCounts.cold, color: '#3b82f6' },
              { label: 'Untagged', value: tagCounts.untagged, color: '#a1a1aa' },
            ].filter((i) => i.value > 0)}
            emptyMessage="No contacts yet."
          />
        </section>

        <section className="bg-white rounded-lg border border-zinc-200 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-4">
            Recent campaigns
          </h2>
          {(recentRes.data ?? []).length === 0 ? (
            <p className="text-sm text-zinc-500">
              No campaigns yet.{' '}
              <Link href="/campaigns/new" className="text-brl-orange underline">
                Create your first one →
              </Link>
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {recentRes.data!.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/campaigns/${c.id}`}
                    className="py-2.5 flex items-center justify-between text-sm hover:bg-zinc-50 -mx-2 px-2 rounded transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{c.name}</div>
                      <div className="text-zinc-500 text-xs truncate">{c.subject}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-zinc-500 text-xs tabular-nums">
                        {(c.total_recipients ?? 0).toLocaleString('pt-BR')}
                      </span>
                      <StatusBadge status={c.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {!profile.role || profile.role === 'viewer' ? (
        <p className="text-xs text-zinc-500">
          You currently have view-only access. An admin must elevate your role to send campaigns.
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-lg border border-zinc-200 p-5">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const style: Record<string, string> = {
    draft: 'bg-zinc-100 text-zinc-700',
    scheduled: 'bg-blue-50 text-blue-700',
    sending: 'bg-amber-50 text-amber-700',
    sent: 'bg-emerald-50 text-emerald-700',
    paused: 'bg-zinc-200 text-zinc-700',
    failed: 'bg-red-50 text-red-700',
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${style[status] ?? 'bg-zinc-100 text-zinc-700'}`}
    >
      {status}
    </span>
  );
}
